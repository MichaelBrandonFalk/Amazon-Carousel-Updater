import AppKit
import WebKit
import UniformTypeIdentifiers

let defaultStorefront = "https://slate.amazon.com/merchandising/ui/amzn1.dv.channel.8356bff5-1b7d-403a-a116-5ae64b5cfe14.US/storefront/overview"
let reservedRail = "Top 10 in the U.S."

@MainActor
final class AppController: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var table = NSTableView()
    var fileLabel = NSTextField(wrappingLabelWithString: "No workbook selected")
    var sheetPopup = NSPopUpButton()
    var mode = NSSegmentedControl(labels: ["Full Update", "Order Only"], trackingMode: .selectOne, target: nil, action: nil)
    var startButton = NSButton()
    var stopButton = NSButton()
    var publishButton = NSButton()
    var importButton = NSButton()
    var openButton = NSButton()
    var settingsButton = NSButton()
    var sessionLabel = NSTextField(labelWithString: "Open Slate to sign in")
    var statusLabel = NSTextField(wrappingLabelWithString: "Select your weekly workbook")
    var logView = NSTextView()
    var progress = NSProgressIndicator()
    var sheets: [RailSheet] = []
    var selectedSheet: RailSheet? { sheets.indices.contains(sheetPopup.indexOfSelectedItem) ? sheets[sheetPopup.indexOfSelectedItem] : nil }
    var statuses: [String: String] = [:]
    var workbookName = ""
    var logs: [String] = []
    var busy = false
    var cancelled = false
    var stagedOrder: [String]?
    var completedRails = 0
    var unresolved: [String] = []
    var currentTask: Task<Void, Never>?
    var driver = ""
    var selfTest = CommandLine.arguments.contains("--self-test")
    var storefront: String {
        if selfTest { return "https://fixture.invalid/storefront/overview" }
        return UserDefaults.standard.string(forKey: "storefrontURL") ?? defaultStorefront
    }
    var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            guard let scriptURL = Bundle.main.url(forResource: "slate_driver", withExtension: "js") else { throw AppFailure("The app is missing its browser driver. Download a fresh release.") }
            driver = try String(contentsOf: scriptURL, encoding: .utf8)
            buildMenus()
            if let logoURL = Bundle.main.url(forResource: "app-logo", withExtension: "png"), let logo = NSImage(contentsOf: logoURL) {
                NSApp.applicationIconImage = logo
            }
            buildWindow()
            NSApp.activate(ignoringOtherApps: true)
            if selfTest {
                Task { await runBrowserSelfTest() }
            } else {
                let arguments = CommandLine.arguments
                if let index = arguments.firstIndex(of: "--workbook"), arguments.indices.contains(index + 1) { loadWorkbook(URL(fileURLWithPath: arguments[index + 1])) }
                openSlate()
            }
        } catch { showError(error); NSApp.terminate(nil) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func application(_ application: NSApplication, open urls: [URL]) { if let url = urls.first { loadWorkbook(url) } }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard busy else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "Quit during an update?"
        alert.informativeText = "Carousel saves already submitted to Amazon cannot be undone by quitting. The current save may still finish."
        alert.addButton(withTitle: "Keep Running")
        alert.addButton(withTitle: "Quit")
        return alert.runModal() == .alertSecondButtonReturn ? .terminateNow : .terminateCancel
    }

    func buildMenus() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Amazon Carousel Updater", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Amazon Carousel Updater", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let fileItem = NSMenuItem(), fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "Open Workbook…", action: #selector(chooseWorkbook), keyEquivalent: "o")
        fileMenu.addItem(withTitle: "Export Run Report…", action: #selector(exportReport), keyEquivalent: "s")
        fileItem.submenu = fileMenu; menu.addItem(fileItem)
        let editItem = NSMenuItem(), editMenu = NSMenu(title: "Edit")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        editItem.submenu = editMenu; menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    func makeButton(_ title: String, symbol: String, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
        button.imagePosition = .imageLeading
        button.toolTip = title
        return button
    }

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1420, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Amazon Carousel Updater V\(version)"
        window.minSize = NSSize(width: 1100, height: 720)
        window.center()
        let root = NSView(); window.contentView = root
        let sidebar = NSStackView()
        sidebar.orientation = .vertical; sidebar.alignment = .leading; sidebar.spacing = 12
        sidebar.edgeInsets = NSEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        sidebar.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(sidebar)
        let heading = NSTextField(labelWithString: "Amazon Carousel Updater")
        heading.font = .systemFont(ofSize: 20, weight: .semibold)
        let brand = NSStackView(); brand.spacing = 10; brand.alignment = .centerY
        if let logoURL = Bundle.main.url(forResource: "app-logo", withExtension: "png"), let logo = NSImage(contentsOf: logoURL) {
            let logoView = NSImageView(image: logo)
            logoView.imageScaling = .scaleProportionallyUpOrDown
            logoView.widthAnchor.constraint(equalToConstant: 44).isActive = true
            logoView.heightAnchor.constraint(equalToConstant: 44).isActive = true
            brand.addArrangedSubview(logoView)
        }
        brand.addArrangedSubview(heading)
        sidebar.addArrangedSubview(brand)
        let versionLabel = NSTextField(labelWithString: "V\(version)  •  Pure Flix / Amazon Slate")
        versionLabel.font = .systemFont(ofSize: 11); versionLabel.textColor = .secondaryLabelColor
        sidebar.addArrangedSubview(versionLabel)
        importButton = makeButton("Choose Workbook…", symbol: "doc.badge.plus", action: #selector(chooseWorkbook))
        sidebar.addArrangedSubview(importButton)
        fileLabel.font = .systemFont(ofSize: 12); fileLabel.maximumNumberOfLines = 2; sidebar.addArrangedSubview(fileLabel)
        sheetPopup.target = self; sheetPopup.action = #selector(sheetChanged)
        sheetPopup.addItem(withTitle: "No worksheet"); sheetPopup.isEnabled = false
        sidebar.addArrangedSubview(sheetPopup)
        mode.selectedSegment = 0; sidebar.addArrangedSubview(mode)
        let timing = NSTextField(wrappingLabelWithString: "Full Update saves each carousel immediately. Publish Order applies the final storefront order.")
        timing.font = .systemFont(ofSize: 11); timing.textColor = .secondaryLabelColor
        sidebar.addArrangedSubview(timing)
        table.headerView = NSTableHeaderView()
        for (id, title, width) in [("position", "A", 28.0), ("name", "Carousel", 176.0), ("status", "Status", 115.0)] {
            let col = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(id)); col.title = title; col.width = width; table.addTableColumn(col)
        }
        table.rowHeight = 29; table.usesAlternatingRowBackgroundColors = true; table.dataSource = self; table.delegate = self
        table.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        let tableScroll = NSScrollView(); tableScroll.documentView = table; tableScroll.hasVerticalScroller = true; tableScroll.borderType = .bezelBorder
        sidebar.addArrangedSubview(tableScroll)
        tableScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 210).isActive = true
        tableScroll.heightAnchor.constraint(equalToConstant: 290).isActive = true
        let actions = NSStackView(); actions.spacing = 8
        startButton = makeButton("Run Update", symbol: "play.fill", action: #selector(startUpdate))
        stopButton = makeButton("Stop", symbol: "stop.fill", action: #selector(stopUpdate)); stopButton.isEnabled = false
        actions.addArrangedSubview(startButton); actions.addArrangedSubview(stopButton); sidebar.addArrangedSubview(actions)
        publishButton = makeButton("Publish Order…", symbol: "icloud.and.arrow.up", action: #selector(publishOrder)); publishButton.isEnabled = false
        sidebar.addArrangedSubview(publishButton)
        progress.style = .bar; progress.isIndeterminate = false; progress.minValue = 0; progress.maxValue = 100; sidebar.addArrangedSubview(progress)
        statusLabel.font = .systemFont(ofSize: 12, weight: .medium); statusLabel.maximumNumberOfLines = 3; sidebar.addArrangedSubview(statusLabel)
        logView.isEditable = false; logView.isSelectable = true; logView.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        logView.textContainerInset = NSSize(width: 8, height: 8)
        let logScroll = NSScrollView(); logScroll.documentView = logView; logScroll.hasVerticalScroller = true; logScroll.borderType = .bezelBorder
        sidebar.addArrangedSubview(logScroll); logScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 90).isActive = true
        let export = makeButton("Export Report…", symbol: "square.and.arrow.up", action: #selector(exportReport)); sidebar.addArrangedSubview(export)
        let browserPanel = NSView(); browserPanel.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(browserPanel)
        let toolbar = NSStackView(); toolbar.spacing = 8; toolbar.translatesAutoresizingMaskIntoConstraints = false
        openButton = makeButton("Open Slate", symbol: "globe", action: #selector(openSlate))
        settingsButton = makeButton("Storefront…", symbol: "gearshape", action: #selector(setStorefront))
        toolbar.addArrangedSubview(openButton)
        let back = makeButton("", symbol: "chevron.left", action: #selector(goBack)); back.toolTip = "Back"
        toolbar.addArrangedSubview(back)
        let refresh = makeButton("", symbol: "arrow.clockwise", action: #selector(refreshPage)); refresh.toolTip = "Reload"
        toolbar.addArrangedSubview(refresh)
        sessionLabel.font = .systemFont(ofSize: 11); sessionLabel.textColor = .secondaryLabelColor
        sessionLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        toolbar.addArrangedSubview(sessionLabel); toolbar.addArrangedSubview(settingsButton)
        browserPanel.addSubview(toolbar)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false; browserPanel.addSubview(webView)
        NSLayoutConstraint.activate([
            sidebar.leadingAnchor.constraint(equalTo: root.leadingAnchor), sidebar.topAnchor.constraint(equalTo: root.topAnchor), sidebar.bottomAnchor.constraint(equalTo: root.bottomAnchor), sidebar.widthAnchor.constraint(equalToConstant: 390),
            browserPanel.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor), browserPanel.trailingAnchor.constraint(equalTo: root.trailingAnchor), browserPanel.topAnchor.constraint(equalTo: root.topAnchor), browserPanel.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            toolbar.leadingAnchor.constraint(equalTo: browserPanel.leadingAnchor, constant: 12), toolbar.trailingAnchor.constraint(equalTo: browserPanel.trailingAnchor, constant: -12), toolbar.topAnchor.constraint(equalTo: browserPanel.topAnchor, constant: 12), toolbar.heightAnchor.constraint(equalToConstant: 32),
            webView.leadingAnchor.constraint(equalTo: browserPanel.leadingAnchor), webView.trailingAnchor.constraint(equalTo: browserPanel.trailingAnchor), webView.topAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: 12), webView.bottomAnchor.constraint(equalTo: browserPanel.bottomAnchor)
        ])
        for item in [fileLabel, sheetPopup, mode, timing, tableScroll, progress, statusLabel, logScroll] { item.widthAnchor.constraint(equalTo: sidebar.widthAnchor, constant: -36).isActive = true }
        window.makeKeyAndOrderFront(nil)
        updateControls()
    }

    func numberOfRows(in tableView: NSTableView) -> Int { selectedSheet?.rails.count ?? 0 }
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard let rail = selectedSheet?.rails[row] else { return nil }
        let label = NSTextField(labelWithString: "")
        label.font = .systemFont(ofSize: 11)
        switch tableColumn?.identifier.rawValue {
        case "position": label.stringValue = String(rail.position)
        case "name": label.stringValue = rail.name
        default:
            label.stringValue = statuses[rail.name] ?? (rail.skipContent ? "Order only" : "\(rail.titles.count) titles")
            if label.stringValue == "Saved" { label.textColor = .systemGreen }
            if label.stringValue.contains("Unresolved") { label.textColor = .systemRed }
        }
        label.lineBreakMode = .byTruncatingTail
        label.toolTip = rail.titles.joined(separator: "\n")
        return label
    }

    @objc func chooseWorkbook() {
        guard !busy else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [UTType(filenameExtension: "xlsx")!]; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in if response == .OK, let url = panel.url { self.loadWorkbook(url) } }
    }
    func loadWorkbook(_ url: URL) {
        guard !busy else { return }
        do {
            let values = try WorkbookReader(url: url).sheets()
            sheets = values; workbookName = url.lastPathComponent
            fileLabel.stringValue = workbookName
            sheetPopup.removeAllItems(); sheetPopup.addItems(withTitles: values.map(\.name)); sheetPopup.isEnabled = true
            sheetChanged()
            log("Loaded \(workbookName). Workbook cells are used only as data.")
        } catch { showError(error) }
    }
    @objc func sheetChanged() {
        statuses = [:]; stagedOrder = nil; completedRails = 0; unresolved = []
        table.reloadData(); statusLabel.stringValue = "\(selectedSheet?.rails.count ?? 0) rails • Top 10 stays first"
        updateControls()
    }
    @objc func openSlate() { guard !busy, let url = URL(string: storefront) else { return }; webView.load(URLRequest(url: url)) }
    @objc func goBack() { if !busy { webView.goBack() } }
    @objc func refreshPage() { if !busy { webView.reload() } }
    @objc func setStorefront() {
        guard !busy else { return }
        let alert = NSAlert(); alert.messageText = "Slate storefront"
        let field = NSTextField(string: storefront); field.frame = NSRect(x: 0, y: 0, width: 580, height: 24)
        alert.accessoryView = field; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn {
            guard let url = URL(string: field.stringValue), url.scheme == "https", url.host == "slate.amazon.com", url.path.hasSuffix("/storefront/overview"), url.query == nil, url.fragment == nil, url.user == nil else { showError(AppFailure("Use an HTTPS slate.amazon.com storefront/overview URL.")); return }
            UserDefaults.standard.set(url.absoluteString, forKey: "storefrontURL"); stagedOrder = nil; updateControls(); openSlate()
        }
    }
    @objc func showAbout() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Amazon Carousel Updater", .applicationVersion: "V\(version)", .credits: NSAttributedString(string: "Independent utility. Not affiliated with Amazon.\nStandalone AppKit + WebKit; no Codex or API key required.")]) }

    func updateControls() {
        startButton.isEnabled = !busy && selectedSheet != nil
        stopButton.isEnabled = busy
        importButton.isEnabled = !busy; sheetPopup.isEnabled = !busy && !sheets.isEmpty; mode.isEnabled = !busy
        openButton.isEnabled = !busy; settingsButton.isEnabled = !busy
        publishButton.isEnabled = !busy && stagedOrder != nil
    }
    func log(_ message: String) {
        logs.append(message)
        logView.string = logs.joined(separator: "\n")
        logView.scrollToEndOfDocument(nil)
    }
    func showError(_ error: Error) {
        let alert = NSAlert(); alert.messageText = "Update needs attention"; alert.informativeText = error.localizedDescription
        alert.alertStyle = .warning; alert.addButton(withTitle: "OK"); alert.runModal()
    }
    func checkCancelled() throws { if cancelled { throw AppFailure("Stopped. Saves already submitted to Amazon remain applied.") } }
    func pause(_ milliseconds: UInt64) async throws { try checkCancelled(); try await Task.sleep(nanoseconds: milliseconds * 1_000_000); try checkCancelled() }

    func call(_ command: String, _ input: [String: Any] = [:]) async throws -> [String: Any] {
        if command != "cancel" { try checkCancelled() }
        guard selfTest || webView.url?.host == "slate.amazon.com" else { throw AppFailure("Sign in to Amazon in the app browser, then open the Slate storefront before running.") }
        if !selfTest, let target = URL(string: storefront) {
            let prefix = target.path.replacingOccurrences(of: "storefront/overview", with: "")
            guard webView.url?.path.hasPrefix(prefix) == true else { throw AppFailure("The browser is on a different storefront. Open the selected storefront before running.") }
        }
        let body = driver + "\nreturn JSON.stringify(await window.ACU[command](input));"
        let value: Any?
        do {
            value = try await webView.callAsyncJavaScript(body, arguments: ["command": command, "input": input], in: nil, contentWorld: .page)
        } catch {
            let detail = (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription
            throw AppFailure("\(command): \(detail)")
        }
        guard let json = value as? String, let data = json.data(using: .utf8), let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AppFailure("Slate returned an unreadable browser response.") }
        return result
    }
    func waitForState(_ flag: String, timeout: TimeInterval = 30) async throws -> [String: Any] {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            try checkCancelled()
            if let state = try? await call("state"), state[flag] as? Bool == true { return state }
            try await pause(250)
        }
        throw AppFailure("Slate did not finish loading \(flag). Check the browser and retry.")
    }
    func openEditor(_ rail: Rail) async throws {
        _ = try await waitForState("overview")
        _ = try await call("open", ["name": rail.name])
        let state = try await waitForState("editor")
        let actualName = state["editorName"] as? String ?? ""
        guard normalized(actualName) == normalized(rail.name) else { throw AppFailure("Opened \(actualName), expected \(rail.name).") }
        _ = try await call("resume")
    }
    func returnToOverview() async throws {
        if let state = try? await call("state"), state["overview"] as? Bool == true { return }
        _ = try await call("overview")
        _ = try await waitForState("overview")
    }

    @objc func startUpdate() {
        guard !busy, let sheet = selectedSheet else { return }
        let full = mode.selectedSegment == 0
        if full {
            let alert = NSAlert(); alert.messageText = "Save carousel content to Amazon?"
            alert.informativeText = "Update \(sheet.rails.filter { !$0.skipContent }.count) eligible carousel lists from \(sheet.name). Missing titles will be added and existing titles preserved. Each carousel's Schedule action saves immediately to this storefront. The final carousel order has a separate Publish Order step."
            alert.addButton(withTitle: "Run Full Update"); alert.addButton(withTitle: "Cancel")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        busy = true; cancelled = false; stagedOrder = nil; completedRails = 0; unresolved = []; statuses = [:]; updateControls()
        currentTask = Task {
            do {
                _ = try await call("resume")
                let initial = try await waitForState("overview", timeout: 10)
                let initialOrder = initial["order"] as? [String] ?? []
                try verifyTargetNames(sheet.rails, existing: initialOrder)
                // Save content first: carousel scheduling may otherwise discard an Overview order draft.
                if full {
                    for (index, rail) in sheet.rails.enumerated() {
                        try checkCancelled()
                        statusLabel.stringValue = "\(index + 1)/\(sheet.rails.count): \(rail.name)"
                        if rail.skipContent { statuses[rail.name] = "Order only"; log("\(rail.name): content skipped.") }
                        else { try await updateContent(rail) }
                        progress.doubleValue = Double(index + 1) / Double(sheet.rails.count) * 85
                        table.reloadData()
                    }
                }
                try await returnToOverview()
                let target = [reservedRail] + sheet.rails.map(\.name)
                try await stageOrder(target)
                let state = try await call("state")
                let pending = state["publishEnabled"] as? Bool == true
                stagedOrder = pending ? target : nil
                progress.doubleValue = 100
                statusLabel.stringValue = pending ? "Content verified • Order ready to publish" : "Complete • Order already matches"
                if !unresolved.isEmpty { statusLabel.stringValue += " • \(unresolved.count) unresolved" }
                log(pending ? "Final order verified in the editor. Click Publish Order to apply it." : "No storefront order changes needed.")
            } catch {
                statusLabel.stringValue = cancelled ? "Stopped" : "Needs attention"
                log(error.localizedDescription)
                if !cancelled { showError(error) }
            }
            busy = false; updateControls()
        }
    }

    func verifyTargetNames(_ rails: [Rail], existing: [String]) throws {
        for name in [reservedRail] + rails.map(\.name) {
            guard existing.filter({ normalized($0) == normalized(name) }).count == 1 else { throw AppFailure("Cannot match one existing carousel named \(name). No content has been changed.") }
        }
    }
    func resolveExisting(_ target: String, pins: [String]) -> String? {
        let aliases = ["whc": "When Hope Calls", "iggyandmrkrik": "Iggy and Mr. Kirk", "acindereallachristmasball": "A Cinderella Christmas Ball", "watchmaker": "Ainsley McGregor Mysteries: A Case for the Watchmaker", "athousandtomorrows": "Karen Kingsburys A Thousand Tomorrows"]
        let canonical = aliases[normalized(target)] ?? target
        if let exact = pins.first(where: { normalized($0) == normalized(canonical) }) { return exact }
        func base(_ value: String) -> String {
            normalized(value.replacingOccurrences(of: "[\\s:,-]+season\\s*\\d+.*$", with: "", options: .regularExpression.union(.caseInsensitive)))
        }
        // A sheet series without a season preserves the first matching season already on this rail.
        return pins.first(where: { base($0) == normalized(canonical) })
    }
    func updateContent(_ rail: Rail) async throws {
        statuses[rail.name] = "Checking"; table.reloadData()
        try await openEditor(rail)
        let before = try await call("pins")["pins"] as? [String] ?? []
        var targets: [String] = []
        var additions: [String] = []
        for title in rail.titles {
            if let resolved = resolveExisting(title, pins: before) {
                targets.append(resolved)
                if normalized(resolved) != normalized(title) { log("\(rail.name): \(title) → \(resolved)") }
            } else {
                let result = try await call("search", ["title": title])
                let matches = result["matches"] as? [[String: Any]] ?? []
                guard matches.count == 1, let match = matches.first?["title"] as? String else {
                    let message = "\(rail.name): no unique catalog match for \(title); carousel left unchanged."
                    unresolved.append(message); log(message); statuses[rail.name] = "Unresolved"
                    _ = try await call("clearSearch"); try await returnToOverview(); return
                }
                targets.append(match); additions.append(match)
            }
        }
        if Array(before.prefix(targets.count)) == targets {
            statuses[rail.name] = "Already correct"; log("\(rail.name): already correct.")
            _ = try await call("clearSearch"); try await returnToOverview(); return
        }
        guard Set(targets.map(normalized)).count == targets.count else { throw AppFailure("Two workbook titles resolve to the same catalog title on \(rail.name).") }
        statuses[rail.name] = "Updating"; table.reloadData()
        for title in additions {
            let search = try await call("search", ["title": title])
            guard (search["matches"] as? [[String: Any]])?.count == 1 else { throw AppFailure("Search changed for \(title). No carousel was saved.") }
            _ = try await call("choose", ["title": title])
            log("\(rail.name): added \(title).")
        }
        _ = try await call("clearSearch")
        for (index, title) in targets.enumerated() { _ = try await call("moveTitle", ["title": title, "position": index]) }
        let after = try await call("pins")["pins"] as? [String] ?? []
        guard Array(after.prefix(targets.count)) == targets, preservesExtras(before: before, after: after, targets: targets) else { throw AppFailure("Title order or preservation check failed on \(rail.name). No carousel was saved.") }
        _ = try await call("publishCarousel")
        _ = try await waitForState("dialog")
        _ = try await call("schedule", ["position": rail.position])
        _ = try await waitForState("overview", timeout: 60)
        try await openEditor(rail)
        let saved = try await call("pins")["pins"] as? [String] ?? []
        guard Array(saved.prefix(targets.count)) == targets, preservesExtras(before: before, after: saved, targets: targets) else { throw AppFailure("Saved titles did not verify on \(rail.name). Check the carousel in Slate.") }
        completedRails += 1; statuses[rail.name] = "Saved"
        log("\(rail.name): saved and verified (Column A position \(rail.position)).")
        try await returnToOverview()
    }
    func preservesExtras(before: [String], after: [String], targets: [String]) -> Bool {
        var counts: [String: Int] = [:]
        for title in after { counts[title, default: 0] += 1 }
        for title in before { counts[title, default: 0] -= 1; if counts[title, default: 0] < 0 { return false } }
        let targetSet = Set(targets)
        return before.filter { !targetSet.contains($0) } == after.filter { !targetSet.contains($0) }
    }

    func stageOrder(_ target: [String]) async throws {
        var order = try await call("order")["order"] as? [String] ?? []
        guard normalized(order.first ?? "") == normalized(reservedRail) else { throw AppFailure("Top 10 is not first. Place it first manually before running.") }
        for (index, name) in target.enumerated().dropFirst() {
            var moves = 0
            while let source = order.firstIndex(where: { normalized($0) == normalized(name) }), source > index {
                try checkCancelled()
                guard moves < order.count else { throw AppFailure("Reorder did not converge for \(name).") }
                order = try await call("moveRail", ["name": name, "position": index])["order"] as? [String] ?? []
                moves += 1
            }
            guard order.indices.contains(index), normalized(order[index]) == normalized(name) else { throw AppFailure("Could not place \(name) in the expected storefront slot.") }
        }
        log("Storefront order staged. Extra rails preserved after the sheet rails.")
    }
    @objc func stopUpdate() {
        cancelled = true
        webView.evaluateJavaScript("window.ACUCancelled = true")
        statusLabel.stringValue = "Stopping after current action…"
    }
    @objc func publishOrder() {
        guard !busy, let target = stagedOrder else { return }
        let alert = NSAlert(); alert.messageText = "Publish storefront order?"
        alert.informativeText = "Apply this carousel order to the current Amazon Slate storefront:\n\n" + target.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n") + "\n\nExtra existing rails remain below these."
        alert.addButton(withTitle: "Publish Order"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        busy = true; cancelled = false; updateControls()
        Task {
            do {
                let current = try await call("order")["order"] as? [String] ?? []
                guard Array(current.prefix(target.count)).map(normalized) == target.map(normalized) else { throw AppFailure("The order changed since verification. Run the update again before publishing.") }
                _ = try await call("publishStorefront")
                statusLabel.stringValue = "Publishing • checking saved order…"
                try await pause(8000)
                webView.reload()
                try await pause(1200)
                let fresh = try await waitForState("overview", timeout: 30)
                let saved = fresh["order"] as? [String] ?? []
                guard Array(saved.prefix(target.count)).map(normalized) == target.map(normalized) else {
                    stagedOrder = nil
                    throw AppFailure("Slate did not retain the requested order after publishing and reloading. Content saves remain applied. The app has stopped; it will not repeatedly publish.")
                }
                stagedOrder = nil; statusLabel.stringValue = "Published • saved order verified"
                log("Published successfully. Verified storefront order after reload.")
            } catch { log(error.localizedDescription); statusLabel.stringValue = "Publish not verified"; showError(error) }
            busy = false; updateControls()
        }
    }
    @objc func exportReport() {
        let panel = NSSavePanel(); panel.allowedContentTypes = [.plainText]; panel.nameFieldStringValue = "carousel-update-report.txt"
        panel.beginSheetModal(for: window) { response in
            if response == .OK, let url = panel.url {
                do { try self.report().write(to: url, atomically: true, encoding: .utf8) } catch { self.showError(error) }
            }
        }
    }
    func report() -> String {
        "Amazon Carousel Updater V\(version)\nWorkbook: \(workbookName)\nSheet: \(selectedSheet?.name ?? "")\nSaved carousels: \(completedRails)\nStatus: \(statusLabel.stringValue)\n\n" + logs.joined(separator: "\n") + "\n"
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let host = webView.url?.host ?? ""
        sessionLabel.stringValue = host == "slate.amazon.com" ? "Amazon Slate • Private session" : host.contains("amazon.") ? "Amazon sign-in • Complete login here" : (selfTest ? "Synthetic Slate test" : host)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if selfTest { decisionHandler(.allow); return }
        let host = url.host?.lowercased() ?? ""
        let allowed = url.scheme == "https" && (host == "amazon.com" || host.hasSuffix(".amazon.com"))
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { log("Blocked navigation outside the Amazon browser session.") }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "https", let host = url.host, host == "amazon.com" || host.hasSuffix(".amazon.com") { webView.load(URLRequest(url: url)) }
        return nil
    }
}

@main
struct CarouselUpdaterMain {
    @MainActor static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        let controller = AppController()
        application.delegate = controller
        application.run()
    }
}
