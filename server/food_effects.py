"""Bounded effects for food reels; assets are the user's existing short sound edits."""
from array import array
from pathlib import Path
import hashlib,json,math,os,re,sys,threading,wave
ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'public/food-sfx/catalog.json').read_text())
SOUNDS={s['id']:s for s in [*CATALOG['sounds'],*CATALOG.get('presets',[])]}
VERIFIED=set();PREVIEW_LOCK=threading.Lock()
TRANSITIONS={'none':None,'dissolve':'fade','slide':'slideleft','black':'fadeblack'}
DEFAULTS={'sfxMode':'auto','sfxGain':.15,'transition':'dissolve','transitionDuration':.3,'motion':'clean','cameraMotion':'none'}
AUTO_VERSION=2
def settings(value):
    if not isinstance(value,dict):raise ValueError('효과 설정을 확인하세요.')
    d={**DEFAULTS,**value}
    if d['sfxMode'] not in {'none','auto','manual'} or d['transition'] not in TRANSITIONS or d['motion'] not in {'none','clean','pop'} or d['cameraMotion'] not in {'none','gentle'}:raise ValueError('지원하는 효과를 선택하세요.')
    try:gain=float(d['sfxGain']);seconds=float(d['transitionDuration'])
    except (ValueError,TypeError):raise ValueError('효과 음량과 전환 길이를 확인하세요.') from None
    if not math.isfinite(gain) or not 0<=gain<=.5 or not math.isfinite(seconds) or seconds not in [.3,.5,.7]:raise ValueError('효과음은 0~50%, 전환은 0.3·0.5·0.7초로 선택하세요.')
    return {k:d[k] for k in DEFAULTS}|{'sfxGain':gain,'transitionDuration':seconds,'autoPlacementVersion':AUTO_VERSION}
def segments(items):
    for s in items:
        s['graphicLabel']=re.sub(r'\s+',' ',str(s.get('graphicLabel',''))).strip()[:24]
        s['sound']=str(s.get('sound','auto'))
        if s['sound'] not in {'auto','none',*SOUNDS}:raise ValueError('장면 효과음을 확인하세요.')
        if s['sound'] in SOUNDS:
            s['soundStart'],s['soundLength']=selection(s['sound'],s.get('soundStart',0),s.get('soundLength',SOUNDS[s['sound']]['duration']))
        else:s['soundStart']=0;s['soundLength']=.7
def selection(kind,start=0,length=None):
    if kind not in SOUNDS:raise ValueError('라이브러리에서 효과음을 선택하세요.')
    try:start=float(start);length=float(SOUNDS[kind]['duration'] if length is None else length)
    except (ValueError,TypeError):raise ValueError('효과음의 시작 위치와 길이를 확인하세요.') from None
    if not math.isfinite(start) or not math.isfinite(length) or start<0 or not .01<=length<=5 or start+length>SOUNDS[kind]['sourceDuration']+.01:raise ValueError('원음 범위 안에서 시작 위치와 0.01~5초의 사용 길이를 선택하세요.')
    return start,min(length,SOUNDS[kind]['sourceDuration']-start)
def asset(kind):
    d=SOUNDS[kind];path=Path(os.environ['FOOD_SOUND_ROOT'])/Path(d['file']).name if d['file'].startswith('server/food-sounds/') and os.environ.get('FOOD_SOUND_ROOT') else ROOT/d['file'];key=(kind,path.stat().st_mtime_ns,path.stat().st_size)
    if key not in VERIFIED:
        if hashlib.sha256(path.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('효과음 원본 확인에 실패했습니다.')
        VERIFIED.add(key)
    return path
def decode(kind,start,length,ffmpeg=None,command=None):
    path=asset(kind)
    if path.suffix.lower()=='.wav':
        try:
            with wave.open(str(path)) as w:
                if (w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,48000):
                    w.setpos(min(w.getnframes(),round(start*48000)));raw=w.readframes(round(length*48000))
                else:raw=None
        except (wave.Error,EOFError):raw=None
    else:raw=None
    if raw is None:
        if not ffmpeg or not command:raise ValueError('효과음 디코더 연결을 확인하세요.')
        raw=command([ffmpeg,'-v','error','-ss',str(start),'-i',str(path),'-t',str(length),'-map','0:a:0','-ac','1','-ar','48000','-f','s16le','pipe:1'])
    data=array('h');data.frombytes(raw)
    if sys.byteorder!='little':data.byteswap()
    return data
def preview(p,kind,start,length,ffmpeg,command):
    start,length=selection(kind,start,length)
    if not PREVIEW_LOCK.acquire(blocking=False):raise ValueError('다른 효과음을 준비 중입니다. 잠시 후 다시 들어보세요.')
    try:
        path=asset(kind);key=hashlib.sha256(json.dumps([kind,SOUNDS[kind]['sha256'],start,length]).encode()).hexdigest()[:16];name='sound-preview-'+key+'.mp3';dest=p/name
        if not dest.is_file():command([ffmpeg,'-v','error','-y','-ss',str(start),'-i',str(path),'-t',str(length),'-map','0:a:0','-ac','1','-ar','48000','-c:a','libmp3lame','-b:a','96k',str(dest)])
        old=sorted(p.glob('sound-preview-*.mp3'),key=lambda q:q.stat().st_mtime,reverse=True)
        for q in old[30:]:
            if q!=dest:q.unlink(missing_ok=True)
        return {'name':name,'duration':length,'start':start,'soundName':SOUNDS[kind]['name']}
    finally:PREVIEW_LOCK.release()
def overlap(config,count):return config['transitionDuration'] if count>1 and config['transition']!='none' else 0
def join(p,parts,durations,config,ffmpeg,command):
    cross=overlap(config,len(parts));out=p/'joined.mp4'
    encoding=['-c:v','libx264','-threads','1','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2']
    if not cross:
        (p/'parts.txt').write_text('\n'.join("file '"+name+"'" for name in parts))
        command([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(p/'parts.txt'),'-c','copy',str(out)]);return
    # Only two video streams are resident per join, even for a six-clip reel.
    previous=p/parts[0];length=durations[0]
    for i,name in enumerate(parts[1:],1):
        dest=out if i==len(parts)-1 else p/f'join-{i}.mp4'
        graph=f'[0:v]setpts=PTS-STARTPTS,fps=30,settb=AVTB[v0];[1:v]setpts=PTS-STARTPTS,fps=30,settb=AVTB[v1];[v0][v1]xfade=transition={TRANSITIONS[config["transition"]]}:duration={cross}:offset={length-cross:.6f},format=yuv420p[v];[0:a]atrim=duration={length},asetpts=PTS-STARTPTS[a0];[1:a]atrim=duration={durations[i]},asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d={cross}:c1=tri:c2=tri[a]'
        command([ffmpeg,'-hide_banner','-loglevel','error','-y','-threads','1','-i',str(previous),'-threads','1','-i',str(p/name),'-filter_complex',graph,'-map','[v]','-map','[a]',*encoding,'-t',str(length+durations[i]-cross),str(dest)])
        length+=durations[i]-cross
        if previous.name.startswith('join-'):previous.unlink(missing_ok=True)
        previous=dest

def arrange(config,cues,clip_times,items,duration,clips=None):
    if config['sfxMode']=='none' or not config['sfxGain']:return []
    events=[]
    blocked=[(t['start'],t['end']) for t,s in zip(clip_times,items) if s['sound']=='none']
    def add(at,kind,role,start=0,length=None,window_end=None,clip_id=None,reason=''):
        length=SOUNDS[kind]['duration'] if length is None else length
        at=round(max(0,min(at,duration-.01)),3)
        length=min(length,(duration if window_end is None else window_end)-at)
        if length<.01 or any(at<b and at+length>a for a,b in blocked) or any(at<e['at']+e['duration']+.12 and at+length+.12>e['at'] for e in events):return False
        events.append({'at':at,'kind':kind,'name':SOUNDS[kind]['name'],'duration':length,'sourceStart':start,'gain':config['sfxGain'],'role':role,'assetSha256':SOUNDS[kind]['sha256'],'clipId':clip_id,'reason':reason,'speechIntervals':[[c.get('start',0),c['end']] for c in cues if c.get('start',0)<at+length and c['end']>at]})
        return True
    # Manual choices are used only in manual mode; automatic mode chooses anew.
    if config['sfxMode']=='manual':
        for t,s in zip(clip_times,items):
            if s['sound'] in SOUNDS:add(t['start']+.07,s['sound'],'user-selected',s.get('soundStart',0),s.get('soundLength',SOUNDS[s['sound']]['duration']),t['end'],t.get('clipId'))
    if config['sfxMode']=='auto':
        def pick(role,fallback,context,at):
            patterns={'opening':r'물방울|카툰 팝|클릭','cut':r'클릭|틱|물방울_뽁','transition':r'우쉬|휘익|휙|슝','menu-card':r'물방울|카툰 팝|띠링|띠리링','ending':r'띠링|띠리링|띵동|맑음','reaction':r'^박수$|^와우$|짜잔|깨달음','scene-accent':r'물방울|카툰 팝|클릭'}
            candidates=[s for s in CATALOG['sounds'] if re.search(patterns[role],s['name']) and (role=='reaction' or not s['category'].startswith('4.'))]
            used={e['kind'] for e in events};fresh=[s for s in candidates if s['id'] not in used];pool=fresh or candidates
            seed=hashlib.sha256(f'{role}:{at:.3f}:{context}'.encode()).digest()
            return pool[int.from_bytes(seed[:4],'big')%len(pool)]['id'] if pool else fallback
        def automatic(at,role,fallback,t=None,context='',reason=''):
            kind=pick(role,fallback,context,at);length=min(SOUNDS[kind]['sourceDuration'],.45 if role in {'ending','reaction'} else .35)
            # Cut sounds fit into the real pause before the next narration.
            if role in {'opening','cut','transition'}:
                next_speech=min((c['start'] for c in cues if c.get('start',0)>at),default=duration)
                length=min(length,max(.01,next_speech-at-.025))
            return add(at,kind,role,length=length,window_end=t['end'] if t else duration,clip_id=t.get('clipId') if t else None,reason=reason)
        automatic(.03,'opening','pop',clip_times[0] if clip_times else None,reason='첫 장면 시작')
        cross=overlap(config,len(clip_times))
        # Always follow the finished edit, including hard cuts without a transition.
        for t in clip_times[1:]:
            automatic(t['start']+cross/2,'transition' if cross else 'cut','swish' if cross else 'tap',t,reason='전환 중앙' if cross else '컷 변경')
        for i,(t,s) in enumerate(zip(clip_times,items)):
            c=(clips or [{}]*len(items))[i];context=' '.join(str(x) for x in [c.get('note',''),c.get('visualSummary',''),s.get('narration',''),s.get('graphicLabel','')])
            if s.get('graphicLabel') and config['motion']!='none':automatic(t['start']+.55,'menu-card','pop',t,context,'메뉴 카드 등장')
            cue=next((c for c in cues if c.get('clipId')==t.get('clipId')),cues[i] if i<len(cues) else None)
            if cue and not re.search(r'아쉽|별로|실망|추천하지|맛없',context):
                if re.search(r'추천|최고|만족|감탄|맛있|좋았|훌륭',context):
                    if not automatic(cue['end']+.04,'reaction','chime',t,context,'장면 후기 강조'):automatic(max(t['start'],cue['end']-.5),'reaction','chime',t,context,'장면 후기 강조')
                elif re.search(r'붓|따르|굽|볶|자르|썰|한입|포크|젓가락|들어 올|pour|cook|slice|bite|fork',context,re.I):automatic(cue['end']+.04,'scene-accent','bubble',t,context,'음식 장면 마무리')
        automatic(max(0,duration-.45),'ending','chime',reason='마지막 장면 마무리')
    return sorted(events,key=lambda e:e['at'])[:30]
def track(p,events,duration,ffmpeg=None,command=None):
    samples=array('h',[0])*math.ceil(duration*48000)
    cache={}
    for e in events:
        if SOUNDS[e['kind']]['sha256']!=e['assetSha256']:raise ValueError('효과음 원본 확인에 실패했습니다.')
        key=(e['kind'],e.get('sourceStart',0),e['duration'])
        if key not in cache:cache[key]=decode(*key,ffmpeg,command)
        data=cache[key]
        offset=round(e['at']*48000);peak=max((abs(v) for v in data),default=1) or 1
        scale=min(4,24000/peak) if e['role']!='user-selected' else 1
        for i,v in enumerate(data[:max(0,len(samples)-offset)]):
            at=e['at']+i/48000;duck=.35 if any(a<=at<b for a,b in e.get('speechIntervals',[])) else 1
            fade=min(1,i/240,(len(data)-1-i)/240)
            samples[offset+i]=max(-32767,min(32767,samples[offset+i]+round(v*e['gain']*scale*duck*max(0,fade))))
    if sys.byteorder!='little':samples.byteswap()
    with wave.open(str(p/'effects.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(samples.tobytes())
