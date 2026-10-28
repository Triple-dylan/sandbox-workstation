'use strict';
// Optional local test harness; no production framework or package installation is implied.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const url=process.env.WORKSTATION_URL||'http://127.0.0.1:4173/';
const scenarios=['browser-scenarios.js','workflow-scenarios.js','content-contract-scenarios.js','content-editing-scenarios.js'];
(async()=>{
 const browser=await chromium.launch();let total=0;
 try{
  for(const file of scenarios){
   const context=await browser.newContext({viewport:{width:1440,height:1000}});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url);
    const run=Function('return ('+fs.readFileSync(path.join(__dirname,file),'utf8')+');')();
    const checks=await run(page);
    if(errors.length)throw Error(errors.join('\n'));
    total+=checks.length;console.log('PASS '+file+': '+checks.length+' assertions; no page exceptions');
   }finally{await context.close()}
  }
  console.log('PASS total: '+total+' browser assertions');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
