/* Geometry shared by the rendered text and its direct manipulation targets. */
(function(root){
 function alphaBounds(data,width,height){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
 }
 function transformBounds(box,t){return box&&{x:box.x*t.sx+t.tx,y:box.y*t.sy+t.ty,width:box.width*t.sx,height:box.height*t.sy};}
 function union(a,b){if(!a)return b;if(!b)return a;const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y};}
 function coordinates(clientX,clientY,rect){return {x:(clientX-rect.left)*540/rect.width,y:(clientY-rect.top)*960/rect.height};}
 root.HaejjaCaptionSelection={alphaBounds,transformBounds,union,coordinates};
})(globalThis);
