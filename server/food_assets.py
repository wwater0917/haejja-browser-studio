"""Unseal provided sound assets on the private helper, outside its public checkout."""
import base64,hashlib,json,os,re,tempfile
from pathlib import Path

def ensure_assets(root=None,secret=None):
    root=Path(root or Path(__file__).resolve().parents[1])
    catalog=json.loads((root/'public/food-sfx/catalog.json').read_text())
    rows=[*catalog['sounds'],*catalog.get('presets',[])]
    originals=root/'server/food-sounds'
    if all((root/s['file']).is_file() for s in rows):return originals
    secret=secret or os.environ.get('FOOD_SOUND_KEY','')
    try:
        key=base64.b64decode(secret,validate=True)
        if len(key)!=32:raise ValueError()
    except Exception:raise ValueError('FOOD_SOUND_KEY must be configured on the private helper.') from None
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    cipher=AESGCM(key);target=Path(tempfile.mkdtemp(prefix='food-sounds-'))
    for s in rows:
        if not re.fullmatch(r'sound-[a-f0-9]{20}',s['id']) and s['id'] not in {'tap','bubble','swish','chime','signature','pop'}:raise ValueError('Invalid sealed sound identifier.')
        source=root/'server/food-sound-sealed'/(s['id']+'.enc')
        count=int(s.get('sealedParts',1))
        if not 1<=count<=64:raise ValueError('Invalid sealed sound part count.')
        data=source.read_bytes() if source.is_file() else b''.join(Path(str(source)+f'.part{i:03d}').read_bytes() for i in range(count))
        clear=cipher.decrypt(data[:12],data[12:],(s['id']+':'+s['sha256']).encode())
        if hashlib.sha256(clear).hexdigest()!=s['sha256']:raise ValueError('Sound integrity check failed.')
        dest=target/Path(s['file']).name;dest.write_bytes(clear);dest.chmod(0o600)
    os.environ['FOOD_SOUND_ROOT']=str(target)
    return target
