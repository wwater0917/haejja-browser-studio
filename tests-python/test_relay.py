import io,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import relay
class Handler:
 def __init__(self,path,method='GET',body=None,token='test-worker'):
  raw=json.dumps(body or {}).encode();self.path=path;self.command=method;self.headers={'Authorization':'Bearer '+token,'Content-Length':str(len(raw))};self.rfile=io.BytesIO(raw);self.result=None
 def json(self,value,status=200):self.result=(status,value)
class RelayTest(unittest.TestCase):
 def setUp(self):relay.KEY='test-worker';relay.PAIR_ATTEMPTS.clear();relay.JOBS.clear()
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
if __name__=='__main__':unittest.main()
