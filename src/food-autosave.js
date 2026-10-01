const KEY='food-reel-autosave-v1';
const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export function createAutosave({storage,onError=()=>{}}){
 let reported=false;
 function read(){try{const d=JSON.parse(storage.getItem(KEY)||'null');if(d?.version!==1||!d.fields||!Array.isArray(d.clips)||d.clips.length>12||d.projectId!==null&&!validId(d.projectId))return null;return d;}catch{return null;}}
 function save(state){try{storage.setItem(KEY,JSON.stringify({...state,version:1,savedAt:Date.now()}));reported=false;return true;}catch{if(!reported){reported=true;onError();}return false;}}
 function clear(){try{storage.removeItem(KEY);return true;}catch{onError();return false;}}
 return{read,save,clear};
}
export function mergeSavedClips(serverClips,savedClips){
 const stored=new Map(serverClips.map(c=>[c.id,c]));
 return savedClips.filter(c=>stored.has(c.id)).map(c=>({...c,...stored.get(c.id),start:c.start??0,end:c.end??stored.get(c.id).duration,note:c.note??'',...(c.thumb?{thumb:c.thumb}:{})}));
}
export function canRestorePlan(plan,clips){return !!plan&&Array.isArray(plan.segments)&&plan.segments.length===clips.length&&plan.segments.every((s,i)=>s.clipId===clips[i]?.id);}
