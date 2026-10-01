export function createSoundLibrary({$,safe,project,json,file,toast,changed,isWorking}){
 let rows=[],presets=[],meta=new Map(),previewUrl='';
 const ready=load();
 async function load(){
  try{const r=await fetch('/food-sfx/catalog.json');if(!r.ok)throw Error('목록을 불러오지 못했어요.');const d=await r.json();rows=d.sounds;presets=d.presets||[];meta=new Map([...rows,...presets].map(s=>[s.id,s]));
   for(const c of [...new Set(rows.map(s=>s.category))])$('soundCategory').add(new Option(c,c));filter();return true;
  }catch(e){$('soundLibraryStatus').textContent='라이브러리 연결 실패: '+e.message;$('listenSound').disabled=true;return false;}
 }
 function match(s,q){return(s.name+' '+s.category).toLowerCase().includes(q.toLowerCase());}
 function options(query='',current=''){
  const groups=new Map();const selected=[...rows,...presets].filter(s=>match(s,query)||s.id===current);
  for(const s of selected){if(!groups.has(s.category))groups.set(s.category,[]);groups.get(s.category).push(s);}
  return '<option value="auto">자동 배치에 맡기기</option><option value="none">이 장면은 끄기</option>'+[...groups].map(([c,items])=>`<optgroup label="${safe(c)}">${items.map(s=>`<option value="${s.id}">${safe(s.name)}</option>`).join('')}</optgroup>`).join('');
 }
 function filter(){
  const current=$('soundPreview').value,q=$('soundSearch').value,c=$('soundCategory').value;const filtered=rows.filter(s=>(!c||s.category===c)&&match(s,q));$('soundPreview').replaceChildren(...filtered.map(s=>new Option(s.name,s.id)));
  if(filtered.some(s=>s.id===current))$('soundPreview').value=current;
  $('soundLibraryStatus').textContent=`제공 음원 ${rows.length}개 · ${new Set(rows.map(s=>s.category)).size}개 분류 · 검색 결과 ${filtered.length}개`;
  $('listenSound').disabled=isWorking()||!filtered.length;choice(true);
 }
 function bounds(kind,start,length,reset=false){
  const s=meta.get(kind);start.disabled=length.disabled=isWorking()||!s;if(!s)return;
  if(reset){start.value='0';length.value=String(Math.min(s.duration,5));}
  start.max=String(Math.max(0,s.sourceDuration-.01));length.max=String(Math.max(.01,Math.min(5,s.sourceDuration-Number(start.value||0))));
 }
 function choice(reset=false){
  const s=meta.get($('soundPreview').value);if(!s){$('soundSourceMeta').textContent='검색 결과가 없어요.';return;}
  bounds(s.id,$('soundStart'),$('soundLength'),reset);$('soundSourceMeta').textContent=s.name+' · '+s.category+' · 원음 '+s.sourceDuration.toFixed(2)+'초';
 }
 function selected(kind,start,length){
  const s=meta.get(kind);if(!s)throw Error('라이브러리에서 음원을 선택하세요.');start=Number(start);length=Number(length);
  if(!Number.isFinite(start)||!Number.isFinite(length)||start<0||length<.01||length>5||start+length>s.sourceDuration+.01)throw Error('원음 범위 안에서 시작 위치와 0.01~5초의 길이를 선택하세요.');
  return {sound:kind,soundStart:start,soundLength:Math.min(length,s.sourceDuration-start)};
 }
 function segmentHTML(i,s){
  return `<details class="scene-sound" data-manual-sound hidden><summary>이 장면 효과음 직접 선택</summary><label>이 장면 효과음 검색<input data-sound-search="${i}" type="search" placeholder="예: 박수, 우쉬, 클릭"></label><label>장면 효과음<select data-sound="${i}">${options('',s.sound||'auto')}</select></label><div class="two"><label>원음 시작 · 초<input data-sound-start="${i}" type="number" min="0" step="any" value="${Number(s.soundStart||0)}"></label><label>사용 길이 · 초<input data-sound-length="${i}" type="number" min="0.01" max="5" step="any" value="${Number(s.soundLength??.7)}"></label></div><button data-sound-apply="${i}" class="quiet" type="button">미리듣기에서 고른 음원을 이 장면에 적용</button></details>`;
 }
 function fields(i){return{select:document.querySelector(`[data-sound="${i}"]`),start:document.querySelector(`[data-sound-start="${i}"]`),length:document.querySelector(`[data-sound-length="${i}"]`)};}
 function bind(segments){
  for(const [i,s]of segments.entries()){
   const f=fields(i);f.select.value=s.sound||'auto';bounds(f.select.value,f.start,f.length);
   f.select.onchange=()=>{bounds(f.select.value,f.start,f.length,true);changed();};f.start.oninput=()=>{bounds(f.select.value,f.start,f.length);changed();};f.length.oninput=changed;
   document.querySelector(`[data-sound-search="${i}"]`).oninput=e=>{const current=f.select.value;f.select.innerHTML=options(e.target.value,current);f.select.value=current;};
   document.querySelector(`[data-sound-apply="${i}"]`).onclick=()=>{try{const s=selected($('soundPreview').value,$('soundStart').value,$('soundLength').value);f.select.innerHTML=options('',s.sound);f.select.value=s.sound;f.start.value=String(s.soundStart);f.length.value=String(s.soundLength);bounds(s.sound,f.start,f.length);if($('sfxMode').value==='none')$('sfxMode').value='manual';changed();toast((i+1)+'번 장면에 '+meta.get(s.sound).name+'을 적용했어요.');}catch(e){toast(e.message);}};
  }
 }
 function values(i){if($('sfxMode').value==='auto')return{sound:'auto',soundStart:0,soundLength:.7};const f=fields(i);return meta.has(f.select.value)?selected(f.select.value,f.start.value,f.length.value):{sound:f.select.value||'auto',soundStart:0,soundLength:.7};}
 function setBusy(){
  document.querySelectorAll('[data-sound]').forEach(el=>{const f=fields(el.dataset.sound);bounds(el.value,f.start,f.length);});choice();
 }
 $('soundSearch').oninput=filter;$('soundCategory').onchange=filter;$('soundPreview').onchange=()=>choice(true);$('soundStart').oninput=()=>choice();
 $('listenSound').onclick=async()=>{
  if(!project()){toast('멘트를 만든 작업에서 미리 들어보세요.');return;}
  $('listenSound').disabled=true;
  try{const s=selected($('soundPreview').value,$('soundStart').value,$('soundLength').value);const d=await json('/api/food/sfx-preview',{id:project().id,sound:s.sound,start:s.soundStart,length:s.soundLength});const r=await file(d.name);if(!r.ok)throw Error('음원 전송이 중단됐어요.');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(await r.blob());const a=$('soundAudio');a.src=previewUrl;a.volume=Number($('sfxGain').value);a.hidden=false;await a.play();$('soundSourceMeta').textContent=d.soundName+' · '+d.start.toFixed(2)+'초부터 '+d.duration.toFixed(2)+'초 미리듣기';
  }catch(e){toast(e.message);}finally{$('listenSound').disabled=isWorking()||!$('soundPreview').value;}
 };
 function previewState(){return Object.fromEntries(['soundSearch','soundCategory','soundPreview','soundStart','soundLength'].map(k=>[k,$(k).value]));}
 function restorePreview(state){if(!state)return;ready.then(()=>{$('soundSearch').value=state.soundSearch||'';$('soundCategory').value=state.soundCategory||'';filter();if(rows.some(r=>r.id===state.soundPreview))$('soundPreview').value=state.soundPreview;if(state.soundStart!==undefined)$('soundStart').value=state.soundStart;if(state.soundLength!==undefined)$('soundLength').value=state.soundLength;choice();});}
 return {ready,segmentHTML,bind,values,setBusy,previewState,restorePreview};
}
