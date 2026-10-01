"""Cloud isolation and storage bounds; run with the helper's Python dependencies."""
import io,json,os,sys,tempfile,time,unittest
from pathlib import Path
os.environ['FOOD_MODE']='cloud'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import app,food,relay
class Request:
    food_request=app.Handler.food_request
    def __init__(self,path,method='GET',data=None,token='owner',origin=app.ORIGIN):
        self.path=path;self.command=method;raw=json.dumps(data or {}).encode()
        self.headers={'Authorization':'Bearer '+token,'Origin':origin,'Content-Length':str(len(raw))};self.rfile=io.BytesIO(raw);self.response=None
    def json(self,d,status=200):self.response=(status,d)
    send_json=json
class CloudTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old_data=food.DATA;food.DATA=Path(self.tmp.name)
        relay.KEY='test-food-owner';relay.LAST_SEEN=0;relay.JOBS.clear();food.BUSY.clear();food.REQUESTS.clear()
    def tearDown(self):food.DATA=self.old_data;self.tmp.cleanup()
    def req(self,path,method='GET',data=None,token=None,origin=app.ORIGIN):
        h=Request(path,method,data,relay.client_key() if token is None else token,origin);self.assertTrue(h.food_request());return h
    def test_cloud_does_not_need_worker_heartbeat(self):
        h=self.req('/cloud/api/food/health');self.assertEqual(h.response[0],200);self.assertEqual(h.response[1]['mode'],'cloud');self.assertEqual(relay.LAST_SEEN,0)
        h=self.req('/cloud/api/food/new','POST',{});self.assertEqual(h.response[0],200);self.assertTrue((food.DATA/h.response[1]['id']/'project.json').is_file());self.assertFalse(relay.JOBS)
    def test_unauthorized_mutation_and_foreign_origin_leave_no_files(self):
        for token,origin in [('bad',app.ORIGIN),(relay.client_key(),'https://untrusted.example')]:
            h=self.req('/cloud/api/food/new','POST',{},token,origin);self.assertIn(h.response[0],[401,403]);self.assertFalse(list(food.DATA.iterdir()))
    def test_source_and_traversal_never_serve(self):
        for path in ['/cloud/food-media/'+'a'*32+'/source.mp4','/cloud/api/food/../../.env','/cloud/api/run']:
            self.assertEqual(self.req(path).response[0],404)
    def test_big_upload_rejected_before_reserving_disk(self):
        d=self.req('/cloud/api/food/new','POST',{}).response[1]
        h=self.req('/cloud/api/food/clip','POST',{'id':d['id'],'name':'large.mov','size':81*1024*1024})
        self.assertEqual(h.response[0],400);self.assertEqual(food.read(food.DATA/d['id'])['clips'],[])
    def test_delete_is_owner_only_and_refuses_running_work(self):
        d=self.req('/cloud/api/food/new','POST',{}).response[1];p=food.DATA/d['id']
        self.assertEqual(self.req('/cloud/api/food/delete','POST',{'id':d['id']},'bad').response[0],401);self.assertTrue(p.exists())
        food.BUSY.add(d['id']);self.assertEqual(self.req('/cloud/api/food/delete','POST',{'id':d['id']}).response[0],400);self.assertTrue(p.exists())
        food.BUSY.clear();self.assertEqual(self.req('/cloud/api/food/delete','POST',{'id':d['id']}).response[0],200);self.assertFalse(p.exists())
    def test_cleanup_keeps_active_project(self):
        d=self.req('/cloud/api/food/new','POST',{}).response[1];p=food.DATA/d['id'];food.update(p,created=time.time()-7*3600)
        food.BUSY.add(d['id']);food.cleanup();self.assertTrue(p.exists());food.BUSY.clear();food.cleanup();self.assertFalse(p.exists())
if __name__=='__main__':unittest.main()
