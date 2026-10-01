"""Outbound relay; allowlisted local Reel Studio calls only."""
import concurrent.futures,json,os,sys,time,threading,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from relay import allowed
CONFIG=Path(os.environ.get('STUDIO_RELAY_CONFIG',str(Path.home()/'.config/haejja/relay.json')))
config=json.loads(CONFIG.read_text());BASE=config['url'];KEY=config['key'];LOCAL='http://127.0.0.1:8766'
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=4)
def request(path,data=None,headers=None,timeout=40):
 h={'Authorization':'Bearer '+KEY,**(headers or {})}
 r=urllib.request.Request(BASE+path,data=data,headers=h)
 return urllib.request.urlopen(r,timeout=timeout)
def process(j):
 try:
  if not allowed(j['path'],j['method']):raise ValueError('Rejected path')
  data=json.dumps(j['body'],ensure_ascii=False).encode() if j['method']=='POST' else None
  local='http://127.0.0.1:8767' if j['path'].startswith(('/api/food/','/food-media/')) else LOCAL
  req=urllib.request.Request(local+j['path'],data=data,headers={'Content-Type':'application/json'},method=j['method'])
  try:r=urllib.request.urlopen(req,timeout=1200)
  except urllib.error.HTTPError as e:r=e
  with r:
   mime=r.headers.get('Content-Type','application/json');code=r.status
   body=r.read(160*1024*1024+1)
   if len(body)>160*1024*1024:raise ValueError('영상 전송 한도 160MB를 초과했습니다.')
 except Exception as e:body=json.dumps({'error':str(e)},ensure_ascii=False).encode();mime='application/json';code=502
 try:
  with request('/bridge/result',body,{'X-Job-Id':j['id'],'X-Response-Status':str(code),'Content-Type':mime},180) as r:r.read()
 except Exception as e:print('결과 전달 실패:',type(e).__name__,flush=True)
def heartbeat():
 while True:
  try:
   with request('/bridge/heartbeat') as r:r.read()
  except Exception:pass
  time.sleep(10)
def main():
 threading.Thread(target=heartbeat,daemon=True).start()
 print('해짜 웹 연결 시작 · 종료하려면 Ctrl+C',flush=True)
 active=set()
 while True:
  active={f for f in active if not f.done()}
  if len(active)>=4:time.sleep(.2);continue
  try:
   with request('/bridge/next') as r:j=json.load(r).get('job')
   if j:active.add(POOL.submit(process,j))
  except Exception as e:print('웹 연결 대기:',type(e).__name__,flush=True);time.sleep(5)
if __name__=='__main__':main()
