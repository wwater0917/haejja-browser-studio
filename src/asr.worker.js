import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
let recognizer;
self.onmessage=async({data})=>{try{recognizer??=await pipeline('automatic-speech-recognition','onnx-community/whisper-tiny',{device:'wasm',dtype:'q8',progress_callback:p=>postMessage({progress:p.status==='progress'?`음성 인식 모델 ${Math.round(p.progress)}%`:'음성 인식 모델 준비 중…'})});const out=await recognizer(data.audio,{language:data.language,task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5});postMessage({result:out});}catch(e){postMessage({error:e.message})}};
