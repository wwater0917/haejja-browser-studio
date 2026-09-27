import {test} from 'node:test';import assert from 'node:assert/strict';import {validCuts,mappedCues,parseSrt,srt,ass} from '../src/model.js';
test('source captions map to reordered and trimmed output timeline',()=>{assert.deepEqual(mappedCues([{timestamp:[1,4],text:' first '},{timestamp:[8,10],text:'last'}],[{start:8,end:9},{start:2,end:3}]),[{start:0,end:1,text:'last'},{start:1,end:2,text:'first'}])});
test('invalid and empty edit rejected',()=>{assert.throws(()=>validCuts({cuts:[],duration:3}));assert.throws(()=>validCuts({cuts:[{keep:true,start:2,end:4}],duration:3}))});
test('SRT multiline roundtrip',()=>{const c=[{start:1,end:3.5,text:'안녕\n세계'}];assert.deepEqual(parseSrt(srt(c)),c)});
test('user text cannot insert ASS formatting',()=>{const t=ass({title:'{\\pos(0,0)}hello',titleSize:100,subtitleSize:64,cuts:[{keep:true,start:0,end:3}],cues:[]});assert(!t.includes('{\\pos'));assert(t.includes('hello'))});
