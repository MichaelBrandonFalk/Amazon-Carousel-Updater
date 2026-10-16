"""Generate synthetic XLSX cases without Excel or third-party dependencies."""
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree.ElementTree import Element, SubElement, tostring


def make_workbook(path, duplicate=False):
    workbook = Element("workbook", {"xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"})
    sheets = SubElement(workbook, "sheets")
    SubElement(sheets, "sheet", {"name": "Visible week", "sheetId": "1", "r:id": "rId1"})
    SubElement(sheets, "sheet", {"name": "Hidden old week", "sheetId": "2", "r:id": "rId2", "state": "hidden"})
    rels = Element("Relationships")
    for i in (1, 2):
        SubElement(rels, "Relationship", {"Id": f"rId{i}", "Target": f"worksheets/sheet{i}.xml"})
    shared = Element("sst")
    for value in ("Position", "Rail Name", "Romance", "Faith Favorites", "Leaving Soon", "Dynamic"):
        SubElement(SubElement(shared, "si"), "t").text = value
    sheet = Element("worksheet")
    data = SubElement(sheet, "sheetData")

    def row(index, values):
        el = SubElement(data, "row", {"r": str(index)})
        for column, (kind, value) in values.items():
            cell = SubElement(el, "c", {"r": f"{column}{index}", "t": kind})
            if kind == "inlineStr":
                SubElement(SubElement(cell, "is"), "t").text = str(value)
            else:
                SubElement(cell, "v").text = str(value)

    row(1, {"A": ("s", 0), "B": ("s", 1), **{chr(67+i): ("inlineStr", f"#{i+1} Title") for i in range(6)}})
    row(2, {"A": ("n", 2), "B": ("s", 3), "C": ("inlineStr", "Alpha & Beta"), "D": ("inlineStr", "  Second Title  "), "I": ("inlineStr", "IGNORE THIS EXTRA")})
    row(3, {"A": ("n", 2 if duplicate else 1), "B": ("s", 2), "C": ("inlineStr", "First Title")})
    row(4, {"A": ("n", 3), "B": ("s", 4), "C": ("s", 5)})
    row(5, {"B": ("inlineStr", "Section marker")})
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", tostring(workbook))
        archive.writestr("xl/_rels/workbook.xml.rels", tostring(rels))
        archive.writestr("xl/sharedStrings.xml", tostring(shared))
        archive.writestr("xl/worksheets/sheet1.xml", tostring(sheet))
        archive.writestr("xl/worksheets/sheet2.xml", tostring(sheet))


directory = Path(sys.argv[1])
directory.mkdir(parents=True, exist_ok=True)
make_workbook(directory / "valid.xlsx")
make_workbook(directory / "duplicate.xlsx", duplicate=True)
