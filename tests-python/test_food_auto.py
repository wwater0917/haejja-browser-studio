import sys,tempfile,unittest,wave
from array import array
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import food_effects as e

class AutomaticSoundsTest(unittest.TestCase):
 def timeline(self):
  times=[{'clipId':str(i),'start':i*4,'end':i*4+4} for i in range(3)]
  cues=[{'clipId':str(i),'start':i*4+.18,'end':i*4+3.7} for i in range(3)]
  items=[{'sound':'auto','graphicLabel':'','narration':'음식 소개'} for _ in times]
  return times,cues,items
 def test_every_hard_cut_gets_a_sound_after_final_edit(self):
  times,cues,items=self.timeline()
  events=e.arrange(e.settings({'transition':'none'}),cues,times,items,12)
  cuts=[x for x in events if x['role']=='cut']
  self.assertEqual([x['at'] for x in cuts],[4,8])
  self.assertTrue(all(x['kind'].startswith('sound-') for x in events))
  self.assertTrue(all(x['duration']<=.155 for x in cuts))
 def test_transition_sounds_follow_overlap_center(self):
  times,cues,items=self.timeline();times[1]['start']=3.5;times[1]['end']=7.5;times[2]['start']=7;times[2]['end']=11
  events=e.arrange(e.settings({'transitionDuration':.5}),cues,times,items,11)
  self.assertEqual([x['at'] for x in events if x['role']=='transition'],[3.75,7.25])
 def test_automatic_mode_replaces_previous_manual_picks(self):
  times,cues,items=self.timeline();items[0]['sound']='swish'
  events=e.arrange(e.settings({'transition':'none'}),cues,times,items,12)
  self.assertFalse(any(x['role']=='user-selected' for x in events))
  self.assertEqual(events,e.arrange(e.settings({'transition':'none'}),cues,times,items,12))
 def test_scene_context_chooses_reaction_only_for_positive_review(self):
  times,cues,items=self.timeline();items[0]['narration']='정말 맛있고 추천해요';items[1]['narration']='추천하지 않아요. 아쉬워요.'
  events=e.arrange(e.settings({'transition':'none'}),cues,times,items,12)
  self.assertEqual([x['clipId'] for x in events if x['role']=='reaction'],['0'])
  self.assertTrue(all(x['at']+x['duration']<=12 for x in events))
 def test_mix_lowers_effect_during_speech_and_fades_edges(self):
  event={'kind':'pop','assetSha256':e.SOUNDS['pop']['sha256'],'at':0,'duration':.1,'gain':.15,'role':'menu-card','speechIntervals':[[.02,.06]]}
  with tempfile.TemporaryDirectory() as d,patch.object(e,'decode',return_value=array('h',[10000])*4800):
   e.track(Path(d),[event],.1)
   with wave.open(str(Path(d)/'effects.wav')) as w:data=array('h');data.frombytes(w.readframes(w.getnframes()))
  self.assertEqual(data[0],0);self.assertEqual(data[-1],0)
  self.assertAlmostEqual(data[2000]/data[4000],.35,places=2)

if __name__=='__main__':unittest.main()
