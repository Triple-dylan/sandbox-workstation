/* Pure geometry shared by canvas gestures, navigation, and fit. */
(function(root){
 const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
 const world=(screen,camera)=>({x:(screen.x-camera.x)/camera.z,y:(screen.y-camera.y)/camera.z});
 const screen=(point,camera)=>({x:camera.x+point.x*camera.z,y:camera.y+point.y*camera.z});
 function zoomAt(camera,z,anchor){z=clamp(z,.005,3);const p=world(anchor,camera);return{x:anchor.x-p.x*z,y:anchor.y-p.y*z,z}}
 function fit(items,size,padding=70){if(!items.length)return{x:0,y:0,z:1};const left=Math.min(...items.map(x=>x.x)),top=Math.min(...items.map(x=>x.y)),right=Math.max(...items.map(x=>x.x+x.w)),bottom=Math.max(...items.map(x=>x.y+x.h));const usableHeight=Math.max(100,size.h-150);const z=clamp(Math.min((size.w-padding*2)/Math.max(1,right-left),(usableHeight-padding)/Math.max(1,bottom-top),1),.005,3);return{x:(size.w-(right-left)*z)/2-left*z,y:(usableHeight-(bottom-top)*z)/2-top*z+20,z}}
 function snap(item,others,tolerance=6){let x=Math.round(item.x/16)*16,y=Math.round(item.y/16)*16,gx=null,gy=null;for(const o of others){for(const a of [0,item.w/2,item.w])for(const b of [0,o.w/2,o.w])if(Math.abs(item.x+a-o.x-b)<tolerance){x=o.x+b-a;gx=o.x+b}for(const a of [0,item.h/2,item.h])for(const b of [0,o.h/2,o.h])if(Math.abs(item.y+a-o.y-b)<tolerance){y=o.y+b-a;gy=o.y+b}}return{x,y,gx,gy}}
 root.Spatial={world,screen,zoomAt,fit,snap};
 if(typeof module!=='undefined')module.exports=root.Spatial;
})(typeof window!=='undefined'?window:globalThis);
