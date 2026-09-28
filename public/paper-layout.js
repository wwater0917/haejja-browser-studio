/* Same box origin/size contract as reelstudio.word_captions.events. */
(function(root){
 function role(c){return c.caption_role||(c.y>1000?'english':c.bubble?'vocabEn':'vocabKo');}
 function box(plan,style,at){
  const captions=plan.word_captions||[],bubbles=captions.filter(c=>c.bubble);
  const c=bubbles.find(c=>c.start<=at&&at<c.end)||bubbles[0];if(!c)return null;
  const key=role(c),group=captions.filter(v=>role(v)===key),first=group[0],ox=first.x??540,oy=Math.min(...group.map(v=>v.y??850)),size=first.size??48;
  const ratio=(style[key+'_size']??size)/size,b=c.bubble;
  return {x:b.x+(style[key+'_x']??ox)-ox+(style.paper_x??0),y:b.y+(style[key+'_y']??oy)-oy+(style.paper_y??0),width:b.width*ratio*(style.paper_width??100)/100,height:b.height*ratio*(style.paper_height??100)/100};
 }
 root.HaejjaPaperLayout={box};
})(globalThis);
