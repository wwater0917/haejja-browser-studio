/* Compact editor sections and visible save/render actions. */
(() => {
 const q=id=>document.getElementById(id),editor=q('editorPanel');
 const css=document.createElement('style');css.textContent='.editor-section>summary{font-size:17px;font-weight:750;cursor:pointer;padding:8px 0;list-style:disclosure-closed}.editor-section[open]>summary{list-style:disclosure-open;margin-bottom:16px}.editor-section>summary::after{content:"열기";float:right;font-size:12px;color:#65756b}.editor-section[open]>summary::after{content:"접기"}.editor-apply-bar{position:fixed;bottom:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:center;gap:14px;padding:12px 20px;background:#f7faf6;border-top:1px solid #c6d2c7;box-shadow:0 -3px 18px #0001}.editor-apply-bar[hidden]{display:none}.editor-apply-bar p{margin:0;max-width:55%;font-size:13px}.sound-apply-row{position:sticky;top:0;z-index:3;background:#f7faf6;padding:12px 0;margin-bottom:12px}body:has(.editor-apply-bar:not([hidden])){padding-bottom:100px}@media(max-width:600px){.editor-apply-bar{flex-wrap:wrap;gap:6px}.editor-apply-bar p{max-width:100%}}';document.head.append(css);
 const sections=[];
 for(const card of [...editor.querySelectorAll(':scope > .card'),q('cutEditor')]){
  if(!card)continue;let details=card.querySelector(':scope > details');
  if(!details){const heading=card.querySelector('h2');if(!heading)continue;details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=heading.textContent;heading.remove();details.append(summary);while(card.firstChild)details.append(card.firstChild);card.append(details);}
  details.classList.add('editor-section');details.open=false;sections.push(details);
 }
 const toolbar=document.createElement('div');toolbar.className='row';toolbar.style.marginBottom='12px';for(const [label,open]of [['모두 펼치기',true],['모두 접기',false]]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=()=>sections.forEach(s=>s.open=open);toolbar.append(b);}editor.prepend(toolbar);
 const bar=document.createElement('div');bar.className='editor-apply-bar';bar.hidden=true;bar.innerHTML='<p id="editorApplyStatus" role="status">수정 후 적용하면 영상이 다시 만들어집니다.</p><button id="editorApplyAll">수정사항 적용 · 영상 다시 만들기</button>';document.body.append(bar);
 const row=document.createElement('div');row.className='sound-apply-row';row.innerHTML='<button id="soundApplyVideo">효과음 적용 · 영상 다시 만들기</button><p class="muted">추가·음량 조절 후 이 버튼을 눌러 영상에 반영하세요.</p>';q('soundBulkGain').closest('.sound-library').before(row);
 const buttons=[q('editorApplyAll'),q('soundApplyVideo')];let working=false;
 function status(message){q('editorApplyStatus').textContent=message;}
 async function apply(){if(working)return;working=true;buttons.forEach(b=>b.disabled=true);status('변경 내용을 저장하고 있어요…');try{await save();await api('/api/run',{id:current.id,stage:'render'});}catch(e){status('적용 실패: '+e.message);working=false;buttons.forEach(b=>b.disabled=false);}}
 buttons.forEach(b=>b.onclick=apply);
 new MutationObserver(()=>{const text=q('applyProgress').textContent;if(!text)return;status(text);if(/적용 완료|실패|중단/.test(text)){working=false;buttons.forEach(b=>b.disabled=false);}}).observe(q('applyProgress'),{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>{bar.hidden=editor.hidden;}).observe(editor,{attributes:true,attributeFilter:['hidden']});
 editor.addEventListener('input',()=>{if(!working)status('수정 중 · 아직 영상에 적용하지 않았어요.');});
 editor.addEventListener('click',()=>queueMicrotask(()=>{if(dirty&&!working)status('수정사항이 있어요 · 적용 버튼을 누르면 영상에 반영됩니다.');}));
})();
