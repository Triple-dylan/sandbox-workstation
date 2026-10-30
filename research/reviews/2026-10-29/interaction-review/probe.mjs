export default async (page) => {
 const c=await page.context().browser().newContext({viewport:{width:1600,height:1000}});
 const p=await c.newPage();p.setDefaultTimeout(6000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const box=async selector=>p.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,radius:s.borderRadius,shadow:s.boxShadow,overflowY:s.overflowY,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};});
 try {
  await p.goto('http://127.0.0.1:4174/');
  await p.getByRole('button',{name:'Conversations',exact:true}).click();
  const list=await box('.left-extension');const listCanvas=await box('main.primary-surface');
  await p.getByRole('button',{name:'# product-direction',exact:true}).click();
  const chat=await box('.left-extension');const chatCanvas=await box('main.primary-surface');
  await p.getByRole('button',{name:'Write on canvas',exact:true}).click();
  await p.getByLabel('Writing block 1',{exact:true}).fill('Review fixture: direct manipulation.');
  const object=p.locator('[data-object^="writing:"]');const before=await box('[data-object^="writing:"]');
  const header=await object.locator('header').boundingBox();
  await p.mouse.move(header.x+100,header.y+14);await p.mouse.down();await p.mouse.move(header.x+170,header.y+64,{steps:8});
  const during=await box('[data-object^="writing:"]');const preview=await box('.placement-preview');
  await p.screenshot({path:'/Users/dylandahl/Desktop/Sandbox Workstation/research/reviews/2026-10-29/interaction-review/drag-preview.png'});
  await p.mouse.up();const after=await box('[data-object^="writing:"]');
  const grid=await p.locator('main.primary-surface').evaluate(el=>getComputedStyle(el).backgroundSize);
  await p.getByRole('button',{name:'Graph',exact:true}).click();
  await p.getByRole('button',{name:'Open work',exact:true}).click();
  await p.getByRole('button',{name:/^Edit project agent/}).click();
  const inspector=await box('.inspection-surface');
  await p.getByRole('button',{name:'Project tools',exact:true}).click();
  const utility=await box('.utility-card[aria-label="Project agent"]');
  await p.evaluate(()=>{const key='workstation-layout-proof-v1',s=JSON.parse(localStorage.getItem(key));s.goals=Array.from({length:60},(_,i)=>({id:'review-'+i,title:'Overflow review item '+i,done:false,due:''}));localStorage.setItem(key,JSON.stringify(s));});
  await p.reload();await p.setViewportSize({width:1600,height:720});await p.waitForTimeout(200);
  const goalBody='.utility-card[aria-label="Goals"] .utility-card-body';
  const overflowBefore={body:await box(goalBody),stack:await box('.utility-stack')};
  await p.locator(goalBody).hover();await p.mouse.wheel(0,220);await p.waitForTimeout(150);
  const overflowAfter={body:await box(goalBody),stack:await box('.utility-stack')};
  await p.screenshot({path:'/Users/dylandahl/Desktop/Sandbox Workstation/research/reviews/2026-10-29/interaction-review/utility-overflow.png'});
  return {sourceRevision:'979a882',list,chat,canvasShift:chatCanvas.x-listCanvas.x,drag:{cursorDelta:{x:70,y:50},before,during,preview,after,grid},surfaces:{inspector,utility},overflowFixture:'60 local synthetic goals, isolated context only',overflowBefore,overflowAfter,errors};
 }finally{await c.close();}
};
