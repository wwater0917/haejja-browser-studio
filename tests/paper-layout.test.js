import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const scope={};vm.runInNewContext(fs.readFileSync('public/paper-layout.js','utf8'),scope);
const {box}=scope.HaejjaPaperLayout;
const plan={word_captions:[{start:0,end:2,caption_role:'vocabEn',x:500,y:400,size:50,bubble:{x:510,y:380,width:400,height:160}},{start:3,end:5,caption_role:'vocabEn',x:500,y:400,size:50,bubble:{x:510,y:380,width:600,height:160}}]};
test('paper preview follows the export origin, including text X/Y and size',()=>{
 const result=box(plan,{vocabEn_x:560,vocabEn_y:450,vocabEn_size:75,paper_x:-20,paper_y:49,paper_width:90,paper_height:94},1);
 assert.equal(result.x,550);assert.equal(result.y,479);assert.equal(result.width,540);assert.equal(result.height,225.6);
});
test('zero Y is a real coordinate, not a default',()=>{assert.equal(box(plan,{vocabEn_y:0},1).y,-20);});
test('different expressions retain their own box width at the same position',()=>{assert.equal(box(plan,{},4).width,600);assert.equal(box(plan,{},4).y,380);});
