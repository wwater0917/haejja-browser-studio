import {test} from 'node:test';
import assert from 'node:assert/strict';
import {produceFromLink, youtubeURL, stages} from '../src/production.js';
const url='https://youtube.com/shorts/XTaBTVECAJQ?si=test';
test('shorts/watch/share links normalize without forwarding tracking parameters',()=>{
 assert.equal(youtubeURL(url),'https://www.youtube.com/watch?v=XTaBTVECAJQ');
 for(const input of ['http://youtube.com/watch?v=XTaBTVECAJQ','https://youtube.com.evil.test/watch?v=XTaBTVECAJQ','https://user@youtube.com/watch?v=XTaBTVECAJQ'])assert.throws(()=>youtubeURL(input));
});
test('one click executes every stage in order, sharing editable project and actual output',async()=>{
 const calls=[], events=[];
 const services=Object.fromEntries(stages.map(([id])=>[id,async input=>{calls.push(id);return id==='import'?{sourceUrl:input}:id==='render'?{...input,output:new Blob(['mp4'])}:input;}]));
 const p=await produceFromLink(url,services,{onStage:(...x)=>events.push(x)});
 assert.deepEqual(calls,stages.map(([id])=>id));assert(p.output.size>0);assert.equal(events.length,10);
});
test('blocked download stops all downstream stages and never emits a completed render',async()=>{
 const events=[];let downstream=false;
 await assert.rejects(produceFromLink(url,{import:async()=>{throw Error('YouTube blocked');},transcribe:async()=>{downstream=true;}},{onStage:(...x)=>events.push(x)}),e=>e.stage==='import'&&e.message==='YouTube blocked');
 assert.equal(downstream,false);assert.deepEqual(events,[['import','running'],['import','failed']]);
});
test('cancellation between stages prevents the next stage',async()=>{
 const controller=new AbortController();let transcribed=false;
 await assert.rejects(produceFromLink(url,{import:async()=>{controller.abort();return {};},transcribe:async()=>{transcribed=true;}},{signal:controller.signal}));
 assert.equal(transcribed,false);
});
test('translation failure retains imported editable project, with no rendering',async()=>{
 const project={video:'fixture',cues:['original']};let rendered=false;
 await assert.rejects(produceFromLink(url,{import:async()=>project,transcribe:async p=>p,direct:async()=>{throw Error('translate failed');},render:async()=>{rendered=true;}}),e=>e.project===project&&e.stage==='direct');
 assert.equal(rendered,false);
});
