import AppKit
import WebKit

extension AppController {
    func runBrowserSelfTest() async {
        do {
            guard let fixture = Bundle.main.url(forResource: "slate_fixture", withExtension: "html") else { throw AppFailure("Missing synthetic fixture") }
            webView.loadFileURL(fixture, allowingReadAccessTo: fixture.deletingLastPathComponent())
            _ = try await waitForState("overview")
            guard !webView.configuration.websiteDataStore.isPersistent else { throw AppFailure("Tests must use a private browser session") }
            _ = try await webView.evaluateJavaScript("window.fixtureRowHandle=true;renderEditor('Romance')")
            _ = try await call("moveTitle", ["title": "Existing A", "position": 1])
            guard (try await webView.evaluateJavaScript("window.fixtureRemoveAttempts || 0")) as? Int == 0 else { throw AppFailure("A nested Remove button was selected instead of the drag handle") }
            _ = try await webView.evaluateJavaScript("window.fixtureRowHandle=false")
            _ = try await webView.evaluateJavaScript("renderEditor('Romance');window.fixtureStealFocus=true")
            var focusProtected = false
            do { _ = try await call("moveTitle", ["title": "Existing A", "position": 1]) }
            catch { focusProtected = error.localizedDescription.contains("Focus left") }
            guard focusProtected, (try await webView.evaluateJavaScript("window.fixtureRemoveAttempts || 0")) as? Int == 0 else { throw AppFailure("Lost keyboard focus was not safely rejected") }
            _ = try await webView.evaluateJavaScript("window.fixtureStealFocus=false;renderOverview()")
            let romance = Rail(position: 1, name: "Romance", titles: ["Target One", "Target Two", "Target Three", "Target Four", "Target Five", "Target Six"], dynamic: false)
            let collection = Rail(position: 2, name: "Faith Favorites", titles: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"], dynamic: false)
            let unresolvedRail = Rail(position: 3, name: "Unresolved rail", titles: ["Missing Catalog Title"], dynamic: false)
            sheets = [RailSheet(name: "Synthetic weekly sheet", rails: [romance, collection, unresolvedRail])]
            workbookName = "synthetic-workbook.xlsx"; fileLabel.stringValue = workbookName
            sheetPopup.removeAllItems(); sheetPopup.addItem(withTitle: "Synthetic weekly sheet"); table.reloadData()
            try await updateContent(unresolvedRail)
            _ = try await webView.evaluateJavaScript("renderEditor('Romance')")
            try await returnToOverview()
            try await updateContent(romance)
            try await updateContent(collection)
            guard completedRails == 2, unresolved.count == 1 else { throw AppFailure("Expected two verified saves and one unresolved rail") }
            guard (try await webView.evaluateJavaScript("window.fixtureTrustedKeys > 0")) as? Bool == true else { throw AppFailure("Title moves did not use native browser keyboard input") }
            let target = [reservedRail, "Romance", "Faith Favorites", "Unresolved rail"]
            try await stageOrder(target)
            _ = try await call("publishStorefront")
            webView.reload()
            try await pause(500)
            let saved = try await waitForState("overview")
            guard Array((saved["order"] as? [String] ?? []).prefix(target.count)) == target else { throw AppFailure("Published order did not persist in fixture") }
            let checkData = try await webView.evaluateJavaScript("JSON.stringify({saved:data.saved,inclusions:document.querySelectorAll('.title-inclusions').length,published:data.published})") as? String ?? ""
            guard checkData.contains("\"published\":1"), checkData.contains("\"position\":1"), checkData.contains("\"position\":2") else { throw AppFailure("Scheduling positions or publish count did not verify") }
            guard preservesExtras(before: ["A", "B", "B"], after: ["C", "A", "B", "B"], targets: ["C"]), !preservesExtras(before: ["A", "B", "B"], after: ["C", "A", "B"], targets: ["C"]) else { throw AppFailure("Duplicate-title preservation check failed") }
            table.reloadData()
            progress.doubleValue = 100; statusLabel.stringValue = "Self-test passed • saves, preservation, search, ordering"
            log("SELF-TEST PASS: query + collection editors, exact search/add, keyboard reorder, original-title preservation, unresolved-title skip, Column A positions, publish and reload.")
            print("SELF-TEST PASS")
            updateControls()
            if !CommandLine.arguments.contains("--keep-open") { NSApp.terminate(nil) }
        } catch {
            print("SELF-TEST FAIL: \(error.localizedDescription)")
            statusLabel.stringValue = "Self-test failed"; log(error.localizedDescription)
            if !CommandLine.arguments.contains("--keep-open") { exit(1) }
        }
    }
}
