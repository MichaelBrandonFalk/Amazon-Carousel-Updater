import AppKit
import WebKit

extension AppController {
    func runBrowserSelfTest() async {
        do {
            guard let fixture = Bundle.main.url(forResource: "slate_fixture", withExtension: "html") else { throw AppFailure("Missing synthetic fixture") }
            webView.loadFileURL(fixture, allowingReadAccessTo: fixture.deletingLastPathComponent())
            _ = try await waitForState("overview")
            let originalDocument = try await call("state")["documentID"] as? String
            try await freshOverview()
            guard try await call("state")["documentID"] as? String != originalDocument else { throw AppFailure("Fresh-run navigation reused the old page") }
            testOnly = true
            var saveBlocked = false
            do { _ = try await call("publishCarousel") }
            catch { saveBlocked = error.localizedDescription.contains("Saving is blocked") }
            testOnly = false
            guard saveBlocked else { throw AppFailure("Workbook test mode did not block saves") }
            _ = try await webView.evaluateJavaScript("renderEditor('Romance')")
            let seasonResult = try await call("search", ["title": "Seasoned Show"])
            guard seasonResult["matchType"] as? String == "season1", (seasonResult["matches"] as? [[String: Any]])?.first?["title"] as? String == "Seasoned Show - Season 1" else { throw AppFailure("Unique Season 1 fallback did not resolve") }
            _ = try await call("choose", ["title": "Seasoned Show - Season 1"])
            let exactResult = try await call("search", ["title": "Exact Show"])
            guard exactResult["matchType"] as? String == "exact" else { throw AppFailure("Exact title did not take precedence") }
            let ambiguous = try await call("search", ["title": "Ambiguous Show"])
            guard (ambiguous["matches"] as? [[String: Any]])?.isEmpty == true else { throw AppFailure("Ambiguous Season 1 was accepted") }
            let explicit = try await call("search", ["title": "Seasoned Show Season 3"])
            guard (explicit["matches"] as? [[String: Any]])?.isEmpty == true else { throw AppFailure("Explicit season was silently substituted") }
            _ = try await webView.evaluateJavaScript("window.fixtureNumericOriginal=data.pins['Faith Favorites'];data.pins['Faith Favorites']=['5,000 Synthetic Stars','2026','Alpha','Beta','Gamma','Delta'];renderEditor('Faith Favorites')")
            let numericPins = try await call("pins")["pins"] as? [String] ?? []
            guard Array(numericPins.prefix(2)) == ["5,000 Synthetic Stars", "2026"] else { throw AppFailure("Numeric title names lost their leading digits") }
            _ = try await call("moveTitle", ["title": "5,000 Synthetic Stars", "position": 1])
            _ = try await webView.evaluateJavaScript("data.pins['Faith Favorites']=window.fixtureNumericOriginal;renderOverview()")
            guard !webView.configuration.websiteDataStore.isPersistent else { throw AppFailure("Tests must use a private browser session") }
            _ = try await webView.evaluateJavaScript("window.fixtureRowHandle=true;window.fixtureTransientDrop=true;window.fixtureAvailabilityNote=true;renderEditor('Romance')")
            _ = try await call("prepareTitleMove", ["title": "Existing A", "position": 1])
            guard (try await webView.evaluateJavaScript("document.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100}))")) as? Bool == false else { throw AppFailure("Wheel input was not blocked during a move") }
            _ = try await call("endTitleMove")
            guard (try await webView.evaluateJavaScript("document.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100}))")) as? Bool == true else { throw AppFailure("Input was not restored after a move") }
            _ = try await call("moveTitle", ["title": "Existing A", "position": 1])
            guard (try await webView.evaluateJavaScript("window.fixtureTransientCount > 0")) as? Bool == true else { throw AppFailure("Delayed full-list rendering was not exercised") }
            let baseline = try await call("pins")["pins"] as? [String] ?? []
            guard baseline.contains("Existing B") else { throw AppFailure("Availability warning or hidden decoration became part of the title") }
            let valid = try await call("titleCheck", ["before": baseline, "targets": Array(baseline.prefix(2))])
            guard valid["ok"] as? Bool == true else { throw AppFailure("Stable title list failed validation") }
            let invalid = try await call("titleCheck", ["before": baseline + ["Missing synthetic title"], "targets": ["Wrong synthetic title"]])
            guard invalid["ok"] as? Bool == false, (invalid["detail"] as? String ?? "").contains("missing titles/copies: Missing synthetic title") else { throw AppFailure("Missing-title diagnostics did not verify") }
            _ = try await webView.evaluateJavaScript("window.fixtureTransientDrop=false")
            _ = try await webView.evaluateJavaScript("window.fixtureCorruptDrop=true")
            var corruptionRejected = false
            do { _ = try await call("moveTitle", ["title": "Existing A", "position": 0]) }
            catch { corruptionRejected = error.localizedDescription.contains("first difference at slot") && error.localizedDescription.contains("Unexpected synthetic title") }
            guard corruptionRejected else { throw AppFailure("Changed title was not rejected with a precise row diagnostic") }
            _ = try await webView.evaluateJavaScript("window.fixtureCorruptDrop=false;renderEditor('Romance')")
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
            let unresolvedRail = Rail(position: 3, name: "Unresolved rail", titles: ["Three", "Missing Catalog Title", "One"], dynamic: false)
            sheets = [RailSheet(name: "Synthetic weekly sheet", rails: [romance, collection, unresolvedRail])]
            workbookName = "synthetic-workbook.xlsx"; fileLabel.stringValue = workbookName
            sheetPopup.removeAllItems(); sheetPopup.addItem(withTitle: "Synthetic weekly sheet"); table.reloadData()
            try await updateContent(unresolvedRail)
            _ = try await webView.evaluateJavaScript("renderEditor('Romance')")
            try await returnToOverview()
            try await updateContent(romance)
            try await updateContent(collection)
            guard completedRails == 3, unresolved.count == 1 else { throw AppFailure("Expected three verified saves including one partial update") }
            guard (try await webView.evaluateJavaScript("window.fixtureTrustedKeys > 0")) as? Bool == true else { throw AppFailure("Title moves did not use native browser keyboard input") }
            let target = [reservedRail, "Romance", "Faith Favorites", "Unresolved rail"]
            try await stageOrder(target)
            _ = try await webView.evaluateJavaScript("window.fixturePublishDelay=9000")
            _ = try await call("publishStorefront")
            webView.reload()
            try await pause(500)
            let saved = try await waitForState("overview")
            guard Array((saved["order"] as? [String] ?? []).prefix(target.count)) == target else { throw AppFailure("Published order did not persist in fixture") }
            let checkData = try await webView.evaluateJavaScript("JSON.stringify({saved:data.saved,inclusions:document.querySelectorAll('.title-inclusions').length,published:data.published})") as? String ?? ""
            guard checkData.contains("\"published\":1"), checkData.contains("\"position\":1"), checkData.contains("\"position\":2") else { throw AppFailure("Scheduling positions or publish count did not verify") }
            guard preservesExtras(before: ["A", "B", "B"], after: ["C", "A", "B", "B"], targets: ["C"]), !preservesExtras(before: ["A", "B", "B"], after: ["C", "A", "B"], targets: ["C"]) else { throw AppFailure("Duplicate-title preservation check failed") }
            let html = try htmlReport()
            guard html.contains("Titles not added"), html.contains("Missing Catalog Title"), html.contains("Season 1 selections") else { throw AppFailure("Readable HTML report did not include skipped-title detail") }
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
