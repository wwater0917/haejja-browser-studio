"""Bounded free-tier helper: public YouTube import and opt-in online TTS.
No user library, database, permanent media storage or LLM hosting.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import asyncio, collections, json, os, re, secrets, shutil, subprocess, sys, tempfile, threading, time
import edge_tts, imageio_ffmpeg
import relay
ROOT=Path(tempfile.mkdtemp(prefix='haejja-'))
ORIGIN=os.environ.get('WEB_ORIGIN','https://haejja-reel-studio.onrender.com')
POOL=ThreadPoolExecutor(max_workers=1)
JOBS={};LOCK=threading.Lock();REQUESTS=collections.deque();TRANSFERS=collections.deque()
BIN=ROOT/'bin';BIN.mkdir();(BIN/'ffmpeg').symlink_to(imageio_ffmpeg.get_ffmpeg_exe())
MAX_MONTH_BYTES=900*1024*1024

def video_id(url):
    u=urlparse(url)
    if u.scheme!='https' or u.username or u.password or u.port:raise ValueError('https 유튜브 링크만 사용할 수 있습니다.')
    if u.hostname=='youtu.be':v=u.path.strip('/')
    elif u.hostname in {'www.youtube.com','youtube.com','m.youtube.com'}:
        v=parse_qs(u.query).get('v',[''])[0] if u.path=='/watch' else u.path.split('/')[2] if re.fullmatch(r'/(shorts|embed)/[\w-]{11}/?',u.path) else ''
    else:raise ValueError('유튜브 링크만 사용할 수 있습니다.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}',v):raise ValueError('올바른 유튜브 영상 링크를 입력하세요.')
    return v

def cleanup():
    now=time.time()
    with LOCK:
        for key,j in list(JOBS.items()):
            if now-j['created']>1200 and j['status'] not in {'running','queued'}:
                shutil.rmtree(ROOT/key,ignore_errors=True);del JOBS[key]

def work(key,kind,data):
    j=JOBS[key];j['status']='running';folder=ROOT/key;folder.mkdir()
    try:
        if kind=='youtube':
            url='https://www.youtube.com/watch?v='+video_id(data['url'])
            cmd=[sys.executable,'-m','yt_dlp','--ignore-config','--no-playlist','--no-progress','--retries','0','--fragment-retries','0','--socket-timeout','20','--js-runtimes','node','--ffmpeg-location',str(BIN),'--max-filesize','80M','--match-filter','duration <= 300','--write-info-json','-f','b[ext=mp4][height<=720]/b[height<=720]','--remux-video','mp4','-o',str(folder/'source.%(ext)s'),url]
            r=subprocess.run(cmd,capture_output=True,text=True,timeout=150)
            path=folder/'source.mp4'
            if r.returncode or not path.exists():
                stderr=r.stderr.lower()
                if 'bot' in stderr or 'sign in' in stderr:raise ValueError('유튜브가 이 무료 서버의 자동 다운로드를 차단했습니다. 영상 파일을 직접 선택해 주세요.')
                if 'not available' in stderr or 'private' in stderr:raise ValueError('이 영상은 공개 다운로드로 가져올 수 없습니다. 영상 파일을 직접 선택해 주세요.')
                raise ValueError('유튜브 영상 가져오기에 실패했습니다. 5분 이하 공개 영상인지 확인하거나 파일을 직접 선택해 주세요.')
            if path.stat().st_size>80*1024*1024:raise ValueError('가져올 수 있는 영상은 80MB 이하입니다.')
            info=json.loads((folder/'source.info.json').read_text());j.update(title=str(info.get('title','YouTube 영상'))[:150],mime='video/mp4')
        else:
            text=data.get('text','').strip();voice=data.get('voice','ko-KR-InJoonNeural')
            if not 1<=len(text)<=1500:raise ValueError('음성 원고는 1~1500자까지 가능합니다.')
            if voice not in {'ko-KR-InJoonNeural','ko-KR-SunHiNeural','ko-KR-HyunsuMultilingualNeural'}:raise ValueError('지원하지 않는 목소리입니다.')
            speed=float(data.get('speed',1.05))
            if not .7<=speed<=1.5:raise ValueError('말하기 속도를 확인하세요.')
            pitch=float(data.get('pitch',10))
            if not -30<=pitch<=30:raise ValueError('음성 높이를 확인하세요.')
            path=folder/'voice.mp3'
            asyncio.run(asyncio.wait_for(edge_tts.Communicate(text,voice,rate=f'{round((speed-1)*100):+d}%',pitch=f'{round(pitch):+d}Hz').save(str(path)),timeout=90))
            j.update(title='한국어 내레이션',mime='audio/mpeg')
        j.update(status='ready',path=str(path),size=path.stat().st_size)
    except Exception as e:
        j.update(status='failed',error=str(e) if isinstance(e,ValueError) else '외부 서비스가 응답하지 않았습니다. 기기 내 음성 또는 파일 선택을 이용해 주세요.')
        shutil.rmtree(folder,ignore_errors=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def end_headers(self):
        origin=self.headers.get('Origin')
        if origin==ORIGIN:self.send_header('Access-Control-Allow-Origin',ORIGIN)
        self.send_header('Vary','Origin');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
    def json(self,data,status=200):
        b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_OPTIONS(self):
        if self.headers.get('Origin')!=ORIGIN:return self.json({'error':'Origin denied'},403)
        self.send_response(204);self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization');self.end_headers()
    def do_POST(self):
        if self.path.startswith("/bridge/"):
            try: relay.handle(self)
            except (ValueError,TypeError,KeyError) as e:self.json({"error":str(e)},400)
            return
        if self.headers.get('Origin')!=ORIGIN:return self.json({'error':'Origin denied'},403)
        try:
            cleanup();n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=16000:raise ValueError('요청 크기가 너무 큽니다.')
            data=json.loads(self.rfile.read(n));kind=self.path.removeprefix('/api/')
            if kind not in {'youtube','tts'}:return self.json({'error':'not found'},404)
            if kind=='youtube':video_id(data.get('url',''))
            with LOCK:
                now=time.time()
                while REQUESTS and now-REQUESTS[0]>86400:REQUESTS.popleft()
                if len(REQUESTS)>=30:return self.json({'error':'무료 서버의 오늘 사용 한도에 도달했습니다. 기기 내 기능은 계속 사용할 수 있습니다.'},429)
                if sum(j['status']in {'queued','running'} for j in JOBS.values())>=2:return self.json({'error':'무료 서버가 다른 작업 중입니다. 잠시 후 시도하세요.'},429)
                key=secrets.token_urlsafe(24);JOBS[key]={'created':now,'status':'queued'};REQUESTS.append(now)
            POOL.submit(work,key,kind,data);self.json({'job':key},202)
        except (ValueError,TypeError,KeyError,json.JSONDecodeError) as e:self.json({'error':str(e)},400)
    def do_GET(self):
        if self.path.startswith("/bridge/"):
            try: relay.handle(self)
            except (ValueError,TypeError,KeyError) as e:self.json({"error":str(e)},400)
            return
        if self.path in {'/','/healthz'}:return self.json({'status':'ok','plan':'free','stores_user_library':False})
        m=re.fullmatch(r'/api/jobs/([A-Za-z0-9_-]{32})(/file)?',self.path)
        if not m:return self.json({'error':'not found'},404)
        cleanup();j=JOBS.get(m[1])
        if not j:return self.json({'error':'임시 작업이 만료됐습니다. 다시 시도해 주세요.'},404)
        if not m[2]:return self.json({k:v for k,v in j.items() if k not in {'path','created'}})
        if j['status']!='ready':return self.json({'error':'파일이 준비되지 않았습니다.'},409)
        path=Path(j['path']);size=path.stat().st_size
        with LOCK:
            now=time.time()
            while TRANSFERS and now-TRANSFERS[0][0]>31*86400:TRANSFERS.popleft()
            if sum(x[1]for x in TRANSFERS)+size>MAX_MONTH_BYTES:return self.json({'error':'무료 전송 보호 한도에 도달했습니다. 직접 파일을 선택해 주세요.'},429)
            TRANSFERS.append((now,size))
        self.send_response(200);self.send_header('Content-Type',j['mime']);self.send_header('Content-Length',str(size));self.end_headers()
        try:
            with path.open('rb')as f:shutil.copyfileobj(f,self.wfile,1024*256)
        except (BrokenPipeError,ConnectionResetError):pass
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','10000'))),Handler).serve_forever()
