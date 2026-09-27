/* Frame-based operations shared by the visual editor and its regression checks. */
var CutModel=(()=>{
 const fps=30,frame=t=>Math.round(t*fps),sec=f=>f/fps;
 function normalize(rows,duration){
  const end=frame(duration),kept=rows.filter(r=>r.keep!==false).map((r,i)=>({...r,id:r.id||'clip-'+i,start:sec(frame(r.start)),end:sec(frame(r.end)),keep:true})).sort((a,b)=>a.start-b.start);
  const out=[];let cursor=0;
  for(const r of kept){if(frame(r.start)<frame(cursor)||r.end<=r.start||frame(r.end)>end)throw Error('구간의 순서·중복·길이를 확인하세요.');if(r.start>cursor)out.push({id:'gap-'+frame(cursor),start:cursor,end:r.start,keep:false});out.push(r);cursor=r.end;}
  if(frame(cursor)<end)out.push({id:'gap-'+frame(cursor),start:cursor,end:sec(end),keep:false});return out;
 }
 function merged(rows){const out=[];for(const r of rows.filter(r=>r.keep)){const last=out[out.length-1];if(last&&frame(last.end)===frame(r.start))last.end=r.end;else out.push({start:r.start,end:r.end});}return out;}
 function trim(rows,id,edge,time,duration){
  const kept=rows.filter(r=>r.keep).map(r=>({...r})),i=kept.findIndex(r=>r.id===id);if(i<0)return rows;
  const r=kept[i],lo=edge==='start'?frame(kept[i-1]?.end||0):frame(r.start)+1,hi=edge==='start'?frame(r.end)-1:frame(kept[i+1]?.start??duration);
  r[edge]=sec(Math.max(lo,Math.min(hi,frame(time))));return normalize(kept,duration);
 }
 function split(rows,time,duration){const t=sec(frame(time)),i=rows.findIndex(r=>r.keep&&r.start<t&&t<r.end);if(i<0)throw Error('사용할 구간 안에 재생선을 놓아 주세요.');const out=rows.map(r=>({...r})),r=out[i];out.splice(i,1,{...r,end:t},{...r,id:r.id+'-split-'+frame(t),start:t});return normalize(out,duration);}
 function effectPlacement(rows,event,intro,duration,outro){
  const length={pop:.16,tap:.14,swish:.22}[event.kind],a=event.at,b=a+length,source=a-intro,body=merged(rows).reduce((v,r)=>v+frame(r.end)-frame(r.start),0)/fps;
  if(a>=0&&b<=intro)return {source,output:a,region:'intro'};
  if(a>=intro+duration&&b<=intro+duration+outro)return {source,output:a-duration+body,region:'outro'};
  let cursor=frame(intro);for(const r of merged(rows)){const start=frame(r.start),end=frame(r.end);if(a>=intro&&b<=intro+duration&&frame(source)>=start&&frame(source+length)<=end)return {source,output:sec(cursor+frame(source)-start),region:'body'};cursor+=end-start;}
  return {source,output:null,region:'removed'};
 }
 return {frame,sec,normalize,merged,trim,split,effectPlacement};
})();
if(typeof module!=='undefined')module.exports=CutModel;
