"""Bounded YuNet face detection, Gaussian blur and normalized manual regions."""
from pathlib import Path
import bisect, hashlib, json, math, subprocess
import cv2
import numpy as np
cv2.setNumThreads(1)
MODEL=Path(__file__).parent/'models/face_detection_yunet.onnx'

def detector():
    return cv2.FaceDetectorYN.create(str(MODEL),'',(320,320),.82,.3,300)

def detect(image, model):
    h,w=image.shape[:2]; size=(max(32,round(w*min(1,480/max(w,h)))),max(32,round(h*min(1,480/max(w,h)))))
    small=cv2.resize(image,size); model.setInputSize(size); _,found=model.detect(small)
    boxes=[]
    for f in ([] if found is None else found):
        x,y,bw,bh=map(float,f[:4]); margin=.16
        x0=max(0,(x-bw*margin)/size[0]); y0=max(0,(y-bh*margin)/size[1]); x1=min(1,(x+bw*(1+margin))/size[0]); y1=min(1,(y+bh*(1+margin))/size[1])
        if x1>x0 and y1>y0: boxes.append([x0,y0,x1-x0,y1-y0])
    return boxes

def validate(regions,duration):
    if not isinstance(regions,list) or len(regions)>24: raise ValueError('추가 블러 영역은 영상당 24개까지 가능합니다.')
    result=[]
    for r in regions:
        vals=[float(r.get(k,0)) for k in ['x','y','w','h','start','end']]
        x,y,w,h,start,end=vals
        if not all(math.isfinite(v) for v in vals) or not (0<=x<1 and 0<=y<1 and .005<=w<=1-x+.00001 and .005<=h<=1-y+.00001 and 0<=start<end<=duration+.05): raise ValueError('블러 영역과 적용 시간을 확인하세요.')
        result.append(dict(zip(['x','y','w','h','start','end'],vals)))
    return result

def scan(p,clip,ffmpeg,command):
    key=hashlib.sha256((clip['sha256']+'yunet-v1').encode()).hexdigest()[:16]; cache=p/f'faces-{key}.json'
    if cache.exists(): return json.loads(cache.read_text())
    # Dense sampling for ordinary short clips; cap the scan for longer source files.
    fps=min(2,300/clip['duration']); dest=p/f'face-scan-{key}'; dest.mkdir(exist_ok=True)
    command([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(p/('source-'+clip['id'])),'-vf',f'fps={fps},scale=480:480:force_original_aspect_ratio=decrease','-frames:v','300',str(dest/'%04d.jpg')])
    model=detector(); samples=[]
    for i,f in enumerate(sorted(dest.glob('*.jpg'))):
        frame=cv2.imread(str(f)); samples.append({'time':min(clip['duration'],(i+.5)/fps),'boxes':detect(frame,model)})
        f.unlink()
    if not samples:
        raw=command([ffmpeg,'-hide_banner','-loglevel','error','-ss',str(clip['duration']/2),'-i',str(p/('source-'+clip['id'])),'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','mjpeg','-'])
        image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
        if image is None: raise ValueError('얼굴 확인용 장면을 읽지 못했어요.')
        samples=[{'time':clip['duration']/2,'boxes':detect(image,model)}]
    dest.rmdir(); result={'samples':samples,'interval':1/fps,'model':'OpenCV YuNet','detections':sum(len(s['boxes']) for s in samples)}
    cache.write_text(json.dumps(result)); return result

def boxes_at(scan,time):
    samples=scan.get('samples',[])
    if not samples:return []
    times=[s['time'] for s in samples]; i=bisect.bisect_left(times,time)
    left=samples[max(0,i-1)]; right=samples[min(len(samples)-1,i)]
    # Cover motion between adjacent sampled frames with the union of matched faces.
    boxes=list(left['boxes'])+list(right['boxes']); merged=[]
    for b in boxes:
        x,y,w,h=b
        for j,a in enumerate(merged):
            ax,ay,aw,ah=a; iw=max(0,min(x+w,ax+aw)-max(x,ax)); ih=max(0,min(y+h,ay+ah)-max(y,ay))
            if iw*ih/max(.000001,min(w*h,aw*ah))>.35:
                x0=min(x,ax); y0=min(y,ay); merged[j]=[x0,y0,max(x+w,ax+aw)-x0,max(y+h,ay+ah)-y0]; break
        else: merged.append(b)
    return merged

def blur(image,boxes,strength):
    h,w=image.shape[:2]
    for x,y,bw,bh in boxes:
        x0=max(0,int(x*w)); y0=max(0,int(y*h)); x1=min(w,math.ceil((x+bw)*w)); y1=min(h,math.ceil((y+bh)*h))
        if x1<=x0 or y1<=y0:continue
        roi=image[y0:y1,x0:x1]; sigma=max(2,min(x1-x0,y1-y0)*(.04+.18*strength))
        image[y0:y1,x0:x1]=cv2.GaussianBlur(roi,(0,0),sigmaX=sigma,sigmaY=sigma,borderType=cv2.BORDER_REPLICATE)
    return image

def selected_boxes(clip,time,auto=True):
    boxes=boxes_at(clip.get('faceScan',{}),time) if auto else []
    return boxes+[[r[k] for k in ['x','y','w','h']] for r in clip.get('manualFaces',[]) if r['start']<=time<=r['end']]

def frame(p,clip,time,strength,auto,ffmpeg,command):
    raw=command([ffmpeg,'-hide_banner','-loglevel','error','-ss',str(time),'-i',str(p/('source-'+clip['id'])),'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','mjpeg','-'])
    img=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR); blur(img,selected_boxes(clip,time,auto),strength)
    return cv2.imencode('.jpg',img,[cv2.IMWRITE_JPEG_QUALITY,90])[1].tobytes()

def preprocess(p,clip,seconds,strength,auto,ffmpeg):
    if not clip.get('manualFaces') and (not auto or not clip.get('faceScan',{}).get('detections')): return None
    source=p/('source-'+clip['id']); dest=p/f'blurred-{clip["id"]}.mp4'
    # Derive dimensions after FFmpeg's automatic rotation, then bound memory at 720px.
    meta=subprocess.run([ffmpeg,'-threads','1','-ss',str(clip['start']),'-i',str(source),'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','mjpeg','-'],capture_output=True,timeout=60)
    image=cv2.imdecode(np.frombuffer(meta.stdout,np.uint8),cv2.IMREAD_COLOR)
    if image is None:raise ValueError('얼굴 블러용 영상을 읽지 못했어요.')
    h,w=image.shape[:2]; w-=w%2; h-=h%2
    decoder=subprocess.Popen([ffmpeg,'-hide_banner','-loglevel','error','-threads','1','-filter_threads','1','-ss',str(clip['start']),'-i',str(source),'-t',str(seconds),'-vf',f'scale={w}:{h},fps=30','-pix_fmt','bgr24','-f','rawvideo','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    args=[ffmpeg,'-hide_banner','-loglevel','error','-y','-threads','1','-filter_threads','1','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r','30','-i','-','-ss',str(clip['start']),'-i',str(source),'-map','0:v','-map','1:a?','-t',str(seconds),'-c:v','libx264','-threads','1','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac',str(dest)]
    encoder=subprocess.Popen(args,stdin=subprocess.PIPE,stderr=subprocess.DEVNULL); count=0
    try:
        while True:
            raw=decoder.stdout.read(w*h*3)
            if not raw:break
            if len(raw)!=w*h*3:raise ValueError('얼굴 블러 영상 읽기가 중단됐어요.')
            image=np.frombuffer(raw,np.uint8).reshape(h,w,3).copy(); blur(image,selected_boxes(clip,clip['start']+count/30,auto),strength)
            encoder.stdin.write(image.tobytes()); count+=1
        encoder.stdin.close()
        if decoder.wait(timeout=60) or encoder.wait(timeout=120) or not count:raise ValueError('얼굴 블러 처리에 실패했어요.')
    finally:
        for proc in [decoder,encoder]:
            if proc.poll() is None:proc.kill();proc.wait()
    return dest
