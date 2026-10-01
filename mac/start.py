"""Start the Mac companion with loopback-only services; stop owned children on exit."""
import json,os,signal,subprocess,sys,time,urllib.request
from pathlib import Path
config=json.loads((Path.home()/'.config/haejja/relay.json').read_text())
root=Path(config['studio']);env=os.environ.copy();env['PATH']='/opt/local/bin:/usr/local/bin:'+env.get('PATH','');env['REEL_CHANNEL_ROOT']=str((root/'.channel-root').read_text().strip())
owned=[]
def health(url):
 try:
  with urllib.request.urlopen(url,timeout=2) as r:return r.status==200
 except Exception:return False
def stop(*_):
 for p in reversed(owned):
  if p.poll() is None:p.terminate()
 raise SystemExit(0)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
if not health('http://127.0.0.1:11435/api/tags'):
 ai_env={**env,'OLLAMA_HOST':'127.0.0.1:11435','OLLAMA_MODELS':str(root/'runtime/models'),'OLLAMA_NO_CLOUD':'1'}
 owned.append(subprocess.Popen([str(root/'runtime/ollama/ollama'),'serve'],cwd=root,env=ai_env))
if not health('http://127.0.0.1:8766/healthz'):
 owned.append(subprocess.Popen([str(root/'.venv-asr/bin/python'),str(root/'reel.py'),'serve','--port','8766'],cwd=root,env=env))
 for _ in range(30):
  if health('http://127.0.0.1:8766/healthz'):break
  time.sleep(1)
 else:raise SystemExit('맥 제작 서버를 시작하지 못했습니다.')
if not health('http://127.0.0.1:8767/api/food/health'):
 food=Path(__file__).resolve().parents[1]/'server/food.py'
 owned.append(subprocess.Popen([str(root/'.venv-asr/bin/python'),str(food)],cwd=food.parent,env=env))
worker=subprocess.Popen([sys.executable,str(Path(__file__).with_name('worker.py'))],env=env);owned.append(worker)
try:
 while worker.poll() is None:time.sleep(2)
finally:stop()
