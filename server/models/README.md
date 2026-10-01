YuNet face_detection_yunet_2023mar.onnx from the official OpenCV Zoo.
Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
Downloaded 2026-10-01, MIT license in YUNET-LICENSE.
Only human face bounding boxes are used; no identity recognition.
Frames are sampled up to 2/second, capped at 300 for long sources. Adjacent detections cover motion between samples. Small, obscured or fast-moving faces can be missed; the editor supports additional timed Gaussian blur regions.
