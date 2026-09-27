/* The Mac owns projects and runs the complete production pipeline. */
const relayBase='https://haejja-free-helper.onrender.com';
let studioToken=localStorage.getItem('haejja-mac-token')||'';
let unlock;
const connected=new Promise(resolve=>unlock=resolve);
const mediaCache=new Map(),mediaPending=new Map();
async function bridge(path,body){
 const response=await fetch(relayBase+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(studioToken?{Authorization:'Bearer '+studioToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok){if(response.status===401){studioToken='';localStorage.removeItem('haejja-mac-token');document.getElementById('connectPanel').hidden=false;}throw Error(data.error||'웹 연결 오류');}
 return data;
}
async function relayRequest(path,body){
 await connected;
 const job=await bridge('/bridge/request',{path,method:body?'POST':'GET',body});
 const deadline=Date.now()+1200000;
 while(Date.now()<deadline){
  await new Promise(r=>setTimeout(r,700));
  const result=await bridge('/bridge/jobs/'+job.job);
  if(result.status!=='done')continue;
  if(result.code>=400)throw Error(result.data?.error||'맥 제작 요청 실패');
  return result;
 }
 throw Error('맥에서 응답을 받지 못했습니다. 저장된 작업에서 진행 상황을 확인하세요.');
}
async function relayMedia(path){
 if(mediaCache.has(path))return mediaCache.get(path);
 if(mediaPending.has(path))return mediaPending.get(path);
 const promise=(async()=>{
  const result=await relayRequest(path);
  if(!result.file)throw Error('영상 파일을 받지 못했습니다.');
  const response=await fetch(relayBase+result.file);
  if(!response.ok)throw Error('영상 전송이 중단됐습니다.');
  const url=URL.createObjectURL(await response.blob());mediaCache.set(path,url);return url;
 })();
 mediaPending.set(path,promise);
 try{return await promise;}finally{mediaPending.delete(path);}
}
function mediaPath(path){return mediaCache.get(path)||'';}
async function relayApi(path,body){
 const result=await relayRequest(path,body),data=result.data;
 if(path.startsWith('/api/project/')&&data.source_duration>0){
  await relayMedia('/media/'+data.id+'/source/source.mp4');
  if(data.latest)await relayMedia('/media/'+data.id+'/output/'+data.latest.file);
 }
 if(data?.url?.startsWith('/media/'))data.url=await relayMedia(data.url);
 return data;
}
document.getElementById('connectForm').onsubmit=async event=>{
 event.preventDefault();const button=document.getElementById('connectButton');button.disabled=true;
 try{
  const result=await bridge('/bridge/pair',{code:document.getElementById('connectCode').value});
  studioToken=result.token;localStorage.setItem('haejja-mac-token',studioToken);
  document.getElementById('connectCode').value='';document.getElementById('connectPanel').hidden=true;unlock();
 }catch(e){document.getElementById('connectError').textContent=e.message;}finally{button.disabled=false;}
};
if(studioToken){document.getElementById('connectPanel').hidden=true;unlock();}
document.getElementById('editToggle').onclick=()=>{
 const editor=document.getElementById('editorPanel');editor.hidden=!editor.hidden;
 document.body.classList.toggle('editing',!editor.hidden);
 document.getElementById('editToggle').textContent=editor.hidden?'마음에 안 드는 부분 수정하기':'수정 도구 접기';
 if(!editor.hidden)editor.scrollIntoView({behavior:'smooth'});
};
