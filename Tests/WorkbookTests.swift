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
        let scopeRails = (2...13).map { Rail(position: $0, name: "Rail \($0)", titles: [], dynamic: false) }
        let ranged = try railsForPositions("5-10", rails: scopeRails)
        let listed = try railsForPositions("5,7-8,7", rails: scopeRails)
        precondition(ranged.map(\.position) == [5,6,7,8,9,10], "Use Column A positions, not worksheet row numbers")
        precondition(listed.map(\.position) == [5,7,8], "Deduplicate overlapping selections")
        for input in ["", "0", "8-5", "5.5", "99", "5,99", "5;8"] {
            do { _ = try railsForPositions(input, rails: scopeRails); fatalError("Invalid scope accepted") } catch {}
        }
        let planned = try selectedCarouselOrder(["Top 10 in the U.S.", "B", "Other", "Other", "A", "Tail"], rails: [Rail(position: 3, name: "A", titles: [], dynamic: false), Rail(position: 5, name: "B", titles: [], dynamic: false)])
        precondition(planned == ["Top 10 in the U.S.", "Other", "A", "Other", "B", "Tail"], "Keep unselected relative order and duplicates")
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
