import './food.css';
import {createAutosave,mergeSavedClips,canRestorePlan} from './food-autosave.js';
import {bindDictation} from './food-dictation.js';
import {createFaceEditor} from './food-face-editor.js';
import {createSoundLibrary} from './food-sounds.js';
const $=id=>document.getElementById(id), BASE='https://haejja-free-helper.onrender.com';
const LOCAL=import.meta.env.DEV&&['127.0.0.1','localhost'].includes(location.hostname);
let limits={clips:6,fileMB:80,totalMB:200},outputBlob=null;
let token=localStorage.getItem('haejja-mac-token')||'',project=null,clips=[],working=false,uploading=false,epoch=0,outputUrl='',toastTimer,outputDirty=false,draftInvalid=false,hydrating=false,restoredOnce=false,pendingAction='';
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const effectIds=['sfxMode','sfxGain','transition','transitionDuration','motion','cameraMotion'];
const savedFieldIds=['name','location','menus','impressions','target','tone','title','review','voice','speed','fit','originalVolume','sfxMode','sfxGain','transition','transitionDuration','motion','cameraMotion','autoFaces','faceStrength'];
const autosave=createAutosave({storage:localStorage,onError:()=>{$('autosaveState').textContent='브라우저 저장 공간이 부족해 자동 저장하지 못했어요.';}});
let initialSaved=autosave.read();
const effectDefaults={sfxMode:'auto',sfxGain:'0.15',transition:'dissolve',transitionDuration:'0.3',motion:'clean',cameraMotion:'none'};
function effectMode(){document.querySelectorAll('[data-manual-sound]').forEach(el=>el.hidden=$('sfxMode').value!=='manual');$('autoSoundNote').hidden=$('sfxMode').value!=='auto';}
const soundLibrary=createSoundLibrary({$,safe,project:()=>project,json,file,toast,changed:clearOutput,isWorking:()=>working});
const faceEditor=createFaceEditor({$,json,file,toast,clips:()=>clips,project:()=>project,changed:()=>{clearOutput();showClips();saveDraft();},onDraftChange:()=>saveDraft()});
const dictation=bindDictation({toast,isWorking:()=>working});
document.querySelectorAll('.section-toggle').forEach(b=>b.onclick=()=>{const content=b.closest('section').querySelector('.section-content');content.hidden=!content.hidden;b.setAttribute('aria-expanded',String(!content.hidden));b.querySelector('span').textContent=content.hidden?'⌄':'⌃';saveDraft();});
$('faceStrength').oninput=()=>{$('faceStrengthValue').textContent=Math.round(Number($('faceStrength').value)*100)+'%';clearOutput();};$('autoFaces').onchange=clearOutput;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function status(message,percent){$('status').textContent=message;if(percent!==undefined)$('progressBar').style.width=percent+'%';}
function busy(on){working=on;if(on)dictation?.stop();for(const id of ['generate','render','newProject','files'])$(id).disabled=on;document.querySelectorAll('.clip input,.clip button,#details input,#details textarea,#target,#tone,#voice,#speed,#fit,#originalVolume,#title,#segments textarea,#segments select,#segments input,#review,.face-settings input,#faceDialog input,#saveFaces,.effects-panel select,.effects-panel input,.effects-panel button').forEach(el=>el.disabled=on);soundLibrary.setBusy();}
async function bridge(path,data){
 const r=await fetch(BASE+path,{method:data?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const d=await r.json();if(!r.ok){if(r.status===401){token='';localStorage.removeItem('haejja-mac-token');$('connectPanel').hidden=false;}throw Error(d.error||'연결 오류');}return d;
}
async function api(path,data){
 if(!LOCAL&&!token){$('connectPanel').hidden=false;throw Error('먼저 제작실 접속 코드를 입력하세요.');}
 const r=await fetch(LOCAL?path:BASE+'/cloud'+path,{method:data?'POST':'GET',headers:{...(!LOCAL?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const d=await r.json();if(!r.ok){if(r.status===401){token='';localStorage.removeItem('haejja-mac-token');$('connectPanel').hidden=false;}throw Error(d.error||'서버 요청에 실패했습니다.');}return{code:r.status,data:d};
}
async function json(path,data){return(await api(path,data)).data;}
async function file(name){const path='/food-media/'+project.id+'/'+name;return fetch(LOCAL?path:BASE+'/cloud'+path,{headers:!LOCAL?{Authorization:'Bearer '+token}:{}});}
async function connection(){
 if(!LOCAL&&!token){$('connectionState').textContent='제작실 접속 필요';$('connectPanel').hidden=false;return;}
 try{if(!await soundLibrary.ready)throw Error('전체 효과음 목록을 불러오지 못했어요. 새로고침해 주세요.');status('제작 서버에 연결 중이에요. 첫 접속은 잠시 걸릴 수 있어요.');const h=await json('/api/food/health');limits=h.limits;showClips();$('uploadLimits').textContent=`MP4 · MOV / 파일당 ${limits.fileMB}MB / 합계 ${limits.totalMB}MB / 최대 ${limits.clips}개`;$('connectionState').textContent='저장한 작업 확인 중';$('connectPanel').hidden=true;if(LOCAL)$('connectToggle').hidden=true;status('영상부터 추가하거나 가게 정보를 먼저 적어보세요.');await history();await restore();$('connectionState').textContent=h.deepseek?(h.mode==='cloud'?'서버 · 딥시크 연결됨':'맥 · 딥시크 연결됨'):'딥시크 연결 확인 필요';}catch(e){status(e.message);$('connectionState').textContent='서버 연결 확인 필요';}
}
$('connectToggle').onclick=()=>$('connectPanel').hidden=!$('connectPanel').hidden;
$('connectForm').onsubmit=async e=>{e.preventDefault();try{const d=await bridge('/bridge/pair',{code:$('connectCode').value});token=d.token;localStorage.setItem('haejja-mac-token',token);$('connectCode').value='';$('connectPanel').hidden=true;await connection();}catch(e){$('connectError').textContent=e.message;}};
function form(){return Object.fromEntries(['name','location','menus','impressions','target','tone'].map(k=>[k,$(k).value]));}
function remember(){if(project)localStorage.setItem('food-reel-project',project.id);}
function capturePlan(){
 if(!project?.plan)return null;
 return {...project.plan,title:$('title').value,review:$('review').value,segments:project.plan.segments.map((s,i)=>{const field=k=>$('segments').querySelector(`[data-${k}="${i}"]`);return{...s,narration:field('segment')?.value??s.narration,graphicLabel:field('graphic')?.value??s.graphicLabel,sound:field('sound')?.value||s.sound,soundStart:field('sound-start')?.value??s.soundStart,soundLength:field('sound-length')?.value??s.soundLength};})};
}
function saveDraft(){
 if(hydrating)return;
 const state={projectId:project?.id||null,project:project?{...project,clips:undefined,selectedClips:undefined}:null,phase:pendingAction==='generate'?'analyzing':pendingAction==='render'?'rendering':project?.status||'new',fields:Object.fromEntries(savedFieldIds.map(k=>[k,$(k).type==='checkbox'?$(k).checked:$(k).value])),clips,plan:capturePlan(),draftInvalid,outputDirty,sections:[...document.querySelectorAll('.section-toggle')].map(b=>b.getAttribute('aria-expanded')==='true'),soundPreview:soundLibrary.previewState(),faces:faceEditor.snapshot()};
 if(autosave.save(state)&&$('autosaveState').textContent!=='이 브라우저에 자동 저장됨')$('autosaveState').textContent='이 브라우저에 자동 저장됨';
}
function applySaved(state,{server=false}={}){
 if(!state)return;hydrating=true;
 try{
  if(!server){project=state.projectId?{...state.project,id:state.projectId,clips:state.clips,selectedClips:state.clips,plan:state.plan}:null;clips=state.clips;}
  else clips=mergeSavedClips(project.clips||[],state.clips);
  if(state.plan){
   const desiredClips=clips;
   const sources=[...clips,...(project?.clips||[])];
   const planClips=state.plan.segments.map(s=>sources.find(c=>c.id===s.clipId));
   if(canRestorePlan(state.plan,clips)||(state.draftInvalid&&planClips.every(Boolean))){project={...project,plan:state.plan,selectedClips:planClips};draft(project);clips=desiredClips;}
  }
  for(const [k,v]of Object.entries(state.fields))if(savedFieldIds.includes(k)){if($(k).type==='checkbox')$(k).checked=!!v;else $(k).value=String(v??'');}
  outputDirty=!!state.outputDirty;draftInvalid=!!state.draftInvalid;
  if(draftInvalid){$('draftPanel').hidden=true;$('reviewPanel').hidden=true;}
  $('faceStrengthValue').textContent=Math.round(Number($('faceStrength').value)*100)+'%';effectMode();countReview();showClips();faceEditor.restore(state.faces||{});soundLibrary.restorePreview(state.soundPreview);
  state.sections?.forEach((open,i)=>{const b=document.querySelectorAll('.section-toggle')[i];if(!b)return;b.closest('section').querySelector('.section-content').hidden=!open;b.setAttribute('aria-expanded',String(!!open));b.querySelector('span').textContent=open?'⌃':'⌄';});
 }finally{hydrating=false;}
 $('autosaveState').textContent='저장한 입력을 복원했어요';
}
async function ensure(){if(!project){project=await json('/api/food/new',{});remember();saveDraft();}return project;}
function clipPayload(){return clips.filter(c=>c.ready).map(c=>({id:c.id,start:Number(c.start||0),end:Number(c.end??c.duration),note:c.note||''}));}
function invalidate(){if(project?.plan){draftInvalid=true;$('draftPanel').hidden=true;$('reviewPanel').hidden=true;}clearOutput();}
function clearOutput(markDirty=true){if(markDirty)outputDirty=true;outputBlob=null;$('shareVideo').hidden=true;if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl='';$('output').pause();$('output').removeAttribute('src');$('output').hidden=true;$('emptyPreview').hidden=false;$('downloadPanel').hidden=true;}
for(const id of ['name','location','menus','impressions','target','tone'])$(id).addEventListener('input',()=>{invalidate();status('입력 내용이 바뀌었어요. 멘트를 다시 생성하세요.',0);});
function showClips(){
 $('clipCount').textContent=clips.length+' / '+limits.clips;$('clips').innerHTML=clips.map((c,i)=>`<article class="clip"><${c.thumb?'img':'div'} class="clip-thumb" ${c.thumb?`src="${safe(c.thumb)}" alt="${safe(c.name)} 장면 미리보기"`:''}></${c.thumb?'img':'div'}><div><div class="clip-head"><strong>${i+1}. ${safe(c.name)}</strong><button data-move="${i}" data-dir="-1" aria-label="영상 위로 이동" ${i===0?'disabled':''}>↑</button><button data-move="${i}" data-dir="1" aria-label="영상 아래로 이동" ${i===clips.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="영상 제외">×</button></div><label>메뉴 · 장면 설명<input data-note="${i}" value="${safe(c.note)}" placeholder="예: 파스타를 포크로 들어 올리는 장면" maxlength="300"></label><div class="times"><label>시작(초)<input data-time="start" data-i="${i}" type="number" min="0" step="0.1" max="${c.duration||600}" value="${Number(c.start||0).toFixed(1)}"></label><label>끝(초)<input data-time="end" data-i="${i}" type="number" min="0.1" step="0.1" max="${c.duration||600}" value="${Number(c.end??c.duration??0).toFixed(1)}"></label></div><p>${c.ready?`${c.duration.toFixed(1)}초 · ${(c.size/1048576).toFixed(1)}MB`:safe(c.uploadStatus||'업로드 중')}</p>${c.ready?`<button class="quiet" type="button" data-faces="${i}">얼굴 블러 확인 · 추가</button><small>${c.faceStatus==='ready'?`자동 얼굴 ${c.faceScan?.detections||0}회 확인 · 추가 ${c.manualFaces?.length||0}개`:c.faceStatus==='failed'?safe(c.faceError):'자동 얼굴 확인 중…'}</small>`:''}</div></article>`).join('');
 $('clips').querySelectorAll('[data-faces]').forEach(b=>b.onclick=()=>{if(!working)faceEditor.open(Number(b.dataset.faces));});
 $('clips').querySelectorAll('[data-note]').forEach(el=>el.oninput=()=>{clips[el.dataset.note].note=el.value;invalidate();});
 $('clips').querySelectorAll('[data-time]').forEach(el=>el.oninput=()=>{clips[el.dataset.i][el.dataset.time]=Number(el.value);invalidate();});
 $('clips').querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{if(working)return;const i=Number(el.dataset.move),j=i+Number(el.dataset.dir);[clips[i],clips[j]]=[clips[j],clips[i]];invalidate();showClips();saveDraft();});
 $('clips').querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{if(working)return;clips.splice(Number(el.dataset.remove),1);invalidate();showClips();saveDraft();});
}
async function thumbnail(file){return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);v.preload='auto';v.muted=true;v.src=url;let done=false;const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);v.removeAttribute('src');v.load();resolve(value);};v.onerror=()=>finish('');v.onloadedmetadata=()=>{v.currentTime=Math.min(.5,v.duration/2);};v.onseeked=()=>{try{const c=document.createElement('canvas');c.width=180;c.height=240;const x=c.getContext('2d');x.drawImage(v,0,0,180,240);finish(c.toDataURL('image/jpeg',.65));}catch{finish('');}};setTimeout(()=>finish(''),6000);});}
function base64(array){let s='';for(let i=0;i<array.length;i+=8192)s+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(s);}
async function upload(list){
 if(working||uploading)return;const files=[...list];if(!files.length)return;busy(true);uploading=true;
 try{
  await ensure();invalidate();
  for(const f of files){
   if(clips.length>=limits.clips&&!clips.some(c=>!c.ready&&c.name===f.name&&c.size===f.size))throw Error(`한 작업에는 영상 ${limits.clips}개까지 추가할 수 있어요.`);if(f.size>limits.fileMB*1048576)throw Error(`${f.name}은 ${limits.fileMB}MB를 초과해요.`);
   status(f.name+' · 업로드 준비 중',0);
   let c=clips.find(c=>!c.ready&&c.name===f.name&&c.size===f.size);
   if(!c){c=await json('/api/food/clip',{id:project.id,name:f.name,size:f.size});c.note='';clips.push(c);}
   c.thumb=c.thumb||await thumbnail(f);showClips();saveDraft();
   for(let offset=c.uploaded||0;offset<f.size;offset+=524288){const bytes=new Uint8Array(await f.slice(offset,offset+524288).arrayBuffer());await json('/api/food/chunk',{id:project.id,clipId:c.id,offset,chunk:base64(bytes)});const pct=Math.round(Math.min(f.size,offset+bytes.length)/f.size*100);c.uploaded=Math.min(f.size,offset+bytes.length);c.uploadStatus='업로드 '+pct+'%';status(f.name+' · 업로드 '+pct+'%',pct);showClips();}
   Object.assign(c,await json('/api/food/finish',{id:project.id,clipId:c.id}));c.end=c.duration;c.start=0;showClips();
   status(f.name+' · 사람 얼굴 자동 확인 중',100);
   while(c.faceStatus==='analyzing'){await sleep(1200);const d=await json('/api/food/project/'+project.id);Object.assign(c,d.clips.find(x=>x.id===c.id));showClips();}
   if(c.faceStatus==='failed')throw Error(c.faceError);
  }
  status('영상이 준비됐어요. 장면 설명을 넣고 멘트를 만들어 보세요.',0);
 }catch(e){toast(e.message);status(e.message,0);}finally{busy(false);uploading=false;$('files').value='';saveDraft();}
}
$('files').onchange=()=>upload($('files').files);
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag');};$('drop').ondragleave=()=>$('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');upload(e.dataTransfer.files);};
function countReview(){const value=$('review').value,n=Array.from(value).length,tags=value.match(/#[\p{L}\p{N}_]+/gu)||[];const valid=n<=200&&tags.length===5&&new Set(tags).size===5;$('reviewCount').textContent=n+' / 200자';$('reviewCount').classList.toggle('invalid',!valid);$('tagCount').textContent='해시태그 '+tags.length+'개';return valid;}
$('review').oninput=()=>{countReview();clearOutput();};
function draft(d){project=d;draftInvalid=false;remember();clips=d.selectedClips.map(c=>({...clips.find(x=>x.id===c.id),...c}));showClips();$('draftPanel').hidden=false;$('reviewPanel').hidden=false;$('title').value=d.plan.title;$('review').value=d.plan.review;$('target').value=d.plan.target;
 $('segments').innerHTML=d.plan.segments.map((s,i)=>`<div class="segment"><label>${i+1}. ${safe(d.selectedClips[i].note||d.selectedClips[i].visualSummary||d.selectedClips[i].name)}<textarea id="narration-${i}" data-segment="${i}" rows="2" maxlength="100">${safe(s.narration)}</textarea><button class="quiet" type="button" data-dictate="narration-${i}">🎙 멘트 음성 입력</button><small data-speech-status role="status"></small></label><div class="two segment-options"><label>영상에 보일 메뉴 이름표<input id="graphic-${i}" data-graphic="${i}" maxlength="24" value="${safe(s.graphicLabel||'')}" placeholder="예: 트러플 파스타 (선택)"><button class="quiet" type="button" data-dictate="graphic-${i}">🎙 이름표 음성 입력</button><small data-speech-status role="status"></small></label></div>${soundLibrary.segmentHTML(i,s)}<small>이 장면에 들어갈 음성 · 자막${['local-vision','deepseek-vision'].includes(d.selectedClips[i].sceneSource)?' · 대표 장면 자동 확인':''}</small></div>`).join('');
 $('segments').querySelectorAll('textarea,input').forEach(el=>el.oninput=clearOutput);soundLibrary.bind(d.plan.segments);for(const k of effectIds)$(k).value=String(d.effects?.[k]??effectDefaults[k]);if(d.effects?.autoPlacementVersion!==2)$('sfxMode').value='auto';effectMode();$('title').oninput=clearOutput;countReview();
}
$('generate').onclick=async()=>{
 if(!$('details').reportValidity())return;if(!clips.length||clips.some(c=>!c.ready)){toast('업로드가 끝난 영상부터 선택해 주세요.');return;}
 pendingAction='generate';busy(true);status('촬영 장면에 맞춰 멘트와 200자 리뷰를 만드는 중',15);clearOutput();
 saveDraft();const runEpoch=++epoch;
 const progressTimer=setInterval(async()=>{try{const d=await json('/api/food/project/'+project.id);if(working&&d.progress)status(d.progress,20);}catch{}},4000);
 try{const d=await json('/api/food/generate',{id:project.id,...form(),clips:clipPayload()});project=d;saveDraft();await poll(d.id,runEpoch);status('멘트와 리뷰가 준비됐어요. 확인한 뒤 릴스를 완성하세요.',35);}
 catch(e){toast(e.message);status(e.message,0);}finally{clearInterval(progressTimer);pendingAction='';busy(false);saveDraft();}
};
function currentPlan(){return{...project.plan,title:$('title').value,review:$('review').value,segments:project.plan.segments.map((s,i)=>({...s,narration:$('segments').querySelector(`[data-segment="${i}"]`).value,graphicLabel:$('segments').querySelector(`[data-graphic="${i}"]`).value,...soundLibrary.values(i)}))};}
async function poll(id,runEpoch){
 while(runEpoch===epoch&&project?.id===id){const d=await json('/api/food/project/'+id);project=d;status(d.error||d.progress,d.percent||0);if(d.status==='ready'){await ready(d);saveDraft();await history();return;}if(d.status==='draft'){draft(d);saveDraft();await history();return;}if(d.status==='failed')throw Error(d.error);if(!['queued','rendering','analyzing'].includes(d.status))return;await sleep(2200);}
}
for(const k of effectIds)$(k).onchange=()=>{effectMode();clearOutput();};
$('render').onclick=async()=>{
 if(!countReview()){toast('해시태그 5개를 포함해 리뷰를 200자 이내로 맞춰 주세요.');return;}pendingAction='render';busy(true);clearOutput();saveDraft();const runEpoch=++epoch;
 try{const d=await json('/api/food/render',{id:project.id,plan:currentPlan(),effects:Object.fromEntries(effectIds.map(k=>[k,$(k).value])),voice:$('voice').value,speed:Number($('speed').value),originalVolume:Number($('originalVolume').value),fit:$('fit').value,autoFaces:$('autoFaces').checked,faceStrength:Number($('faceStrength').value)});project=d;saveDraft();await poll(d.id,runEpoch);}
 catch(e){toast(e.message);status(e.message);}finally{pendingAction='';busy(false);saveDraft();}
};
async function ready(d){outputDirty=false;const r=await file('reel.mp4');if(!r.ok)throw Error('완성 영상 전송이 중단됐어요. 최근 작업에서 다시 열어 주세요.');if(outputUrl)URL.revokeObjectURL(outputUrl);outputBlob=await r.blob();outputUrl=URL.createObjectURL(outputBlob);$('shareVideo').hidden=!navigator.canShare?.({files:[new File([outputBlob],'reel.mp4',{type:'video/mp4'})]});$('output').src=outputUrl;$('output').hidden=false;$('emptyPreview').hidden=true;$('downloadVideo').href=outputUrl;$('downloadVideo').download=(d.info.name||'식당리뷰')+'-릴스.mp4';$('downloadPanel').hidden=false;$('videoMeta').textContent=d.video.duration.toFixed(1)+'초 · 720 × 1280 · 한국어 음성 & 자막'+(d.soundSummary?.mode==='auto'?' · 효과음 '+d.soundSummary.count+'개 자동 적용':'');status('릴스가 완성됐어요. 재생해서 확인한 뒤 저장하세요.',100);}
async function downloadText(name){try{const r=await file(name);if(!r.ok)throw Error('파일을 내려받지 못했습니다.');const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download=(project.info.name||'식당리뷰')+'-'+name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}catch(e){toast(e.message);}}
$('shareVideo').onclick=async()=>{if(!outputBlob)return;try{await navigator.share({files:[new File([outputBlob],(project.info.name||'식당리뷰')+'-릴스.mp4',{type:'video/mp4'})]});}catch(e){if(e.name!=='AbortError')toast('공유를 열지 못했어요. MP4 저장을 이용해 주세요.');}};
$('downloadSrt').onclick=()=>downloadText('captions.srt');$('downloadReview').onclick=()=>downloadText('review.txt');
$('copyReview').onclick=async()=>{try{await navigator.clipboard.writeText($('review').value);toast('리뷰를 복사했어요.');}catch{$('review').select();toast('리뷰를 선택했어요. 복사해 주세요.');}};
async function load(id,{saved=null}={}){
 if(working)return;busy(true);const runEpoch=++epoch;hydrating=true;
 try{
  const d=await json('/api/food/project/'+id);const latest=saved?(autosave.read()||saved):null;
  project=d;remember();clearOutput(false);outputDirty=false;draftInvalid=false;
  for(const k of ['name','location','menus','impressions'])$(k).value=d.info?.[k]||'';
  clips=(d.selectedClips||d.clips).map(c=>({...c,faceScan:d.clips.find(x=>x.id===c.id)?.faceScan,faceStatus:d.clips.find(x=>x.id===c.id)?.faceStatus,manualFaces:d.clips.find(x=>x.id===c.id)?.manualFaces||[],end:c.end??c.duration}));
  for(const c of clips)if(!c.ready)c.uploadStatus='업로드가 중단됐어요. 같은 원본 파일을 다시 선택하면 이어서 올려요.';
  showClips();if(d.plan)draft(d);else{$('draftPanel').hidden=true;$('reviewPanel').hidden=true;}
  if(d.voice)$('voice').value=d.voice;if(d.speed)$('speed').value=d.speed;if(d.fit)$('fit').value=d.fit;
  $('autoFaces').checked=d.autoFaces!==false;$('faceStrength').value=d.faceStrength??.7;$('faceStrengthValue').textContent=Math.round(Number($('faceStrength').value)*100)+'%';if(d.originalVolume!==undefined)$('originalVolume').value=d.originalVolume;
  const running=['queued','rendering','analyzing'].includes(d.status);
  if(latest?.projectId===id){
   const completedPending=['queued','rendering','analyzing'].includes(latest.phase)&&(d.status!==latest.project?.status||JSON.stringify(d.plan)!==JSON.stringify(latest.project?.plan)||(d.completed||0)>(latest.project?.completed||0));
   const restoreState=running||completedPending?{...latest,plan:null,draftInvalid:false,outputDirty:false,fields:Object.fromEntries(Object.entries(latest.fields).filter(([k])=>!['title','review'].includes(k)))}:latest;
   applySaved(restoreState,{server:true});
  }
  hydrating=false;status(d.error||d.progress,d.percent||0);
  if(running)await poll(id,runEpoch);
  else if(d.status==='ready'&&!outputDirty&&!draftInvalid)await ready(d);
  else if(saved)status(d.error||'저장한 내용을 복원했어요. 수정한 내용으로 이어서 제작할 수 있어요.');
  saveDraft();
 }catch(e){hydrating=false;if(saved){applySaved(autosave.read()||saved);status('입력과 수정 내용은 복원했어요. 서버의 임시 영상은 만료됐을 수 있어요. 연결을 확인하거나 영상을 다시 추가해 주세요.');}else toast(e.message);}
 finally{hydrating=false;busy(false);}
}
async function history(){try{const d=await json('/api/food/projects');$('history').innerHTML=d.projects.length?d.projects.map(p=>`<div class="history-item"><button class="quiet" data-load="${p.id}">${safe(p.info?.name||'새 식당 리뷰')}</button><button class="quiet" data-delete="${p.id}" aria-label="작업 삭제">삭제</button><span>${safe(({ready:'완성',draft:'멘트 준비',analyzing:'장면 확인',rendering:'제작 중',queued:'대기 중',failed:'재시도 가능',uploading:'영상 준비'})[p.status]||p.status)}</span></div>`).join(''):'<p class="helper">아직 저장된 작업이 없어요.</p>';$('history').querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>load(b.dataset.load));$('history').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(working)return;try{await json('/api/food/delete',{id:b.dataset.delete});if(project?.id===b.dataset.delete)$('newProject').click();await history();}catch(e){toast(e.message);}});}catch(e){$('history').textContent=e.message;}}
$('refreshHistory').onclick=history;
$('newProject').onclick=()=>{if(working)return;autosave.clear();initialSaved=null;faceEditor.restore({});epoch++;project=null;clips=[];localStorage.removeItem('food-reel-project');$('details').reset();$('title').value='';$('review').value='';$('segments').replaceChildren();$('voice').value='injoon';$('speed').value='1.4';$('autoFaces').checked=true;$('faceStrength').value=.7;$('faceStrengthValue').textContent='70%';for(const k of effectIds)$(k).value=effectDefaults[k];effectMode();$('draftPanel').hidden=true;$('reviewPanel').hidden=true;clearOutput(false);outputDirty=false;draftInvalid=false;showClips();status('새 식당 리뷰를 시작하세요.',0);saveDraft();};
async function restore(){if(restoredOnce)return;restoredOnce=true;const saved=autosave.read();const id=saved?saved.projectId:localStorage.getItem('food-reel-project');if(id)await load(id,{saved:saved?.projectId===id?saved:null});}
document.addEventListener('input',e=>{if(!e.target.closest('#connectPanel'))saveDraft();});
document.addEventListener('change',e=>{if(!e.target.closest('#connectPanel')&&e.target.id!=='files')saveDraft();});
document.addEventListener('click',e=>{if(e.target.closest('[data-sound-apply]'))saveDraft();});
window.addEventListener('pagehide',saveDraft);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();});
if(initialSaved){applySaved(initialSaved);soundLibrary.ready.then(()=>{if(!restoredOnce)applySaved(autosave.read()||initialSaved);});}
connection();
