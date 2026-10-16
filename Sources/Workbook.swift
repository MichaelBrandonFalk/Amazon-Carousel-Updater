import Foundation

struct AppFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct Rail: Codable {
    let position: Int
    let name: String
    let titles: [String]
    let dynamic: Bool
    var skipContent: Bool { dynamic || titles.isEmpty || normalized(name) == "leavingsoon" }
}

struct RailSheet {
    let name: String
    let rails: [Rail]
}

func normalized(_ value: String) -> String {
    value.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
}

private final class XMLReader: NSObject, XMLParserDelegate {
    var start: ((String, [String: String]) -> Void)?
    var end: ((String) -> Void)?
    var characters: ((String) -> Void)?
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName: String?, attributes attributeDict: [String: String]) { start?(elementName, attributeDict) }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName: String?) { end?(elementName) }
    func parser(_ parser: XMLParser, foundCharacters string: String) { characters?(string) }
    func parse(_ data: Data) throws {
        let parser = XMLParser(data: data)
        parser.shouldResolveExternalEntities = false
        parser.delegate = self
        guard parser.parse() else { throw AppFailure("Invalid workbook XML: \(parser.parserError?.localizedDescription ?? "unknown error")") }
    }
}

final class WorkbookReader {
    private let url: URL
    private var entries = Set<String>()
    init(url: URL) { self.url = url }

    private func unzip(_ args: [String], limit: Int = 32_000_000) throws -> Data {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        task.arguments = args
        let output = Pipe(), errors = Pipe()
        task.standardOutput = output
        task.standardError = errors
        try task.run()
        var data = Data()
        while let chunk = try output.fileHandleForReading.read(upToCount: 65536), !chunk.isEmpty {
            data.append(chunk)
            if data.count > limit { task.terminate(); task.waitUntilExit(); throw AppFailure("Workbook XML exceeds the supported size.") }
        }
        task.waitUntilExit()
        guard task.terminationStatus == 0 else { throw AppFailure("Cannot read this .xlsx workbook. Save it as an unencrypted Excel workbook and try again.") }
        return data
    }

    private func read(_ path: String) throws -> Data {
        guard entries.contains(path), !path.contains("..") else { throw AppFailure("Workbook component is missing or unsafe: \(path)") }
        return try unzip(["-p", url.path, path])
    }

    func sheets() throws -> [RailSheet] {
        guard url.pathExtension.lowercased() == "xlsx" else { throw AppFailure("Choose an .xlsx workbook.") }
        let fileSize = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard fileSize < 25_000_000 else { throw AppFailure("Choose a workbook smaller than 25 MB.") }
        let listing = try unzip(["-Z1", url.path], limit: 2_000_000)
        entries = Set(String(decoding: listing, as: UTF8.self).split(separator: "\n").map(String.init))
        var relationships: [String: String] = [:]
        let relParser = XMLReader()
        relParser.start = { name, attrs in
            if name == "Relationship", attrs["TargetMode"] != "External", let id = attrs["Id"], let target = attrs["Target"] {
                relationships[id] = target.hasPrefix("/") ? String(target.dropFirst()) : "xl/" + target
            }
        }
        try relParser.parse(read("xl/_rels/workbook.xml.rels"))
        var visibleSheets: [(String, String)] = []
        let workbookParser = XMLReader()
        workbookParser.start = { name, attrs in
            if name == "sheet", attrs["state", default: "visible"] == "visible", let title = attrs["name"], let id = attrs["r:id"], let path = relationships[id] { visibleSheets.append((title, path)) }
        }
        try workbookParser.parse(read("xl/workbook.xml"))
        var strings: [String] = []
        if entries.contains("xl/sharedStrings.xml") {
            let parser = XMLReader()
            var collecting = false, text = "", inText = false
            parser.start = { name, _ in
                if name == "si" { collecting = true; text = "" }
                if name == "t" { inText = true }
            }
            parser.characters = { if collecting && inText { text += $0 } }
            parser.end = { name in
                if name == "t" { inText = false }
                if name == "si" { strings.append(text); collecting = false }
            }
            try parser.parse(read("xl/sharedStrings.xml"))
        }
        var result: [RailSheet] = []
        for (name, path) in visibleSheets {
            let rows = try parseRows(read(path), strings: strings)
            if let rails = try railRows(rows, sheetName: name), !rails.isEmpty { result.append(RailSheet(name: name, rails: rails)) }
        }
        guard !result.isEmpty else { throw AppFailure("No visible worksheet has Position and Rail Name headers.") }
        return result
    }

    private func parseRows(_ data: Data, strings: [String]) throws -> [[Int: String]] {
        let parser = XMLReader()
        var rows: [[Int: String]] = [], row: [Int: String] = [:]
        var column = 0, type = "", value = "", inline = "", capture = "", formula = false
        parser.start = { name, attrs in
            if name == "row" { row = [:] }
            if name == "c" {
                column = 0
                for c in attrs["r", default: ""].uppercased().utf8 where c >= 65 && c <= 90 { column = column * 26 + Int(c - 64) }
                type = attrs["t", default: ""]; value = ""; inline = ""; formula = false
            }
            if name == "f" { formula = true }
            if name == "v" || name == "t" { capture = name }
        }
        parser.characters = { text in
            if capture == "v" { value += text }
            if capture == "t" { inline += text }
        }
        parser.end = { name in
            if name == "v" || name == "t" { capture = "" }
            if name == "c" {
                var text = type == "inlineStr" ? inline : value
                if type == "s", let index = Int(value), strings.indices.contains(index) { text = strings[index] }
                // Cached formula values are data; formulas themselves are never executed.
                if formula && text.isEmpty { text = "" }
                row[column] = text.replacingOccurrences(of: "\u{00a0}", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if name == "row" { rows.append(row) }
        }
        try parser.parse(data)
        return rows
    }

    private func railRows(_ rows: [[Int: String]], sheetName: String) throws -> [Rail]? {
        guard let headerIndex = rows.firstIndex(where: { row in row.values.contains(where: { $0.lowercased() == "position" }) && row.values.contains(where: { $0.lowercased() == "rail name" }) }) else { return nil }
        let header = rows[headerIndex]
        let positionColumn = header.first(where: { $0.value.lowercased() == "position" })!.key
        let railColumn = header.first(where: { $0.value.lowercased() == "rail name" })!.key
        let titleColumns = header.keys.sorted().filter { col in
            header[col, default: ""].range(of: "^(?:#\\s*\\d+\\s*)?title$", options: .regularExpression.union(.caseInsensitive)) != nil
        }.prefix(6)
        var rails: [Rail] = [], usedPositions = Set<Int>(), usedNames = Set<String>()
        for row in rows.dropFirst(headerIndex + 1) {
            let name = row[railColumn, default: ""]
            let positionText = row[positionColumn, default: ""]
            let titles = titleColumns.map { row[$0, default: ""] }.filter { !$0.isEmpty }
            if name.isEmpty || (positionText.isEmpty && titles.isEmpty) { continue }
            guard let number = Double(positionText), number.isFinite, number >= 1, number <= 1000, number.rounded() == number else { throw AppFailure("\(sheetName): invalid position for \(name).") }
            let position = Int(number)
            guard usedPositions.insert(position).inserted, usedNames.insert(normalized(name)).inserted else { throw AppFailure("\(sheetName): duplicate position or rail name at \(name).") }
            if normalized(name) == normalized("Top 10 in the U.S.") { continue }
            let dynamic = titles.count == 1 && titles[0].lowercased() == "dynamic"
            if !dynamic && Set(titles.map(normalized)).count != titles.count { throw AppFailure("\(name) has duplicate leading title targets.") }
            rails.append(Rail(position: position, name: name, titles: dynamic ? [] : titles, dynamic: dynamic))
        }
        return rails.sorted { $0.position < $1.position }
    }
}
