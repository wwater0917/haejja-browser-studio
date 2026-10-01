import io,json,sys,unittest,time,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import relay
class Handler:
 def __init__(self,path,method='GET',body=None,token='test-worker'):
  raw=json.dumps(body or {}).encode();self.path=path;self.command=method;self.headers={'Authorization':'Bearer '+token,'Content-Length':str(len(raw))};self.rfile=io.BytesIO(raw);self.result=None
 def json(self,value,status=200):self.result=(status,value)
class RelayTest(unittest.TestCase):
 def setUp(self):relay.KEY='test-worker';relay.PAIR_ATTEMPTS.clear();relay.JOBS.clear()
 def test_food_upload_requires_owner_token(self):
  relay.LAST_SEEN=time.time()
  h=Handler('/bridge/request','POST',{'path':'/api/food/chunk','method':'POST','body':{'chunk':'AA=='}},'invalid')
  relay.handle(h);self.assertEqual(h.result[0],401);self.assertFalse(relay.JOBS)
 def test_food_media_is_allowlisted_without_arbitrary_files(self):
  pid='a'*32
  self.assertTrue(relay.allowed('/food-media/'+pid+'/reel.mp4','GET'))
  for path in ['/food-media/'+pid+'/source.mp4','/food-media/'+pid+'/../../.env','/api/food/health?path=/etc/passwd','/api/food/delete','/food-media/'+pid+'/manifest.json/extra']:
   self.assertFalse(relay.allowed(path,'GET'));self.assertFalse(relay.allowed(path,'POST'))
 def test_no_arbitrary_network_or_local_file_paths(self):
  for path in ['http://evil.test','/api/../etc/passwd','/media/../../etc/passwd','/api/search','/api/exclude','/api/run?evil=1']:
   self.assertFalse(relay.allowed(path,'GET'));self.assertFalse(relay.allowed(path,'POST'))
 def test_all_mutations_require_private_client_token(self):
  h=Handler('/bridge/request','POST',{'path':'/api/new','method':'POST','body':{'url':'https://youtube.com/shorts/XTaBTVECAJQ'}},'invalid')
  relay.handle(h);self.assertEqual(h.result[0],401);self.assertFalse(relay.JOBS)
 def test_offline_worker_does_not_accept_fake_success(self):
  relay.LAST_SEEN=0;h=Handler('/bridge/request','POST',{'path':'/api/projects'},relay.client_key());relay.handle(h)
  self.assertEqual(h.result[0],409);self.assertEqual(h.result[1]['code'],'MAC_OFFLINE')
 def test_worker_heartbeat_and_owner_request(self):
  h=Handler('/bridge/heartbeat');relay.handle(h);self.assertEqual(h.result[0],200)
  h=Handler('/bridge/request','POST',{'path':'/api/projects'},relay.client_key());relay.handle(h);self.assertEqual(h.result[0],202)
  self.assertEqual(relay.JOBS[h.result[1]['job']]['status'],'queued')
 def test_client_cannot_poll_worker_queue(self):
  h=Handler('/bridge/next',token=relay.client_key());relay.handle(h);self.assertEqual(h.result[0],401)
 def test_pairing_invalid_and_valid_codes(self):
  h=Handler('/bridge/pair','POST',{'code':'bad'},'');relay.handle(h);self.assertEqual(h.result[0],401)
  h=Handler('/bridge/pair','POST',{'code':relay.pair_code()},'');relay.handle(h);self.assertEqual(h.result[1]['token'],relay.client_key())
 def test_media_requires_bound_ticket_even_for_signed_in_client(self):
  h=Handler('/bridge/file?id=guess&expires=9999999999&sig=bad',token=relay.client_key());relay.handle(h);self.assertEqual(h.result[0],403)
 def test_save_page_requires_valid_ticket(self):
  h=Handler('/bridge/save?id=guess&expires=9999999999&sig=bad');relay.handle(h);self.assertEqual(h.result[0],403)
 def test_download_header_and_preview_range(self):
  class MediaHandler(Handler):
   def __init__(self):super().__init__('/');self.wfile=io.BytesIO();self.response_headers={}
   def send_response(self,n):self.code=n
   def send_header(self,k,v):self.response_headers[k]=v
   def end_headers(self):pass
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'media';p.write_bytes(b'0123456789');relay.TRANSFERS.clear()
   h=MediaHandler();relay.serve_file(h,p,'video/mp4',True)
   self.assertEqual(h.response_headers['Content-Disposition'],'attachment; filename="haejja-reel.mp4"');self.assertEqual(h.wfile.getvalue(),p.read_bytes())
   h=MediaHandler();h.headers['Range']='bytes=2-5';relay.serve_file(h,p,'video/mp4')
   self.assertEqual(h.code,206);self.assertEqual(h.wfile.getvalue(),b'2345');self.assertNotIn('Content-Disposition',h.response_headers)
if __name__=='__main__':unittest.main()
