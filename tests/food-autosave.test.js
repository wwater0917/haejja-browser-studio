import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosave,mergeSavedClips,canRestorePlan} from '../src/food-autosave.js';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const id='a'.repeat(32),cid='b'.repeat(32);
test('unsent fields, blank values and edited narration survive serialization',()=>{
 const s=createAutosave({storage:memory()});const input={projectId:id,fields:{name:'',impressions:'음성으로 입력한 음식평',speed:'1.25'},clips:[{id:cid,start:1,end:4,note:'수정한 장면 설명'}],plan:{segments:[{clipId:cid,narration:'다시 수정한 멘트'}]},draftInvalid:false,outputDirty:true,sections:[false,true,false]};
 assert.equal(s.save(input),true);const saved=s.read();for(const key of Object.keys(input))assert.deepEqual(saved[key],input[key]);assert.equal(saved.version,1);
});
test('ready server metadata merges with local order, trims and deliberate removal',()=>{
 const a={id:'1',ready:true,note:'server',manualFaces:[{x:.1}]},b={id:'2',ready:true},c={id:'3',ready:true};
 const merged=mergeSavedClips([a,b,c],[{id:'2',start:2,end:5,note:''},{id:'1',start:1,end:3,note:'local'},{id:'missing'}]);
 assert.deepEqual(merged.map(c=>c.id),['2','1']);assert.equal(merged[1].note,'local');assert.deepEqual(merged[1].manualFaces,a.manualFaces);assert.equal(merged[0].start,2);
});
test('corrupt or incompatible data and wrong clip order are never restored as a valid plan',()=>{
 const storage=memory(),s=createAutosave({storage});storage.setItem('food-reel-autosave-v1','{broken');assert.equal(s.read(),null);
 storage.setItem('food-reel-autosave-v1',JSON.stringify({version:7,fields:{},clips:[],projectId:null}));assert.equal(s.read(),null);
 assert.equal(canRestorePlan({segments:[{clipId:'1'},{clipId:'2'}]},[{id:'2'},{id:'1'}]),false);
});
test('quota failure is visible, keeps prior saved draft, and explicit clear removes it',()=>{
 const storage=memory();let failures=0;const s=createAutosave({storage,onError:()=>failures++});s.save({projectId:null,fields:{name:'kept'},clips:[]});const set=storage.setItem;storage.setItem=()=>{throw Error('quota');};assert.equal(s.save({fields:{name:'new'}}),false);assert.equal(s.read().fields.name,'kept');s.save({});assert.equal(failures,1);storage.setItem=set;s.clear();assert.equal(s.read(),null);
});
