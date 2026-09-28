/* Independently collapsible groups in the caption layout dialog. */
(() => {
 const q=id=>document.getElementById(id),dialog=q('positionDialog'),groups=[];
 function group(title,start,end){
  if(!start||!end||start.parentElement!==end.parentElement)return;
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;details.className='caption-section';details.append(summary);start.before(details);
  let node=start;while(node){const next=node.nextSibling;details.append(node);if(node===end)break;node=next;}groups.push(details);return details;
 }
 group('조절할 글자 · 위치·크기',q('positionRole').previousElementSibling,q('positionLower').parentElement);
 group('제목 색상',q('positionFirst').previousElementSibling,q('positionRest'));
 const paper=q('paper_style').closest('details');paper.classList.add('caption-section');paper.open=false;groups.push(paper);
 group('선택한 자막 · 색상·글꼴',q('captionColor').previousElementSibling,q('captionFont'));
 group('진행자·제니 · 한글·영어 색상',q('hostCaptionColor').previousElementSibling,q('guestEnglishColor'));
 group('한글·영어 · 자막 간격',q('bilingualGap').previousElementSibling,q('vocabularyGap').nextElementSibling);
 const toolbar=document.createElement('div');toolbar.className='row caption-fold-toolbar';for(const [label,open]of [['항목 모두 펼치기',true],['항목 모두 접기',false]]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.onclick=()=>groups.forEach(g=>g.open=open);toolbar.append(b);}groups[0].before(toolbar);
 const actions=document.createElement('div');actions.className='caption-actions';q('positionApply').before(actions);actions.append(q('positionRefresh'),q('positionApply'));
 const css=document.createElement('style');css.textContent='.caption-section{border:1px solid #d5ded7;border-radius:10px;background:#fff;padding:12px;margin:0 0 10px}.caption-section>summary{cursor:pointer;font-weight:700;list-style:disclosure-closed}.caption-section[open]>summary{list-style:disclosure-open;margin-bottom:16px}.caption-section>summary::after{content:"열기";float:right;font-size:12px;color:#65756b}.caption-section[open]>summary::after{content:"접기"}.caption-fold-toolbar{margin-bottom:12px}.caption-actions{position:sticky;bottom:0;z-index:5;background:#f7faf6;padding:12px 0;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #d5ded7}.caption-section>label{display:block}';document.head.append(css);
})();
