import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
const line = "public/labs/line-list", pack = "public/labs/delivery-package";
for (const dir of [line, pack, `${pack}/faulty`, `${pack}/corrected`]) await mkdir(dir, { recursive: true });
const register = "Line number,From,To,Size,Piping class,Service\nL-001,TK-100,V-101,DN25,SS-A,N2\nL-002,V-101,PT-101,DN15,SS-A,N2\nL-003,PT-101,OUT-1,DN15,SS-A,N2\n";
await writeFile(`${line}/line-list.csv`, register);
await writeFile(`${line}/drawing-records-faulty.csv`, register.replace("DN25", "DN20").replace("V-101,PT-101", "V-101,PT-999").replace("L-003", "L-004"));
await writeFile(`${line}/drawing-records-corrected.csv`, register);
await writeFile(`${line}/README.txt`, `MST synthetic line-list exercise — 1 October 2026\n\nUpload line-list.csv and drawing-records-faulty.csv in Line List Check.\nMap all six fields. Expected: four findings: L-001 Size DN25 vs DN20;\nL-002 To PT-101 vs PT-999; L-003 absent from drawing records; L-004 absent\nfrom line list. The hypothetical release owner declares the line list\ncorrect. Load drawing-records-corrected.csv and expect zero discrepancies.\nIn real work, neither input is automatically authoritative. Obtain the\nactual scope/change decision before correcting a list. No drawing image,\nsizing check, unit conversion, connectivity or engineering approval is\nperformed. These are invented records, not a customer installation.\n\nhttps://mst-us.ai/tools/handbook/#line-lists\nMIT licence; see LICENSE.\n`);
await writeFile(`${pack}/manifest.csv`, "Filename,Document,Declared revision\nbracket-B.pdf,Bracket drawing,B\nbracket-B.step,Bracket model,B\nvalve-A.pdf,Valve drawing,A\n");
async function pdf(label) {
  const doc = await PDFDocument.create(); const date = new Date("2026-10-01T00:00:00Z");
  doc.setCreationDate(date); doc.setModificationDate(date); doc.setTitle(`MST teaching fixture: ${label}`);
  const font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([595, 420]);
  page.drawText(`MST sample package: ${label}`, { x: 40, y: 350, font, size: 18 });
  page.drawText("Synthetic filename/presence exercise. This is not an engineering drawing.", { x: 40, y: 310, font, size: 11 });
  return doc.save();
}
const bracket = await pdf("bracket B"), valve = await pdf("valve A");
await writeFile(`${pack}/faulty/bracket-B.pdf`, bracket);
await writeFile(`${pack}/faulty/bracket-B.step`, "");
await writeFile(`${pack}/faulty/notes.txt`, "Synthetic extra file: outside this exercise's delivery scope.\n");
await writeFile(`${pack}/corrected/bracket-B.pdf`, bracket);
await writeFile(`${pack}/corrected/valve-A.pdf`, valve);
await writeFile(`${pack}/corrected/bracket-B.step`, "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('MST presence-check teaching fixture: single point, not a part model'),'2;1');\nFILE_NAME('bracket-B.step','2026-10-01T00:00:00',('MST'),('MST'),'MST teaching fixture','MST','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n#1=CARTESIAN_POINT('Teaching point',(0.,0.,0.));\nENDSEC;\nEND-ISO-10303-21;\n");
await writeFile(`${pack}/README.txt`, `MST synthetic delivery-package exercise — 1 October 2026\n\n1. Extract the ZIP. Upload manifest.csv in Delivery Package Check.\n2. Use Choose files and select the three files INSIDE faulty/. Do not\n   select the ZIP, manifest, README or screenshots. Expected: 1 unique\n   non-empty match, 3 review items: empty bracket-B.step, missing\n   valve-A.pdf, extra notes.txt.\n3. Select the three files INSIDE corrected/. Expected: 3 unique non-empty\n   matches and no manifest discrepancies. Review and export the report.\n\nThe PDF files are teaching notices, not drawings. The STEP fixture\ncontains a single teaching point, not a bracket. This intentionally\ndemonstrates why non-empty matching filenames DO NOT prove deliverable\ncontents, actual revisions, native references or approval. The checker\nreads file metadata only. A separate engineering review is still needed.\nThe in-app sample uses synthetic size metadata; the downloadable files\nhave their own actual sizes and the same expected findings.\n\nFor Choose folder, prepare a manifest with paths relative to that folder,\ne.g. models/part.step. Duplicate basenames then remain distinguishable.\n\nhttps://mst-us.ai/tools/handbook/#delivery-package\nMIT licence; see LICENSE.\n`);
