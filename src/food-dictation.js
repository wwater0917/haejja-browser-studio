export function bindDictation({toast,isWorking}){
 let active=null,button=null;
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-dictate]');if(!b||isWorking())return;
  if(active){active.stop();return;}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){toast('이 브라우저는 음성 입력을 지원하지 않아요. 사파리·크롬에서 열거나 키보드의 마이크를 사용해 주세요.');return;}
  const input=document.getElementById(b.dataset.dictate);if(!input)return;
  const original=input.value,label=b.textContent,note=b.parentElement.querySelector('[data-speech-status]');
  const recognition=new Speech();active=recognition;button=b;recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;let final='';
  b.textContent='■ 음성 입력 끝내기';b.setAttribute('aria-pressed','true');if(note)note.textContent='듣고 있어요. 말한 내용을 확인한 뒤 수정할 수 있어요.';
  recognition.onresult=event=>{let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const t=event.results[i][0].transcript;if(event.results[i].isFinal)final+=(final?' ':'')+t;else interim+=t;}input.value=(original+(original?' ':'')+final+(interim?' '+interim:'')).slice(0,input.maxLength>0?input.maxLength:2000);input.dispatchEvent(new Event('input',{bubbles:true}));};
  recognition.onerror=event=>{const message=event.error==='not-allowed'?'음성 입력을 위해 브라우저의 마이크 권한을 허용해 주세요.':event.error==='no-speech'?'음성이 들리지 않았어요. 다시 눌러 말해 주세요.':'음성 입력이 중단됐어요. 다시 누르거나 키보드 마이크를 사용해 주세요.';if(note)note.textContent=message;toast(message);};
  recognition.onend=()=>{b.textContent=label;b.setAttribute('aria-pressed','false');active=null;button=null;if(note&&note.textContent.startsWith('듣고'))note.textContent='입력이 끝났어요. 내용을 확인해 주세요.';};
  try{recognition.start();}catch{recognition.onend();toast('음성 입력을 시작하지 못했어요. 마이크 권한을 확인해 주세요.');}
 });
 window.addEventListener('pagehide',()=>active?.abort());
 return{stop:()=>active?.stop()};
}
