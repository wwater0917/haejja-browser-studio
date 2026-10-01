import sys,unittest
from pathlib import Path
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import food_faces as f,food
class FaceSafetyTest(unittest.TestCase):
 def test_manual_coordinates_and_times_are_finite_bounded(self):
  good={'x':.1,'y':.2,'w':.2,'h':.3,'start':1,'end':2};self.assertEqual(len(f.validate([good],3)),1)
  for patch in [{'x':float('nan')},{'w':float('inf')},{'x':-.1},{'w':1},{'start':-1},{'end':4},{'end':.5}]:
   with self.assertRaises(ValueError):f.validate([{**good,**patch}],3)
  with self.assertRaises(ValueError):f.validate([good]*25,3)
 def test_blur_changes_only_requested_face_and_strength_matters(self):
  rng=np.random.default_rng(9);img=rng.integers(0,256,(100,100,3),dtype=np.uint8);b=[[.2,.2,.3,.3]]
  low=f.blur(img.copy(),b,.1);high=f.blur(img.copy(),b,1)
  self.assertTrue(np.array_equal(img[:20],high[:20]));self.assertTrue(np.array_equal(img[:,50:],high[:,50:]));self.assertFalse(np.array_equal(img[20:50,20:50],high[20:50,20:50]));self.assertFalse(np.array_equal(low,high))
 def test_manual_blur_obeys_source_time_window(self):
  c={'manualFaces':[{'x':.1,'y':.2,'w':.3,'h':.4,'start':1,'end':2}]}
  self.assertEqual(f.selected_boxes(c,.5),[]);self.assertEqual(len(f.selected_boxes(c,1.5)),1);self.assertEqual(f.selected_boxes(c,2.5),[])
 def test_adjacent_face_samples_cover_motion_without_whole_image_blur(self):
  scan={'samples':[{'time':0,'boxes':[[.1,.1,.2,.2]]},{'time':.5,'boxes':[[.15,.1,.2,.2]]}]}
  b=f.boxes_at(scan,.25);self.assertEqual(len(b),1);self.assertAlmostEqual(b[0][2],.25)
 def test_optional_info_and_review_bounds(self):
  info=food.info_from({});self.assertTrue(all(v=='' for v in info.values()))
  r=food.review_pack('영상으로 남겼어요. 다음 장면도 살펴봐요.',[],info)
  self.assertEqual(len(r['hashtags']),5);self.assertLessEqual(r['characterCount'],200);self.assertIn('남겼어요.\n',r['review']);self.assertGreaterEqual(len(__import__('re').findall(r'[\U0001F300-\U0001FAFF\u2600-\u27bf]',r['review'])),2)
if __name__=='__main__':unittest.main()
