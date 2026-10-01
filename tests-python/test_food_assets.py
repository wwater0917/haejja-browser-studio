import base64,hashlib,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import food_assets

class SealedAssetsTest(unittest.TestCase):
 def fixture(self,root):
  root=Path(root);(root/'public/food-sfx').mkdir(parents=True);(root/'server/food-sound-sealed').mkdir(parents=True)
  key=AESGCM.generate_key(bit_length=256);cipher=AESGCM(key);rows=[]
  for i in range(2):
   clear=b'private audio fixture '+bytes([i]);sid='sound-'+str(i)*20;row={'id':sid,'sha256':hashlib.sha256(clear).hexdigest(),'file':'server/food-sounds/'+sid+'.wav'};rows.append(row);nonce=os.urandom(12)
   (root/'server/food-sound-sealed'/(sid+'.enc')).write_bytes(nonce+cipher.encrypt(nonce,clear,(sid+':'+row['sha256']).encode()))
  (root/'public/food-sfx/catalog.json').write_text(json.dumps({'sounds':rows}))
  return base64.b64encode(key).decode(),rows
 def test_private_assets_restore_with_hash_and_private_file_mode(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ):
   key,rows=self.fixture(root);out=food_assets.ensure_assets(root,key)
   for s in rows:
    p=out/Path(s['file']).name;self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),s['sha256']);self.assertEqual(p.stat().st_mode&0o777,0o600)
   self.assertEqual(os.environ['FOOD_SOUND_ROOT'],str(out))
 def test_missing_and_wrong_keys_cannot_restore_audio(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'FOOD_SOUND_KEY':''}):
   self.fixture(root)
   for key in ['',base64.b64encode(b'x'*32).decode()]:
    with self.assertRaises(Exception):food_assets.ensure_assets(root,key)
 def test_tampered_ciphertext_is_rejected(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ):
   key,rows=self.fixture(root);p=Path(root)/'server/food-sound-sealed'/(rows[0]['id']+'.enc');data=bytearray(p.read_bytes());data[-1]^=1;p.write_bytes(data)
   with self.assertRaises(Exception):food_assets.ensure_assets(root,key)
 def test_existing_local_originals_need_no_cloud_key(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'FOOD_SOUND_KEY':''}):
   _,rows=self.fixture(root)
   for s in rows:
    p=Path(root)/s['file'];p.parent.mkdir(exist_ok=True);p.write_bytes(b'local fixture')
   self.assertEqual(food_assets.ensure_assets(root),Path(root)/'server/food-sounds')

if __name__=='__main__':unittest.main()
