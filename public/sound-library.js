/* All user-provided sounds, with short, quiet clips and an audible preview. */
(() => {
 const q=id=>document.getElementById(id),panel=q('sfxEvents');
 let sounds=Object.entries(sfxNames).map(([id,name])=>({id,name,category:'기본·시그니처',duration:sfxLengths[id],source_duration:sfxLengths[id]}));
 const box=document.createElement('div');box.className='sound-library';
 box.innerHTML='<h3>홍님 효과음 라이브러리</h3><p id="soundLibraryStatus" role="status">라이브러리를 불러오고 있어요…</p><label for="soundSearch">효과음 검색</label><input id="soundSearch" placeholder="예: 깨달음, 물방울, 우쉬, 박수"><label for="soundCategory">분류</label><select id="soundCategory"><option value="">전체</option></select><label for="soundChoice">사용할 효과음</label><select id="soundChoice"></select><div class="two"><div><label for="soundLength">사용 길이 · 초</label><input id="soundLength" type="number" min="0.03" max="5" step="0.01" value="0.7"></div><div><label for="soundGain">음량 · 0.15 = 15%</label><input id="soundGain" type="number" min="0.01" max="0.25" step="0.01" value="0.15"></div></div><p class="muted">긴 음원은 앞부분 최대 5초를 사용합니다. 길이와 음량을 조절한 뒤 미리 들어 보세요.</p><div class="row"><button id="soundListen" class="secondary">선택한 효과음 미리듣기</button><button id="soundInsert">효과음 추가</button></div><audio id="soundAudio" controls hidden style="width:100%;margin-top:10px"></audio>';
 panel.before(box);
 function optionList(select,value,filter=''){
  select.replaceChildren();const groups=new Map();
  for(const sound of sounds){if(filter&&!sound.name.toLowerCase().includes(filter.toLowerCase()))continue;let group=groups.get(sound.category);if(!group){group=document.createElement('optgroup');group.label=sound.category;groups.set(sound.category,group);select.append(group);}const o=document.createElement('option');o.value=sound.id;o.textContent=sound.name+' · '+sound.duration+'초까지';group.append(o);}
  if([...select.options].some(o=>o.value===value))select.value=value;
 }
 function filter(){const value=q('soundChoice').value,query=q('soundSearch').value.toLowerCase(),category=q('soundCategory').value;const select=q('soundChoice');select.replaceChildren();for(const sound of sounds){if(category&&sound.category!==category||query&&!sound.name.toLowerCase().includes(query))continue;const o=new Option(sound.name+' · '+sound.duration+'초까지',sound.id);select.add(o);}if([...select.options].some(o=>o.value===value))select.value=value;choice();q('soundLibraryStatus').textContent='라이브러리 '+sounds.length+'종 · 검색 결과 '+select.options.length+'종';}
 function choice(){const item=sounds.find(s=>s.id===q('soundChoice').value);if(!item)return;q('soundLength').max=item.duration;q('soundLength').value=Math.min(item.duration,.7);}
 function chosen(){const kind=q('soundChoice').value;if(!kind)throw Error('효과음을 선택하세요.');const duration=+q('soundLength').value,gain=+q('soundGain').value;if(!(duration>=.03&&duration<=sfxLengths[kind]))throw Error('사용 길이를 확인하세요.');if(!(gain>0&&gain<=.25))throw Error('효과음 음량은1~25%로 설정하세요.');return {kind,duration,gain};}
 async function listen(event,button){
  if(!current?.plan)throw Error('작업 목록에서 영상을 먼저 선택하세요.');if(button)button.disabled=true;
  q('soundLibraryStatus').textContent='선택한 음원을 준비하고 있어요…';
  try{const r=await api('/api/sfx-preview',{id:current.id,event});const audio=q('soundAudio');audio.src=r.audio;audio.hidden=false;audio.volume=1;await audio.play();q('soundLibraryStatus').textContent=(sfxNames[event.kind]||event.kind)+' · '+r.duration+'초 미리듣기';}
  catch(e){q('soundLibraryStatus').textContent='미리듣기 실패: '+e.message;throw e;}
  finally{if(button)button.disabled=false;}
 }
 q('soundSearch').oninput=filter;q('soundCategory').onchange=filter;q('soundChoice').onchange=choice;
 q('soundListen').onclick=guard(()=>listen(chosen(),q('soundListen')));
 function add(event){
  if(!current?.plan)throw Error('작업 목록에서 영상을 먼저 선택하세요.');
  const events=current.plan.sound_effects||(current.plan.sound_effects=[]);if(events.length>=30)throw Error('최대30개까지 사용할 수 있어요. 기존 효과음을 삭제하거나 교체하세요.');
  rememberSfx();const ranges=current.plan.keep_ranges||[{start:0,end:current.source_duration}];let source=cutPosition??ranges[0].start;
  const fits=t=>ranges.some(r=>r.start<=t&&t+event.duration<=r.end);
  if(!fits(source)){const r=ranges.find(r=>r.end-r.start>=event.duration);if(!r)throw Error('효과음 길이가 남겨둔 장면보다 깁니다. 사용 길이를 줄여 주세요.');source=r.start;}
  events.push({...event,at:+(source+current.plan.intro_seconds).toFixed(6)});selectedSfx=events.length-1;current.plan.sound_effect_policy={...current.plan.sound_effect_policy,mode:'quiet_accents'};changedSfx();q('soundLibraryStatus').textContent=(sfxNames[event.kind]||event.kind)+' 추가됨 · 아래 목록에서 시작 시각을 조절하고 영상에 적용하세요.';
 }
 q('soundInsert').onclick=guard(()=>add(chosen()));q('sfxAddHere').onclick=guard(()=>add(chosen()));
 drawSfx=function(){
  panel.replaceChildren();const events=current?.plan?.sound_effects||[];q('sfxCount').value=events.length||15;panel.append(text('p','현재 배치 '+events.length+'개 · 미리듣고 종류·길이·음량을 조절하세요.','muted'));
  events.forEach((e,i)=>{
   const row=text('div','','sound-event');row.append(text('strong','효과음 '+(i+1)));
   const time=document.createElement('input');time.type='number';time.step='.01';time.min=0;time.value=e.at;time.setAttribute('aria-label','효과음 '+(i+1)+' 시작 초');time.oninput=()=>{e.at=+time.value;dirty=true;drawSfxTrack();};
   const kind=document.createElement('select');kind.setAttribute('aria-label','효과음 '+(i+1)+' 종류');optionList(kind,e.kind);
   const length=document.createElement('input');length.type='number';length.min='.03';length.step='.01';length.max=sfxLengths[e.kind]||5;length.value=e.duration??sfxLengths[e.kind]??.7;length.setAttribute('aria-label','효과음 '+(i+1)+' 사용 길이 초');length.oninput=()=>{e.duration=+length.value;dirty=true;drawSfxTrack();};
   kind.onchange=()=>{e.kind=kind.value;e.duration=Math.min(sfxLengths[e.kind],.7);length.max=sfxLengths[e.kind];length.value=e.duration;dirty=true;drawSfxTrack();};
   const gain=document.createElement('input');gain.type='number';gain.min='.01';gain.max=current?.plan?.sound_effect_policy?.mode==='quiet_accents'?'.25':'1';gain.step='.01';gain.value=e.gain??.15;gain.setAttribute('aria-label','효과음 '+(i+1)+' 음량');gain.oninput=()=>{e.gain=+gain.value;dirty=true;drawSfxTrack();};
   const hear=text('button','미리듣기','secondary');hear.onclick=guard(()=>listen(e,hear));const remove=text('button','삭제','secondary');remove.onclick=()=>{rememberSfx();current.plan.sound_effects.splice(i,1);selectedSfx=-1;changedSfx();};
   for(const [label,control]of [['시작 초 · 도입 포함',time],['종류',kind],['길이 · 초',length],['음량',gain]]){const wrap=document.createElement('label');wrap.textContent=label;wrap.append(control);row.append(wrap);}row.append(hear,remove);panel.append(row);
  });
 };
 const priorTrack=drawSfxTrack;drawSfxTrack=function(){priorTrack();const event=current?.plan?.sound_effects?.[selectedSfx];if(event)optionList(q('sfxTrackKind'),event.kind);q('sfxTrackGain').min='.01';q('sfxTrackGain').step='.01';q('sfxTrackGain').max=current?.plan?.sound_effect_policy?.mode==='quiet_accents'?'.25':'1';};
 q('sfxTrackKind').onchange=()=>{rememberSfx();const e=current.plan.sound_effects[selectedSfx];e.kind=q('sfxTrackKind').value;e.duration=Math.min(sfxLengths[e.kind],.7);changedSfx();};
 filter();
 (async()=>{try{const data=await api('/api/sfx-library');sounds=data.sounds;for(const sound of sounds){sfxNames[sound.id]=sound.name;sfxLengths[sound.id]=sound.duration;}for(const name of [...new Set(sounds.map(s=>s.category))])q('soundCategory').add(new Option(name,name));filter();optionList(q('sfxTrackKind'),q('sfxTrackKind').value);if(current?.plan){drawSfx();drawSfxTrack();}}catch(e){q('soundLibraryStatus').textContent='라이브러리 연결 실패: '+e.message;}})();
})();
