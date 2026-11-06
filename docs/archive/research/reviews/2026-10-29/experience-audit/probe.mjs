export default async (page) => {
 const browser = page.context().browser();
 const results = [];
 for (const width of [1440, 1280]) {
  const context = await browser.newContext({viewport:{width,height:900}});
  const p = await context.newPage(); p.setDefaultTimeout(6000);
  const errors = []; p.on('pageerror',e=>errors.push(e.message));
  const measure = async () => p.evaluate(() => {
   const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   const visible = el => el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0 && getComputedStyle(el).visibility!=='hidden';
   const modules = [...document.querySelectorAll('.canvas-object,.utility-card,.left-extension,.inspection-surface,.composer')].filter(visible).map(el=>({name:el.getAttribute('aria-label')||el.className,rect:rect(el)}));
   const popups = [...document.querySelectorAll('.work-actions,.attachment-picker,.account-pop')].filter(visible).map(el=>({name:el.getAttribute('aria-label')||el.className,rect:rect(el)}));
   const overlap = (a,b) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
   return {modules,popups,intersections:popups.flatMap(a=>modules.map(b=>({popup:a.name,module:b.name,area:Math.round(overlap(a.rect,b.rect))}))).filter(r=>r.area>0)};
  });
  try {
   await p.goto('http://127.0.0.1:4174/');
   await p.getByRole('button',{name:'Conversations',exact:true}).click();
   await p.getByRole('button',{name:'# product-direction',exact:true}).click();
   const chat = await p.evaluate(()=>({historyWidth:Math.round(document.querySelector('.left-extension').getBoundingClientRect().width),messages:document.querySelectorAll('.message').length,profilePhotos:document.querySelectorAll('.message-avatar img').length,authors:[...document.querySelectorAll('.message-meta strong')].map(el=>({text:el.textContent,color:getComputedStyle(el).color})),participantsButton:[...document.querySelectorAll('button')].filter(el=>/participants|members/i.test(el.getAttribute('aria-label')||'')).length}));
   await p.getByRole('button',{name:'Graph',exact:true}).click();
   await p.getByRole('button',{name:'Project tools',exact:true}).click();
   await p.waitForTimeout(450);
   const graph = await p.evaluate(()=>({nodeKinds:[...document.querySelectorAll('svg g[role=button]')].map(el=>el.getAttribute('aria-label')),activityElements:document.querySelectorAll('[data-agent-id],[data-job-id],[data-activity-id]').length,text:document.querySelector('main').innerText}));
   await p.screenshot({path:'/Users/dylandahl/Desktop/Sandbox Workstation/research/reviews/2026-10-29/experience-audit/graph-chat-'+width+'.png'});
   await p.getByRole('button',{name:'Project tools',exact:true}).click();
   await p.getByRole('button',{name:'Canvas',exact:true}).click();
   await p.locator('.open-work-button').click();
   await p.getByRole('button',{name:/^Open project plan/}).click();
   await p.getByRole('button',{name:'Focus project plan',exact:true}).click();
   await p.locator('.open-work-button').click();
   const workSearch = await measure();
   await p.screenshot({path:'/Users/dylandahl/Desktop/Sandbox Workstation/research/reviews/2026-10-29/experience-audit/open-work-over-plan-'+width+'.png'});
   await p.keyboard.press('Escape');
   await p.getByRole('button',{name:'Attach context',exact:true}).click();
   const attachment = await measure();
   await p.screenshot({path:'/Users/dylandahl/Desktop/Sandbox Workstation/research/reviews/2026-10-29/experience-audit/attachment-over-plan-'+width+'.png'});
   await p.keyboard.press('Escape');
   await p.getByRole('button',{name:'Account and appearance',exact:true}).click();
   const account = await measure();
   results.push({viewport:{width,height:900},chat,graph,popups:{workSearch,attachment,account},errors});
  } catch(e) {results.push({viewport:{width,height:900},probeError:e.message,body:(await p.locator('body').innerText()).slice(0,1400)});}
  finally {await context.close();}
 }
 return results;
};
