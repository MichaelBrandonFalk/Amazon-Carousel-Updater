import Foundation

@main
struct WorkbookTests {
    static func main() throws {
        let folder = URL(fileURLWithPath: CommandLine.arguments[1])
        let sheets = try WorkbookReader(url: folder.appendingPathComponent("valid.xlsx")).sheets()
        precondition(sheets.count == 1, "Hidden sheets must not be offered")
        let rails = sheets[0].rails
        precondition(rails.map(\.position) == [1, 2, 3], "Positions must sort numerically")
        precondition(rails[0].name == "Romance", "Shared string names must resolve")
        precondition(rails[1].titles == ["Alpha & Beta", "Second Title"], "Inline XML, whitespace, declared title limit")
        precondition(rails[2].dynamic && rails[2].skipContent, "Dynamic rails must skip content edits")
        do {
            _ = try WorkbookReader(url: folder.appendingPathComponent("duplicate.xlsx")).sheets()
            fatalError("Duplicate positions must be rejected")
        } catch { precondition(error.localizedDescription.contains("duplicate")) }
        if CommandLine.arguments.count > 2 {
            let actual = try WorkbookReader(url: URL(fileURLWithPath: CommandLine.arguments[2])).sheets()
            print("Local workbook: \(actual.count) usable sheet(s), \(actual[0].rails.count) rails; values not exported")
        }
        print("WORKBOOK TESTS PASS")
    }
}
