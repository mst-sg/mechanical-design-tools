"""Independent OOXML readback for generated test downloads; no authoring."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", ns)]
    result = {}
    for key, path in [("BOM", "xl/worksheets/sheet1.xml"), ("Source and review", "xl/worksheets/sheet2.xml")]:
        cells = {}
        for cell in ET.fromstring(archive.read(path)).findall(".//s:c", ns):
            assert cell.find("s:f", ns) is None, "Unexpected formula in drawing export"
            value = cell.find("s:v", ns)
            if value is None:
                continue
            cells[cell.attrib["r"]] = strings[int(value.text)] if cell.attrib.get("t") == "s" else float(value.text)
        result[key] = cells
    print(json.dumps(result, ensure_ascii=False))
