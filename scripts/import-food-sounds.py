"""Package every provided catalog asset; original audio stays private to the helper."""
import argparse,concurrent.futures,hashlib,json,shutil,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--library-root',type=Path,required=True);parser.add_argument('--ffprobe',default='ffprobe');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];lib=args.library_root;source=json.loads((lib/'library/sound-effects/홍님 효과음/catalog.json').read_text());assets=source['assets'];dest=root/'server/food-sounds';dest.mkdir(exist_ok=True)
def package(a):
 path=lib/a['file'];sha=hashlib.sha256(path.read_bytes()).hexdigest()
 if sha!=a['sha256']:raise ValueError('Source hash mismatch: '+a['name'])
 uid='sound-'+hashlib.sha256((sha+a['file']).encode()).hexdigest()[:20];name=uid+path.suffix.lower();shutil.copy2(path,dest/name)
 duration=float(subprocess.check_output([args.ffprobe,'-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)]))
 return {'id':uid,'name':a['name'],'category':a['category'],'sourceDuration':round(duration,4),'duration':round(min(.7,duration),4),'file':'server/food-sounds/'+name,'sha256':sha}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(package,assets))
policy=json.loads((lib/'policies/sound-effects.json').read_text());presets=[]
for kind,d in policy['defaults'].items():
 original=next((s for s in rows if s['sha256']==d['source']['sha256']),None)
 presets.append({'id':kind,'name':d['name']+' (기본 짧은 편집본)','category':'기본 프리셋','sourceDuration':d['duration'],'duration':d['duration'],'file':'public/food-sfx/'+kind+'.wav','sha256':d['sha256'],'originalId':original['id'] if original else None})
(root/'public/food-sfx/catalog.json').write_text(json.dumps({'source':'사용자 제공 홍님 효과음 전체 라이브러리','count':len(rows),'sounds':rows,'presets':presets},ensure_ascii=False,indent=2))
print(json.dumps({'packaged':len(rows),'bytes':sum((root/r['file']).stat().st_size for r in rows),'categories':len(set(r['category'] for r in rows))}))
