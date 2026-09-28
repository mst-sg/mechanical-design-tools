#!/usr/bin/env python3
"""Build the reproducible, source-owned exercise bundle after assets are rendered."""
from pathlib import Path
import hashlib,zipfile
root=Path(__file__).resolve().parents[1];lab=root/'public/labs/drawing-bom'
for name in ['bracket-bom.svg','bracket-bom.png','bracket-bom.pdf']:(lab/name).write_bytes((root/'public/samples'/name).read_bytes())
(lab/'LICENSE').write_bytes((root/'LICENSE').read_bytes())
(lab/'handbook.html').write_text((root/'public/handbook/index.html').read_text().replace('src="/tools/labs/drawing-bom/', 'src="').replace('href="/tools/labs/drawing-bom/', 'href="').replace('href="drawing-bom-lab.zip"', 'href="https://mst-us.ai/tools/labs/drawing-bom/drawing-bom-lab.zip"').replace('href="/','href="https://mst-us.ai/').replace('src="/','src="https://mst-us.ai/'))
files=sorted(p for p in lab.iterdir() if p.is_file() and p.suffix!='.zip' and p.name!='SHA256SUMS')
(lab/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in files))
with zipfile.ZipFile(lab/'drawing-bom-lab.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[lab/'SHA256SUMS']:
  info=zipfile.ZipInfo('drawing-bom-lab/'+p.name,(2026,9,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())
print('Packed',len(files)+1,'exercise files')

# Small structured-data exercises share the same integrity and licensing contract.
for slug in ['connection-check', 'model-handoff']:
 lab=root/'public/labs'/slug
 (lab/'LICENSE').write_bytes((root/'LICENSE').read_bytes())
 files=sorted(p for p in lab.iterdir() if p.is_file() and p.suffix!='.zip' and p.name!='SHA256SUMS')
 (lab/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in files))
 with zipfile.ZipFile(lab/(slug+'-lab.zip'),'w',zipfile.ZIP_DEFLATED) as z:
  for p in files+[lab/'SHA256SUMS']:
   info=zipfile.ZipInfo(slug+'-lab/'+p.name,(2026,9,28,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())
 print('Packed',slug,len(files)+1,'exercise files')
