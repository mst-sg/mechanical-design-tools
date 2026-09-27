#!/usr/bin/env python3
"""Read-only traffic snapshot through an existing gh login; keep output private."""
import argparse
import datetime as dt
import json
import re
import subprocess
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('repository',help='OWNER/REPO')
parser.add_argument('--output',type=Path,required=True,help='New private JSON file outside the public repository')
args=parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repository):parser.error('Expected OWNER/REPO')
root=Path(__file__).resolve().parents[1]
if args.output.resolve().is_relative_to(root):parser.error('Choose a private output path outside the repository')
report={'schema':1,'repository':args.repository,'captured_at':dt.datetime.now(dt.timezone.utc).isoformat(),'window':'GitHub rolling 14 days; daily rows use UTC','metrics':{}}
for name,endpoint in [('views','views?per=day'),('clones','clones?per=day'),('popular_paths','popular/paths'),('referrers','popular/referrers')]:
    response=subprocess.run(['gh','api',f'repos/{args.repository}/traffic/{endpoint}'],capture_output=True,text=True)
    if response.returncode:
        raise SystemExit('GitHub traffic read failed for '+name+'. Check repository access with gh; no partial snapshot was saved.')
    report['metrics'][name]=json.loads(response.stdout)
report['interpretation']=['Repository views are not site visits.','Clones may include CI and automated fetches; they do not prove tool use.','Do not sum overlapping rolling totals or daily unique counts as unique people.','For 28-day counts retain snapshots weekly, deduplicate by repository/metric/UTC date, and exclude the current incomplete UTC day. Missing dates outside the API window stay unknown.']
args.output.parent.mkdir(parents=True,exist_ok=True)
with args.output.open('x') as stream:json.dump(report,stream,indent=2);stream.write('\n')
args.output.chmod(0o600)
print(json.dumps({'repository':args.repository,'output':str(args.output),'views':report['metrics']['views']['count'],'clones':report['metrics']['clones']['count']}))
