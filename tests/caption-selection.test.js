import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const scope={};vm.runInNewContext(fs.readFileSync('public/caption-selection.js','utf8'),scope);
const {alphaBounds,transformBounds,union,coordinates}=scope.HaejjaCaptionSelection;
const plain=value=>JSON.parse(JSON.stringify(value));

test('selection excludes transparent padding and near-transparent pixels',()=>{
 const pixels=new Uint8ClampedArray(4*5*4);
 pixels[(1*5+1)*4+3]=255;pixels[(2*5+3)*4+3]=17;pixels[3]=16;
 assert.deepEqual(plain(alphaBounds(pixels,5,4)),{x:1,y:1,width:3,height:2});
 assert.equal(alphaBounds(new Uint8ClampedArray(16),2,2),null);
});
test('a two-color title remains one target after moving and resizing',()=>{
 const transform={sx:1.5,sy:1.5,tx:-50,ty:20};
 const first=transformBounds({x:100,y:80,width:160,height:30},transform);
 const rest=transformBounds({x:90,y:120,width:180,height:30},transform);
 assert.deepEqual(plain(union(first,rest)),{x:85,y:140,width:270,height:105});
});
test('the same drag distance scales correctly on desktop and mobile previews',()=>{
 for(const width of [270,135]){
  const rect={left:50,top:100,width,height:width*16/9};
  const start=coordinates(50,100,rect),end=coordinates(50+width/10,100+rect.height/10,rect);
  assert.equal((end.x-start.x)*2,108);
  assert.equal((end.y-start.y)*2,192);
 }
});
