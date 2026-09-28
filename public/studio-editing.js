/* Live, local ASS-layer compositing; final exports still come from the renderer. */
(() => {
 const q=id=>document.getElementById(id);
 const extras=['english','vocabEn','vocabKo','narration'];
 const labels={english:'하단 영어 자막',vocabEn:'상단 영어 풀이',vocabKo:'상단 한국어 뜻풀이',narration:'나레이션 자막'};
 const fields=document.createElement('div');fields.hidden=true;
 for(const role of extras){q('positionRole').add(new Option(labels[role],role));for(const suffix of ['X','Y','Size']){const input=document.createElement('input');input.id=role+suffix;fields.append(input);positionFields.push(input.id);}}
 q('positionDialog').append(fields);
 const more=document.createElement('div');more.innerHTML='<label for="captionColor">선택한 자막 색상</label><input id="captionColor" type="color"><label for="captionFont">선택한 자막 글꼴</label><select id="captionFont"></select><label for="hostCaptionColor">진행자 · 한글·영어 색상</label><input id="hostCaptionColor" type="color" value="#ffd000"><label for="guestCaptionColor">제니 · 한글·영어 색상</label><input id="guestCaptionColor" type="color" value="#57e5ff">';q('positionApply').before(more);
 let extraStyle={},extraProject=null;
 const oldLayout=layoutStyle;layoutStyle=function(){const values=oldLayout();if(extraProject!==current?.id)return values;for(const role of extras)for(const [suffix,key]of [['X','x'],['Y','y'],['Size','size']])values[role+'_'+key]=+q(role+suffix).value;return {...values,...extraStyle,host_color:q('hostCaptionColor').value,guest_color:q('guestCaptionColor').value};};
 function initExtras(){extraProject=current.id;extraStyle={};for(const role of extras){const group=(current.plan.word_captions||[]).filter(c=>(c.caption_role|| (c.y>1000?'english':c.bubble?'vocabEn':'vocabKo'))===role),first=group[0]||{};for(const [suffix,key,fallback]of [['X','x',540],['Y','y',role==='narration'?1344:role==='english'?1427:514],['Size','size',65.5]])q(role+suffix).value=current.style[role+'_'+key]??(key==='y'&&group.length?Math.min(...group.map(c=>c.y)):first[key]??fallback);for(const key of ['font','color'])extraStyle[role+'_'+key]=current.style[role+'_'+key]??first[key]??(key==='color'?'#ffffff':'');}q('hostCaptionColor').value=current.style.host_color||'#ffd000';q('guestCaptionColor').value=current.style.guest_color||'#57e5ff';q('captionFont').innerHTML=q('titleFont').innerHTML;}
 const oldSync=positionSync;positionSync=function(){oldSync();const role=q('positionRole').value;q('positionSize').max=['english','vocabEn','vocabKo'].includes(role)?80:role==='title'?160:110;q('captionColor').disabled=!extras.includes(role)||role==='english';q('captionColor').value=extraStyle[role+'_color']||'#ffffff';q('captionFont').disabled=!extras.includes(role);q('captionFont').value=extraStyle[role+'_font']||'';};
 const loadImage=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('미리보기 이미지를 불러오지 못했습니다.'));im.src=src;});
 const stage=q('positionImage').parentElement;
 stage.classList.add('live-stage');
 const canvas=document.createElement('canvas');canvas.id='positionCanvas';canvas.width=540;canvas.height=960;canvas.setAttribute('aria-label','크기·위치·색상을 실시간으로 표시하는 미리보기');stage.append(canvas);
 const hint=document.createElement('p');hint.className='frame-guide-note';hint.textContent='슬라이더를 움직이면 즉시 표시됩니다. 잠시 멈추면 정확한 글자 배치로 갱신합니다.';stage.after(hint);
 const banner=document.createElement('div');banner.id='applyProgress';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');q('preview').parentElement.before(banner);
 const live={base:null,layers:[],style:null,at:0,timer:null,busy:false,pending:false,generation:0,rendering:false};
 function tint(image,color){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);return c;}
 function paint(){
  if(!live.base)return;
  const s=layoutStyle(),base=live.style,ctx=canvas.getContext('2d');ctx.clearRect(0,0,540,960);ctx.drawImage(live.base,0,0,540,960);
  for(const layer of live.layers){
   const title=layer.name.startsWith('title_'),role=title?'title':layer.name,ratio=s[role+'_size']/base[role+'_size'];
   const ox=base[role+'_x']??540,oy=base[role+'_y'];let image=layer.image;
   if(layer.name==='title_first')image=tint(image,s.title_first_color);
   if(layer.name==='title_rest')image=tint(image,s.title_rest_color);
   ctx.save();ctx.translate(s[role+'_x']/2,s[role+'_y']/2);ctx.scale(ratio,ratio);ctx.translate(-ox/2,-oy/2);ctx.drawImage(image,0,0,540,960);ctx.restore();
  }
  canvas.hidden=false;q('positionImage').hidden=true;if(q('positionResult'))q('positionResult').hidden=true;
 }
 function changes(){dirty=true;positionSync();paint();q('positionStatus').textContent=live.base?'실시간 미리보기 · 아직 영상에 적용하지 않았어요.':'미리보기를 준비하고 있어요…';clearTimeout(live.timer);live.timer=setTimeout(refresh,650);}
 async function refresh(){
  if(!q('positionDialog').open||live.rendering)return;
  if(live.busy){live.pending=true;return;}
  live.busy=true;live.pending=false;const generation=live.generation,values=layoutStyle();
  if(!live.base)q('positionStatus').textContent='실시간 편집 화면을 준비하고 있어요…';
  try{
   const r=await api('/api/layout-preview',{id:positionProject,plan:{...current.plan,title:q('title').value},style:{...current.style,...values},at:+q('layoutAt').value,role:q('positionRole').value,layers:true});
   const images=await Promise.all([loadImage(r.base_image),...r.layers.map(x=>loadImage(x.image))]);
   if(generation!==live.generation||!q('positionDialog').open){live.pending=q('positionDialog').open;return;}
   if(generation!==live.generation){live.pending=true;return;}live.base=images[0];live.layers=r.layers.map((x,i)=>({name:x.name,image:images[i+1]}));live.style=r.style;live.at=r.output_at??0;paint();
   if(!live.rendering)q('positionStatus').textContent='실시간 미리보기 · 위치·크기·색상을 바로 조절하세요.';
  }catch(e){if(generation===live.generation)q('positionStatus').textContent='미리보기: '+e.message+' · 입력값을 조절하거나 다시 확인해 주세요.';}
  finally{live.busy=false;if(live.pending){live.pending=false;refresh();}}
 }
 q('positionOpen').onclick=guard(async()=>{
  if(!current?.plan)throw Error('작업 목록에서 영상을 먼저 선택하세요.');
  initExtras();positionProject=current.id;positionSnapshot={values:Object.fromEntries(positionFields.map(id=>[id,q(id).value])),dirty};dirty=true;
  live.generation++;live.base=null;live.layers=[];canvas.hidden=true;q('positionImage').hidden=true;
  const previous=q('positionResult');if(previous)previous.remove();
  q('positionCancel').textContent='취소·닫기';positionSync();q('positionDialog').showModal();refresh();
 });
 q('positionRole').onchange=()=>{positionSync();live.generation++;live.base=null;refresh();};
 q('captionColor').oninput=()=>{extraStyle[q('positionRole').value+'_color']=q('captionColor').value;changes();};q('captionFont').onchange=()=>{extraStyle[q('positionRole').value+'_font']=q('captionFont').value;changes();};for(const id of ['hostCaptionColor','guestCaptionColor'])q(id).oninput=changes;
 for(const suffix of ['X','Y','Size'])q('position'+suffix).oninput=()=>{q(q('positionRole').value+suffix).value=q('position'+suffix).value;changes();};
 for(const id of ['positionFirst','positionRest'])q(id).oninput=changes;
 q('positionCenter').onclick=()=>{q(q('positionRole').value+'X').value=540;changes();};
 q('positionLower').onclick=()=>{q('titleY').value=160;q('titleX').value=540;q('positionRole').value='title';changes();};
 q('positionRefresh').textContent='정확한 배치 다시 확인';q('positionRefresh').onclick=refresh;
 q('positionApply').onclick=async()=>{
  if(live.rendering)return;live.rendering=true;live.generation++;live.pending=false;clearTimeout(live.timer);q('positionApply').disabled=true;q('positionStatus').textContent='변경 내용을 저장하고 있어요…';
  try{if(current.id!==positionProject)throw Error('작업이 바뀌었습니다. 창을 다시 열어 주세요.');await save();positionSnapshot=null;await api('/api/run',{id:current.id,stage:'render'});}
  catch(e){q('positionStatus').textContent='적용 실패: '+e.message;}
  finally{live.rendering=false;if(!watched)q('positionApply').disabled=false;}
 };
 const oldCancel=positionCancel;
 positionCancel=()=>{clearTimeout(live.timer);live.generation++;oldCancel();};
 q('positionCancel').onclick=()=>positionCancel();

 // A run is complete only when its own terminal history event confirms it.
 const baseApi=api;let watched=null;
 api=async(path,data)=>{if(path==='/api/save')data={...data,expected_revision:data.expected_revision??current?.edit_revision};const result=await baseApi(path,data);if(path==='/api/save'&&current?.id===data.id)current.edit_revision=result.edit_revision;if(path==='/api/run'&&['render','produce'].includes(data?.stage)&&result.run_id)watch(data.id,result.run_id);return result;};
 function report(message,error=false){banner.hidden=false;banner.textContent=message;banner.dataset.error=error?'true':'false';if(watched?.dialog==='position'&&q('positionDialog').open)q('positionStatus').textContent=message;if(watched?.dialog==='video'&&q('videoEditDialog').open)q('videoEditStatus').textContent=message;}
 function lockDialog(on){if(!watched?.dialog)return;const el=q(watched.dialog==='position'?'positionDialog':'videoEditDialog');for(const input of el.querySelectorAll('input,select,button:not([id$="Cancel"])'))input.disabled=on;}
 async function watch(id,run){
  const token={id,run,dialog:q('positionDialog').open?'position':q('videoEditDialog').open?'video':null};watched=token;lockDialog(true);report('제작 중 · 변경한 위치와 크기로 영상을 다시 만들고 있어요.');
  try{
   while(watched===token){
    await new Promise(r=>setTimeout(r,2500));
    const response=await relayRequest('/api/project/'+id),d=response.data,record=d.history?.runs?.find(r=>r.id===run),last=record?.latest;
    if(last?.terminal){
     if(last.phase!=='done')throw Error(last.error||last.reason||'영상 제작에 실패했습니다.');
     if(!d.latest)throw Error('완성 영상을 찾을 수 없습니다.');
     report('제작 완료 · 수정 영상을 화면으로 불러오고 있어요…');
     const src=await relayMedia('/media/'+id+'/output/'+d.latest.file);
     if(current?.id===id){current.latest=d.latest;current.state=d.state;preview(d);}
     if(token.dialog){
      const dialog=q(token.dialog==='position'?'positionDialog':'videoEditDialog');
      if(dialog.open){
       let v=q(token.dialog+'Result');if(!v){v=document.createElement('video');v.id=token.dialog+'Result';v.controls=true;v.playsInline=true;v.className='applied-result';(token.dialog==='position'?stage:q('videoEditImage').parentElement).append(v);}
       if(token.dialog==='position'){canvas.hidden=true;q('positionImage').hidden=true;}else q('videoEditImage').hidden=true;v.hidden=false;v.src=src;v.muted=true;v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(live.at||2.5,Math.max(0,v.duration-.1));},{once:true});v.load();
       q(token.dialog==='position'?'positionCancel':'videoEditCancel').textContent='완료·닫기';
      }
     }
     report('적용 완료 ✓ 방금 만든 수정 영상이 표시됐어요. 재생해서 확인하세요.');return;
    }
    if(d.state?.phase==='failed'||d.state?.phase==='interrupted')throw Error(d.state.error||'제작이 중단됐습니다. 다시 적용해 주세요.');
   }
  }catch(e){report('적용 확인 실패: '+e.message,true);}
  finally{if(watched===token){lockDialog(false);watched=null;}}
 }
 // Do not dismiss the video dialog before the user can see its exported result.
 q('videoEditApply').onclick=guard(async()=>{
  if(videoEditBusy)return;if(current.id!==videoEditProject)throw Error('작업이 바뀌었습니다. 다시 열어 주세요.');
  if(videoEditValid!==JSON.stringify(videoEditStyle())){await videoEditPreview();return;}
  q('videoEditApply').disabled=true;
  try{const fresh=(await relayRequest('/api/project/'+current.id)).data;const style={...fresh.style,...videoEditStyle()};await api('/api/save',{id:current.id,plan:fresh.plan,style,expected_revision:fresh.edit_revision});current.style=style;current.plan=fresh.plan;await api('/api/run',{id:current.id,stage:'render'});}
  catch(e){q('videoEditStatus').textContent='적용 실패: '+e.message;q('videoEditApply').disabled=false;}
 });
})();
