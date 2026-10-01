import json,math,sys,tempfile,unittest,wave
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import food_effects as e
class EffectsTest(unittest.TestCase):
 def test_effect_settings_reject_nonfinite_or_unbounded_values(self):
  for settings in [{'sfxGain':float('nan')},{'sfxGain':1},{'transitionDuration':20},{'transition':'../../secret'},{'motion':'unknown'}]:
   with self.assertRaises(ValueError):e.settings(settings)
 def test_manual_effects_are_real_assets_and_end_within_video(self):
  items=[{'sound':'swish'},{'sound':'none'}];timeline=[{'start':0,'end':2},{'start':2,'end':4}]
  events=e.arrange(e.settings({'sfxMode':'manual'}),[],timeline,items,4)
  self.assertEqual([x['kind'] for x in events],['swish']);self.assertLessEqual(events[0]['at']+events[0]['duration'],4)
  with tempfile.TemporaryDirectory() as d:
   e.track(Path(d),events,4)
   with wave.open(str(Path(d)/'effects.wav')) as w:
    self.assertEqual(w.getnframes(),192000);self.assertNotEqual(set(w.readframes(w.getnframes())),{0})
 def test_disabled_effects_create_no_events(self):
  for cfg in [{'sfxMode':'none'},{'sfxGain':0}]:self.assertEqual(e.arrange(e.settings(cfg),[],[],[],5),[])
 def test_per_scene_mute_blocks_automatic_accents(self):
  items=[{'sound':'none','graphicLabel':'첫 메뉴'},{'sound':'auto','graphicLabel':'두 메뉴'}];times=[{'start':0,'end':5},{'start':5,'end':10}]
  rows=e.arrange(e.settings({}),[{'end':3},{'end':8}],times,items,10)
  self.assertTrue(rows);self.assertTrue(all(x['at']>=5 and x['at']+x['duration']<=10 for x in rows));self.assertLessEqual(len(rows),30)
 def test_single_clip_never_shortens_for_a_nonexistent_transition(self):
  self.assertEqual(e.overlap(e.settings({'transition':'slide'}),1),0)
 def test_scene_sound_cannot_be_an_arbitrary_path(self):
  with self.assertRaises(ValueError):e.segments([{'sound':'../../.env'}])
if __name__=='__main__':unittest.main()
