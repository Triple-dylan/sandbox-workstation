const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../spatial.js'),'utf8'),sandbox);const S=sandbox.Spatial;
const c={x:170,y:-80,z:.7},p={x:-900,y:1700};
const projected=S.screen(p,c),back=S.world(projected,c);assert.ok(Math.abs(back.x-p.x)<1e-8);assert.ok(Math.abs(back.y-p.y)<1e-8);
const anchor={x:280,y:200},oldWorld=S.world(anchor,c),zoomed=S.zoomAt(c,.3,anchor),newWorld=S.world(anchor,zoomed);assert.ok(Math.abs(oldWorld.x-newWorld.x)<1e-8);assert.ok(Math.abs(oldWorld.y-newWorld.y)<1e-8);
const items=[{x:-4000,y:-1200,w:430,h:350},{x:5000,y:2800,w:700,h:600}],size={w:1200,h:800};const fit=S.fit(items,size);for(const i of items){const a=S.screen(i,fit),b=S.screen({x:i.x+i.w,y:i.y+i.h},fit);assert.ok(a.x>=0&&a.y>=0&&b.x<=size.w&&b.y<=size.h-100)}
const snap=S.snap({x:-100,y:-45,w:300,h:200},[],6);assert.equal(snap.x,-96);assert.equal(snap.y,-48);
const aligned=S.snap({x:197,y:100,w:200,h:100},[{x:200,y:300,w:200,h:100}],6);assert.equal(aligned.x,200);assert.equal(aligned.gx,400);
console.log('PASS: negative coordinates, projection round trip, anchored zoom, distant-content fit, grid and alignment snapping.');
