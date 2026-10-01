import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import food_effects as e,relay
class LibraryTest(unittest.TestCase):
 def test_every_provided_file_is_available_and_private(self):
  self.assertEqual(len(e.CATALOG['sounds']),337);self.assertEqual(len({s['id'] for s in e.CATALOG['sounds']}),337)
  for s in e.CATALOG['sounds']:
   self.assertTrue((e.ROOT/s['file']).is_file() or (e.ROOT/'server/food-sound-sealed'/(s['id']+'.enc')).is_file());self.assertTrue(s['file'].startswith('server/food-sounds/'));self.assertGreater(s['sourceDuration'],0)
 def test_sound_cuts_validate_original_bounds(self):
  kind=next(s['id'] for s in e.CATALOG['sounds'] if s['sourceDuration']>5)
  self.assertEqual(e.selection(kind,1,2),(1,2))
  for start,length in [(float('nan'),1),(0,float('inf')),(-1,1),(0,6),(e.SOUNDS[kind]['sourceDuration'],1)]:
   with self.assertRaises(ValueError):e.selection(kind,start,length)
 def test_custom_cut_survives_segment_validation_and_timeline(self):
  kind=next(s['id'] for s in e.CATALOG['sounds'] if s['sourceDuration']>5)
  items=[{'sound':kind,'soundStart':1,'soundLength':2}];e.segments(items)
  rows=e.arrange(e.settings({'sfxMode':'manual'}),[],[{'start':0,'end':4}],items,4)
  self.assertEqual(rows[0]['kind'],kind);self.assertEqual(rows[0]['sourceStart'],1);self.assertEqual(rows[0]['duration'],2);self.assertEqual(rows[0]['assetSha256'],e.SOUNDS[kind]['sha256'])
 def test_automatic_choices_extend_beyond_the_six_presets(self):
  items=[{'sound':'auto','graphicLabel':'menu'},{'sound':'auto','graphicLabel':'menu'}]
  rows=e.arrange(e.settings({}),[{'end':3},{'end':8}],[{'start':0,'end':5},{'start':5,'end':10}],items,10)
  self.assertTrue(any(x['kind'].startswith('sound-') for x in rows));self.assertTrue(all(x['duration']<=.7 for x in rows))
 def test_only_bounded_preview_names_are_allowlisted(self):
  pid='a'*32
  self.assertTrue(relay.allowed('/api/food/sfx-preview','POST'));self.assertTrue(relay.allowed('/food-media/'+pid+'/sound-preview-'+'a'*16+'.mp3','GET'))
  for name in ['sound-preview-bad.mp3','../../food-sounds/source.mp3','source.mp3']:
   self.assertFalse(relay.allowed('/food-media/'+pid+'/'+name,'GET'))
if __name__=='__main__':unittest.main()
