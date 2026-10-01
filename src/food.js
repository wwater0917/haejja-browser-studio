import './food.css';
import {createSoundLibrary} from './food-sounds.js';
const $=id=>document.getElementById(id), BASE='https://haejja-free-helper.onrender.com';
const LOCAL=import.meta.env.DEV&&['127.0.0.1','localhost'].includes(location.hostname);
let limits={clips:6,fileMB:80,totalMB:200},outputBlob=null;
let token=localStorage.getItem('haejja-mac-token')||'',project=null,clips=[],working=false,uploading=false,epoch=0,outputUrl='',toastTimer;
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const effectIds=['sfxMode','sfxGain','transition','transitionDuration','motion','cameraMotion'];
const effectDefaults={sfxMode:'auto',sfxGain:'0.15',transition:'dissolve',transitionDuration:'0.3',motion:'clean',cameraMotion:'none'};
function effectMode(){document.querySelectorAll('[data-manual-sound]').forEach(el=>el.hidden=$('sfxMode').value!=='manual');$('autoSoundNote').hidden=$('sfxMode').value!=='auto';}
const soundLibrary=createSoundLibrary({$,safe,project:()=>project,json,file,toast,changed:clearOutput,isWorking:()=>working});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function status(message,percent){$('status').textContent=message;if(percent!==undefined)$('progressBar').style.width=percent+'%';}
function busy(on){working=on;for(const id of ['generate','render','newProject','files'])$(id).disabled=on;document.querySelectorAll('.clip input,.clip button,#details input,#details textarea,#target,#tone,#voice,#speed,#fit,#originalVolume,#title,#segments textarea,#segments select,#segments input,#review,.effects-panel select,.effects-panel input,.effects-panel button').forEach(el=>el.disabled=on);soundLibrary.setBusy();}
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
 try{if(!await soundLibrary.ready)throw Error('전체 효과음 목록을 불러오지 못했어요. 새로고침해 주세요.');status('제작 서버에 연결 중이에요. 첫 접속은 잠시 걸릴 수 있어요.');const h=await json('/api/food/health');limits=h.limits;showClips();$('uploadLimits').textContent=`MP4 · MOV / 파일당 ${limits.fileMB}MB / 합계 ${limits.totalMB}MB / 최대 ${limits.clips}개`;$('connectionState').textContent=h.deepseek?(h.mode==='cloud'?'서버 · 딥시크 연결됨':'맥 · 딥시크 연결됨'):'딥시크 연결 확인 필요';$('connectPanel').hidden=true;if(LOCAL)$('connectToggle').hidden=true;status('가게 정보와 영상을 추가해 시작하세요.');await history();await restore();}catch(e){status(e.message);$('connectionState').textContent='서버 연결 확인 필요';}
}
$('connectToggle').onclick=()=>$('connectPanel').hidden=!$('connectPanel').hidden;
$('connectForm').onsubmit=async e=>{e.preventDefault();try{const d=await bridge('/bridge/pair',{code:$('connectCode').value});token=d.token;localStorage.setItem('haejja-mac-token',token);$('connectCode').value='';$('connectPanel').hidden=true;await connection();}catch(e){$('connectError').textContent=e.message;}};
function form(){return Object.fromEntries(['name','location','menus','impressions','target','tone'].map(k=>[k,$(k).value]));}
function remember(){if(project)localStorage.setItem('food-reel-project',project.id);}
async function ensure(){if(!project){project=await json('/api/food/new',{});remember();}return project;}
function clipPayload(){return clips.filter(c=>c.ready).map(c=>({id:c.id,start:Number(c.start||0),end:Number(c.end??c.duration),note:c.note||''}));}
function invalidate(){if(project?.plan){project.plan=null;$('draftPanel').hidden=true;$('reviewPanel').hidden=true;}clearOutput();}
function clearOutput(){outputBlob=null;$('shareVideo').hidden=true;if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl='';$('output').pause();$('output').removeAttribute('src');$('output').hidden=true;$('emptyPreview').hidden=false;$('downloadPanel').hidden=true;}
for(const id of ['name','location','menus','impressions','target','tone'])$(id).addEventListener('input',()=>{invalidate();status('입력 내용이 바뀌었어요. 멘트를 다시 생성하세요.',0);});
function showClips(){
 $('clipCount').textContent=clips.length+' / '+limits.clips;$('clips').innerHTML=clips.map((c,i)=>`<article class="clip"><${c.thumb?'img':'div'} class="clip-thumb" ${c.thumb?`src="${safe(c.thumb)}" alt="${safe(c.name)} 장면 미리보기"`:''}></${c.thumb?'img':'div'}><div><div class="clip-head"><strong>${i+1}. ${safe(c.name)}</strong><button data-move="${i}" data-dir="-1" aria-label="영상 위로 이동" ${i===0?'disabled':''}>↑</button><button data-move="${i}" data-dir="1" aria-label="영상 아래로 이동" ${i===clips.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="영상 제외">×</button></div><label>메뉴 · 장면 설명<input data-note="${i}" value="${safe(c.note)}" placeholder="예: 파스타를 포크로 들어 올리는 장면" maxlength="300"></label><div class="times"><label>시작(초)<input data-time="start" data-i="${i}" type="number" min="0" step="0.1" max="${c.duration||600}" value="${Number(c.start||0).toFixed(1)}"></label><label>끝(초)<input data-time="end" data-i="${i}" type="number" min="0.1" step="0.1" max="${c.duration||600}" value="${Number(c.end??c.duration??0).toFixed(1)}"></label></div><p>${c.ready?`${c.duration.toFixed(1)}초 · ${(c.size/1048576).toFixed(1)}MB`:safe(c.uploadStatus||'업로드 중')}</p></div></article>`).join('');
 $('clips').querySelectorAll('[data-note]').forEach(el=>el.oninput=()=>{clips[el.dataset.note].note=el.value;invalidate();});
 $('clips').querySelectorAll('[data-time]').forEach(el=>el.oninput=()=>{clips[el.dataset.i][el.dataset.time]=Number(el.value);invalidate();});
 $('clips').querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{if(working)return;const i=Number(el.dataset.move),j=i+Number(el.dataset.dir);[clips[i],clips[j]]=[clips[j],clips[i]];invalidate();showClips();});
 $('clips').querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{if(working)return;clips.splice(Number(el.dataset.remove),1);invalidate();showClips();});
}
async function thumbnail(file){return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);v.preload='auto';v.muted=true;v.src=url;let done=false;const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);v.removeAttribute('src');v.load();resolve(value);};v.onerror=()=>finish('');v.onloadedmetadata=()=>{v.currentTime=Math.min(.5,v.duration/2);};v.onseeked=()=>{try{const c=document.createElement('canvas');c.width=180;c.height=240;const x=c.getContext('2d');x.drawImage(v,0,0,180,240);finish(c.toDataURL('image/jpeg',.65));}catch{finish('');}};setTimeout(()=>finish(''),6000);});}
function base64(array){let s='';for(let i=0;i<array.length;i+=8192)s+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(s);}
async function upload(list){
 if(working||uploading)return;const files=[...list];if(!files.length)return;busy(true);uploading=true;
 try{
  await ensure();invalidate();
  for(const f of files){
   if(clips.length>=limits.clips)throw Error(`한 작업에는 영상 ${limits.clips}개까지 추가할 수 있어요.`);if(f.size>limits.fileMB*1048576)throw Error(`${f.name}은 ${limits.fileMB}MB를 초과해요.`);
   status(f.name+' · 업로드 준비 중',0);
   const c=await json('/api/food/clip',{id:project.id,name:f.name,size:f.size});c.thumb=await thumbnail(f);c.note='';clips.push(c);showClips();
   for(let offset=0;offset<f.size;offset+=524288){const bytes=new Uint8Array(await f.slice(offset,offset+524288).arrayBuffer());await json('/api/food/chunk',{id:project.id,clipId:c.id,offset,chunk:base64(bytes)});const pct=Math.round(Math.min(f.size,offset+bytes.length)/f.size*100);c.uploadStatus='업로드 '+pct+'%';status(f.name+' · 업로드 '+pct+'%',pct);showClips();}
   Object.assign(c,await json('/api/food/finish',{id:project.id,clipId:c.id}));c.end=c.duration;c.start=0;showClips();
  }
  status('영상이 준비됐어요. 장면 설명을 넣고 멘트를 만들어 보세요.',0);
 }catch(e){toast(e.message);status(e.message,0);}finally{busy(false);uploading=false;$('files').value='';}
}
$('files').onchange=()=>upload($('files').files);
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag');};$('drop').ondragleave=()=>$('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');upload(e.dataTransfer.files);};
function countReview(){const value=$('review').value,n=Array.from(value).length,tags=value.match(/#[\p{L}\p{N}_]+/gu)||[];const valid=n<=200&&tags.length===5&&new Set(tags).size===5;$('reviewCount').textContent=n+' / 200자';$('reviewCount').classList.toggle('invalid',!valid);$('tagCount').textContent='해시태그 '+tags.length+'개';return valid;}
$('review').oninput=()=>{countReview();clearOutput();};
function draft(d){project=d;remember();clips=d.selectedClips.map(c=>({...clips.find(x=>x.id===c.id),...c}));showClips();$('draftPanel').hidden=false;$('reviewPanel').hidden=false;$('title').value=d.plan.title;$('review').value=d.plan.review;$('target').value=d.plan.target;
 $('segments').innerHTML=d.plan.segments.map((s,i)=>`<div class="segment"><label>${i+1}. ${safe(d.selectedClips[i].note||d.selectedClips[i].visualSummary||d.selectedClips[i].name)}<textarea data-segment="${i}" rows="2" maxlength="100">${safe(s.narration)}</textarea></label><div class="two segment-options"><label>움직이는 메뉴 카드<input data-graphic="${i}" maxlength="24" value="${safe(s.graphicLabel||'')}" placeholder="예: 트러플 파스타 (선택)"></label></div>${soundLibrary.segmentHTML(i,s)}<small>이 장면에 들어갈 음성 · 자막${['local-vision','deepseek-vision'].includes(d.selectedClips[i].sceneSource)?' · 대표 장면 자동 확인':''}</small></div>`).join('');
 $('segments').querySelectorAll('textarea,input').forEach(el=>el.oninput=clearOutput);soundLibrary.bind(d.plan.segments);for(const k of effectIds)$(k).value=String(d.effects?.[k]??effectDefaults[k]);if(d.effects?.autoPlacementVersion!==2)$('sfxMode').value='auto';effectMode();$('title').oninput=clearOutput;countReview();
}
$('generate').onclick=async()=>{
 if(!$('details').reportValidity())return;if(!clips.length||clips.some(c=>!c.ready)){toast('업로드가 끝난 영상부터 선택해 주세요.');return;}
 busy(true);status('촬영 장면에 맞춰 멘트와 200자 리뷰를 만드는 중',15);clearOutput();
 const runEpoch=++epoch;
 const progressTimer=setInterval(async()=>{try{const d=await json('/api/food/project/'+project.id);if(working&&d.progress)status(d.progress,20);}catch{}},4000);
 try{const d=await json('/api/food/generate',{id:project.id,...form(),clips:clipPayload()});project=d;await poll(d.id,runEpoch);status('멘트와 리뷰가 준비됐어요. 확인한 뒤 릴스를 완성하세요.',35);}
 catch(e){toast(e.message);status(e.message,0);}finally{clearInterval(progressTimer);busy(false);}
};
function currentPlan(){return{...project.plan,title:$('title').value,review:$('review').value,segments:project.plan.segments.map((s,i)=>({...s,narration:$('segments').querySelector(`[data-segment="${i}"]`).value,graphicLabel:$('segments').querySelector(`[data-graphic="${i}"]`).value,...soundLibrary.values(i)}))};}
async function poll(id,runEpoch){
 while(runEpoch===epoch&&project?.id===id){const d=await json('/api/food/project/'+id);project=d;status(d.error||d.progress,d.percent||0);if(d.status==='ready'){await ready(d);await history();return;}if(d.status==='draft'){draft(d);await history();return;}if(d.status==='failed')throw Error(d.error);if(!['queued','rendering','analyzing'].includes(d.status))return;await sleep(2200);}
}
for(const k of effectIds)$(k).onchange=()=>{effectMode();clearOutput();};
$('render').onclick=async()=>{
 if(!countReview()){toast('해시태그 5개를 포함해 리뷰를 200자 이내로 맞춰 주세요.');return;}busy(true);clearOutput();const runEpoch=++epoch;
 try{const d=await json('/api/food/render',{id:project.id,plan:currentPlan(),effects:Object.fromEntries(effectIds.map(k=>[k,$(k).value])),voice:$('voice').value,speed:Number($('speed').value),originalVolume:Number($('originalVolume').value),fit:$('fit').value});project=d;await poll(d.id,runEpoch);}
 catch(e){toast(e.message);status(e.message);}finally{busy(false);}
};
async function ready(d){const r=await file('reel.mp4');if(!r.ok)throw Error('완성 영상 전송이 중단됐어요. 최근 작업에서 다시 열어 주세요.');if(outputUrl)URL.revokeObjectURL(outputUrl);outputBlob=await r.blob();outputUrl=URL.createObjectURL(outputBlob);$('shareVideo').hidden=!navigator.canShare?.({files:[new File([outputBlob],'reel.mp4',{type:'video/mp4'})]});$('output').src=outputUrl;$('output').hidden=false;$('emptyPreview').hidden=true;$('downloadVideo').href=outputUrl;$('downloadVideo').download=(d.info.name||'식당리뷰')+'-릴스.mp4';$('downloadPanel').hidden=false;$('videoMeta').textContent=d.video.duration.toFixed(1)+'초 · 720 × 1280 · 한국어 음성 & 자막'+(d.soundSummary?.mode==='auto'?' · 효과음 '+d.soundSummary.count+'개 자동 적용':'');status('릴스가 완성됐어요. 재생해서 확인한 뒤 저장하세요.',100);}
async function downloadText(name){try{const r=await file(name);if(!r.ok)throw Error('파일을 내려받지 못했습니다.');const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download=project.info.name+'-'+name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}catch(e){toast(e.message);}}
$('shareVideo').onclick=async()=>{if(!outputBlob)return;try{await navigator.share({files:[new File([outputBlob],(project.info.name||'식당리뷰')+'-릴스.mp4',{type:'video/mp4'})]});}catch(e){if(e.name!=='AbortError')toast('공유를 열지 못했어요. MP4 저장을 이용해 주세요.');}};
$('downloadSrt').onclick=()=>downloadText('captions.srt');$('downloadReview').onclick=()=>downloadText('review.txt');
$('copyReview').onclick=async()=>{try{await navigator.clipboard.writeText($('review').value);toast('리뷰를 복사했어요.');}catch{$('review').select();toast('리뷰를 선택했어요. 복사해 주세요.');}};
async function load(id){if(working)return;busy(true);const runEpoch=++epoch;try{const d=await json('/api/food/project/'+id);project=d;remember();clearOutput();for(const k of ['name','location','menus','impressions'])$(k).value=d.info?.[k]||'';clips=(d.selectedClips||d.clips).filter(c=>c.ready).map(c=>({...c,end:c.end??c.duration}));showClips();if(d.plan)draft(d);else{$('draftPanel').hidden=true;$('reviewPanel').hidden=true;}if(d.voice)$('voice').value=d.voice;if(d.speed)$('speed').value=d.speed;if(d.fit)$('fit').value=d.fit;if(d.originalVolume!==undefined)$('originalVolume').value=d.originalVolume;status(d.error||d.progress,d.percent||0);if(d.status==='ready')await ready(d);else if(['queued','rendering','analyzing'].includes(d.status))await poll(id,runEpoch);}catch(e){toast(e.message);}finally{busy(false);}}
async function history(){try{const d=await json('/api/food/projects');$('history').innerHTML=d.projects.length?d.projects.map(p=>`<div class="history-item"><button class="quiet" data-load="${p.id}">${safe(p.info?.name||'새 식당 리뷰')}</button><button class="quiet" data-delete="${p.id}" aria-label="작업 삭제">삭제</button><span>${safe(({ready:'완성',draft:'멘트 준비',analyzing:'장면 확인',rendering:'제작 중',queued:'대기 중',failed:'재시도 가능',uploading:'영상 준비'})[p.status]||p.status)}</span></div>`).join(''):'<p class="helper">아직 저장된 작업이 없어요.</p>';$('history').querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>load(b.dataset.load));$('history').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(working)return;try{await json('/api/food/delete',{id:b.dataset.delete});if(project?.id===b.dataset.delete)$('newProject').click();await history();}catch(e){toast(e.message);}});}catch(e){$('history').textContent=e.message;}}
$('refreshHistory').onclick=history;
$('newProject').onclick=()=>{if(working)return;epoch++;project=null;clips=[];localStorage.removeItem('food-reel-project');$('details').reset();for(const k of effectIds)$(k).value=effectDefaults[k];effectMode();$('draftPanel').hidden=true;$('reviewPanel').hidden=true;clearOutput();showClips();status('새 식당 리뷰를 시작하세요.',0);};
async function restore(){const id=localStorage.getItem('food-reel-project');if(id&&!project)await load(id);}
connection();
