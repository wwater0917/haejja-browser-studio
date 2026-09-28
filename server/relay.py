"""Authenticated outbound Mac relay. No inbound port, shell commands or arbitrary URLs."""
import base64, hashlib, hmac, json, os, queue, re, secrets, tempfile, threading, time
from pathlib import Path
KEY=os.environ.get('RELAY_WORKER_KEY','')
ROOT=Path(tempfile.mkdtemp(prefix='studio-relay-'))
JOBS={};QUEUE=queue.Queue(maxsize=30);LOCK=threading.Lock();LAST_SEEN=0;PAIR_ATTEMPTS=[];TRANSFERS=[];MAX_BYTES=900*1024*1024
def digest(label):return hmac.new(KEY.encode(),label.encode(),hashlib.sha256).hexdigest()
def client_key():return digest('studio-client-v1')
def pair_code():return digest('pair-'+time.strftime('%Y-%m-%d',time.gmtime()))[:12].upper()
def allowed(path,method):
 if method=='GET':return bool(path in {'/api/projects','/api/sfx-library','/api/fonts','/api/development','/api/health'} or re.fullmatch(r'/api/(project|timeline)/[A-Za-z0-9_-]{1,80}',path) or re.fullmatch(r'/media/[A-Za-z0-9_-]{1,80}/(source/source\.mp4|output/reel-[0-9a-f]{12}\.mp4|voice/voice-[0-9a-f]{20}\.(mp3|wav|aiff))',path))
 return method=='POST' and path in {'/api/new','/api/run','/api/save','/api/layout-preview','/api/voice-preview','/api/sfx-preview','/api/retranslate','/api/sfx-arrange'}
def auth(h,worker=False):
 token=h.headers.get('Authorization','').removeprefix('Bearer ')
 return bool(KEY) and hmac.compare_digest(token,KEY if worker else client_key())
def clean():
 now=time.time()
 with LOCK:
  for k,j in list(JOBS.items()):
   if now-j['created']>(3600 if j.get('file') else 1200):
    if j.get('file'):Path(j['file']).unlink(missing_ok=True)
    JOBS.pop(k,None)
def enqueue(path,method='GET',body=None):
 if not allowed(path,method):raise ValueError('허용되지 않은 제작 요청입니다.')
 clean()
 with LOCK:
  if sum(j['status'] in {'queued','running'} for j in JOBS.values())>=20:raise ValueError('작업 대기열이 가득 찼습니다.')
  key=secrets.token_urlsafe(24);JOBS[key]={'id':key,'path':path,'method':method,'body':body,'status':'queued','created':time.time()}
  QUEUE.put_nowait(key)
 return key

def handle(h):
 global LAST_SEEN
 from urllib.parse import urlparse,parse_qs
 u=urlparse(h.path);path=u.path
 if not path.startswith('/bridge/'):return False
 def reply(d,n=200):h.json(d,n);return True
 if not KEY:return reply({'error':'맥 연결을 준비 중입니다.'},503)
 if path=='/bridge/pair' and h.command=='POST':
  with LOCK:
   now=time.time();PAIR_ATTEMPTS[:]=[t for t in PAIR_ATTEMPTS if now-t<60]
   if len(PAIR_ATTEMPTS)>=5:return reply({'error':'잠시 후 다시 연결하세요.'},429)
   PAIR_ATTEMPTS.append(now)
  d=read_json(h,1000)
  if not hmac.compare_digest(str(d.get('code','')).strip().upper(),pair_code()):return reply({'error':'연결 코드를 확인하세요.'},401)
  return reply({'token':client_key()})
 worker=path in {'/bridge/next','/bridge/result','/bridge/heartbeat'}
 # Media tickets are short-lived, bound to one completed asset.
 if path in {'/bridge/file','/bridge/save'}:
  q=parse_qs(u.query);key=q.get('id',[''])[0];exp=q.get('expires',[''])[0];sig=q.get('sig',[''])[0]
  if not exp.isdigit() or int(exp)<time.time() or not hmac.compare_digest(sig,digest('file:'+key+':'+exp)):return reply({'error':'다운로드 링크가 만료됐습니다.'},403)
  j=JOBS.get(key)
  if not j or j['status']!='done' or not j.get('file'):return reply({'error':'파일이 만료됐습니다. 다시 열어 주세요.'},404)
  if path=='/bridge/save':
   body=(Path(__file__).parent/'save-video.html').read_bytes()
   h.send_response(200);h.send_header('Content-Type','text/html; charset=utf-8');h.send_header('Content-Length',str(len(body)));h.send_header('Referrer-Policy','no-referrer');h.end_headers();h.wfile.write(body);return True
  return serve_file(h,Path(j['file']),j['mime'],q.get('download',[''])[0]=='1')
 if not auth(h,worker):return reply({'error':'맥 연결 코드를 입력하세요.'},401)
 if path=='/bridge/heartbeat':
  clean();LAST_SEEN=time.time();return reply({'online':True})
 if path=='/bridge/status':return reply({'online':time.time()-LAST_SEEN<40,'lastSeen':LAST_SEEN})
 if path=='/bridge/next' and h.command=='GET':
  LAST_SEEN=time.time()
  try:
   key=QUEUE.get(timeout=15);j=JOBS.get(key)
   if not j:return reply({'job':None})
   j['status']='running';return reply({'job':{k:j[k] for k in ('id','path','method','body')}})
  except queue.Empty:return reply({'job':None})
 if path=='/bridge/request' and h.command=='POST':
  d=read_json(h,1000000)
  if time.time()-LAST_SEEN>=40:return reply({'error':'맥 제작기가 오프라인입니다. 맥에서 웹 연결 시작을 실행하세요.','code':'MAC_OFFLINE'},409)
  return reply({'job':enqueue(d.get('path',''),d.get('method','GET'),d.get('body'))},202)
 if path=='/bridge/result' and h.command=='POST':
  key=h.headers.get('X-Job-Id','');j=JOBS.get(key)
  if not j or j['status']!='running':return reply({'error':'만료된 작업입니다.'},404)
  n=int(h.headers.get('Content-Length','0'))
  if not 0<n<=160*1024*1024:return reply({'error':'파일 크기를 확인하세요.'},413)
  mime=h.headers.get('Content-Type','application/octet-stream');code=int(h.headers.get('X-Response-Status','500'))
  if mime.startswith('application/json'):
   if n>2000000:return reply({'error':'응답이 너무 큽니다.'},413)
   j.update(data=json.loads(h.rfile.read(n)),code=code,status='done')
  else:
   dest=ROOT/key;left=n
   with dest.open('wb') as f:
    while left:
     b=h.rfile.read(min(262144,left))
     if not b:dest.unlink(missing_ok=True);raise ValueError('전송 중 연결이 끊겼습니다.')
     f.write(b);left-=len(b)
   j.update(file=str(dest),mime=mime,code=code,status='done')
  return reply({'received':True})
 if path.startswith('/bridge/jobs/'):
  key=path.rsplit('/',1)[-1];j=JOBS.get(key)
  if not j:return reply({'error':'작업이 만료됐습니다.'},404)
  d={'status':j['status']}
  if j['status']=='done':
   d.update(code=j['code'],data=j.get('data'))
   if j.get('file'):
    exp=str(int(time.time()+1800));d['file']='/bridge/file?id='+key+'&expires='+exp+'&sig='+digest('file:'+key+':'+exp)
  return reply(d)
 return reply({'error':'찾을 수 없습니다.'},404)

def read_json(h,limit):
 n=int(h.headers.get('Content-Length','0'))
 if not 0<n<=limit:raise ValueError('요청 크기를 확인하세요.')
 return json.loads(h.rfile.read(n))
def serve_file(h,path,mime,download=False):
 size=path.stat().st_size;start=0;end=size-1;partial=False
 if h.headers.get('Range'):
  m=re.fullmatch(r'bytes=(\d+)-(\d*)',h.headers['Range'])
  if not m:h.json({'error':'invalid range'},416);return True
  start=int(m[1]);end=min(int(m[2]) if m[2] else end,end);partial=True
  if start>end:h.json({'error':'invalid range'},416);return True
 with LOCK:
  now=time.time();TRANSFERS[:]=[(t,n) for t,n in TRANSFERS if now-t<31*86400]
  if sum(n for t,n in TRANSFERS)+end-start+1>MAX_BYTES:
   h.json({'error':'무료 웹 전송 보호 한도에 도달했습니다. 영상은 맥 작업 폴더에 보존돼 있습니다.'},429);return True
  TRANSFERS.append((now,end-start+1))
 h.send_response(206 if partial else 200);h.send_header('Content-Type',mime);h.send_header('Content-Length',str(end-start+1));h.send_header('Accept-Ranges','bytes');h.send_header('Referrer-Policy','no-referrer')
 if download:h.send_header('Content-Disposition','attachment; filename="haejja-reel.mp4"')
 if partial:h.send_header('Content-Range',f'bytes {start}-{end}/{size}')
 h.end_headers()
 try:
  with path.open('rb') as f:
   f.seek(start);left=end-start+1
   while left:
    b=f.read(min(262144,left))
    if not b:break
    h.wfile.write(b);left-=len(b)
 except (BrokenPipeError,ConnectionResetError):pass
 return True
