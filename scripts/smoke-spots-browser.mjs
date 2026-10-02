import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';

const ROOT=process.cwd();
const PORT=4173;
const DEBUG_PORT=9222;
const BASE=`http://127.0.0.1:${PORT}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function contentType(file){
  if(file.endsWith('.html'))return 'text/html; charset=utf-8';
  if(file.endsWith('.js')||file.endsWith('.mjs'))return 'text/javascript; charset=utf-8';
  if(file.endsWith('.json'))return 'application/json; charset=utf-8';
  if(file.endsWith('.css'))return 'text/css; charset=utf-8';
  if(file.endsWith('.svg'))return 'image/svg+xml';
  if(file.endsWith('.png'))return 'image/png';
  if(file.endsWith('.jpg')||file.endsWith('.jpeg'))return 'image/jpeg';
  if(file.endsWith('.woff2'))return 'font/woff2';
  return 'application/octet-stream';
}

const server=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,BASE);
    let rel=decodeURIComponent(u.pathname);
    if(rel==='/'||rel==='')rel='/index.html';
    const file=path.resolve(ROOT,'.'+rel);
    if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('forbidden');}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
    res.writeHead(200,{'content-type':contentType(file),'cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  }catch(error){
    res.writeHead(500);res.end(String(error));
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve);});

let chromeBin='',xvfbBin='';
try{
  chromeBin=execFileSync('bash',['-lc','command -v google-chrome-stable || command -v google-chrome || command -v chromium || command -v chromium-browser'],{encoding:'utf8'}).trim();
  xvfbBin=execFileSync('bash',['-lc','command -v xvfb-run'],{encoding:'utf8'}).trim();
}catch(_){}
if(!chromeBin)throw new Error('Chrome/Chromium not available on runner');
if(!xvfbBin)throw new Error('xvfb-run not available on runner');
console.log('SPOTS_CHROME_BIN='+chromeBin);
console.log('SPOTS_XVFB_BIN='+xvfbBin);

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stackup-chrome-'));
const chrome=spawn(xvfbBin,[
  '-a',chromeBin,
  '--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${profile}`,
  '--window-size=430,932','about:blank'
],{stdio:['ignore','pipe','pipe'],detached:true});
let chromeErr='';
chrome.stderr.on('data',d=>{chromeErr+=String(d);});

async function json(url,options){
  const res=await fetch(url,options);
  if(!res.ok)throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
async function waitDebug(){
  for(let i=0;i<100;i++){
    try{return await json(`http://127.0.0.1:${DEBUG_PORT}/json/version`);}
    catch(_){await sleep(100);}
  }
  throw new Error('Chrome DevTools endpoint unavailable; stderr='+chromeErr.slice(-4000));
}

class CDP{
  constructor(url){
    this.ws=new WebSocket(url);
    this.seq=0;this.pending=new Map();this.events=[];
    this.ws.onmessage=e=>{
      const m=JSON.parse(e.data);
      if(m.id&&this.pending.has(m.id)){
        const {resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);
        if(m.error)reject(new Error(JSON.stringify(m.error)));else resolve(m.result);
      }else if(m.method){
        this.events.push(m);
      }
    };
  }
  async open(){
    if(this.ws.readyState===WebSocket.OPEN)return;
    await new Promise((resolve,reject)=>{
      this.ws.onopen=resolve;
      this.ws.onerror=()=>reject(new Error('WebSocket open failed'));
    });
  }
  send(method,params={}){
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){try{this.ws.close();}catch(_){}}
}

let page=null,browser=null;
try{
  const version=await waitDebug();
  browser=new CDP(version.webSocketDebuggerUrl);await browser.open();
  const made=await browser.send('Target.createTarget',{url:'about:blank'});
  let targetInfo=null;
  for(let i=0;i<50;i++){
    const list=await json(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    targetInfo=list.find(x=>x.id===made.targetId);
    if(targetInfo)break;
    await sleep(50);
  }
  if(!targetInfo?.webSocketDebuggerUrl)throw new Error('Page target unavailable');
  page=new CDP(targetInfo.webSocketDebuggerUrl);await page.open();

  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:2.5,mobile:true});
  await page.send('Network.setUserAgentOverride',{
    userAgent:'Mozilla/5.0 (Linux; Android 16; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
  });
  await page.send('Page.navigate',{url:BASE+'/?smoke=spots'});

  for(let i=0;i<100;i++){
    const r=await page.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
    if(r.result?.value==='complete')break;
    await sleep(100);
  }
  await sleep(200);

  const enter=await page.send('Runtime.evaluate',{expression:`(()=>{
    const app=document.getElementById('app2');
    if(!app)return {ok:false,reason:'app2_missing'};
    if(typeof app.grinderEnter==='function')app.grinderEnter();
    const root=app.shadowRoot;
    if(!root)return {ok:false,reason:'shadow_missing'};
    const tab=root.querySelector('.tab[data-t="spots"]');
    if(!tab)return {ok:false,reason:'spots_tab_missing'};
    tab.click();
    return {ok:true};
  })()`,returnByValue:true,awaitPromise:true});
  if(!enter.result?.value?.ok)throw new Error('Cannot enter Spots: '+JSON.stringify(enter.result?.value));

  let setup=false;
  for(let i=0;i<50;i++){
    const r=await page.send('Runtime.evaluate',{expression:`!!document.getElementById('app2')?.shadowRoot?.querySelector('[data-spot-start]')`,returnByValue:true});
    if(r.result?.value){setup=true;break;}
    await sleep(100);
  }
  if(!setup)throw new Error('Spots setup button did not render');

  await page.send('Runtime.evaluate',{expression:`document.getElementById('app2').shadowRoot.querySelector('[data-spot-start]').click()`,returnByValue:true});

  let last=null;
  const timeline=[];
  for(let i=0;i<100;i++){
    const r=await page.send('Runtime.evaluate',{expression:`(()=>{
      const root=document.getElementById('app2')?.shadowRoot;
      const wrap=root?.querySelector('.spotwrap');
      const client=window.StackUpSpotsClient?.state;
      return {
        elapsed:0,
        seats:root?.querySelectorAll('.spotwrap .seat').length||0,
        hero:root?.querySelectorAll('.spotwrap .seat.hero').length||0,
        cards:root?.querySelectorAll('.spotwrap .pcard:not(.pempty)').length||0,
        actions:root?.querySelectorAll('.spotactions .spotaction').length||0,
        setup:!!root?.querySelector('[data-spot-start]'),
        loading:client?.loading??null,
        error:client?.error??null,
        source:client?.source??null,
        current:client?.current?.id||null,
        wrapText:(wrap?.textContent||'').trim().slice(0,240)
      };
    })()`,returnByValue:true});
    last=r.result?.value||null;
    last.elapsed=i*150;
    timeline.push(last);
    if(last?.seats>0&&last?.hero>0&&last?.client!==null&&last?.current)break;
    await sleep(150);
  }

  const exceptions=page.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>({
    text:e.params?.exceptionDetails?.text,
    exception:e.params?.exceptionDetails?.exception?.description
  }));
  const logs=page.events.filter(e=>e.method==='Log.entryAdded').map(e=>e.params?.entry).filter(Boolean);

  console.log('SPOTS_SMOKE_LAST='+JSON.stringify(last));
  console.log('SPOTS_SMOKE_TIMELINE='+JSON.stringify(timeline.filter((x,i)=>i===0||i===timeline.length-1||i%8===0)));
  if(exceptions.length)console.log('SPOTS_EXCEPTIONS='+JSON.stringify(exceptions.slice(-20)));
  if(logs.length)console.log('SPOTS_LOGS='+JSON.stringify(logs.slice(-20)));

  if(!(last?.seats>0&&last?.hero>0&&last?.current)){
    throw new Error('Spots did not become playable within 15s: '+JSON.stringify(last));
  }
  console.log('SPOTS_BROWSER_SMOKE_OK');
}finally{
  page?.close();browser?.close();
  try{process.kill(-chrome.pid,'SIGKILL');}catch(_){try{chrome.kill('SIGKILL');}catch(_){}}
  await new Promise(r=>server.close(()=>r()));
  try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){}
  if(chromeErr&&process.env.SPOTS_SMOKE_DEBUG==='1')console.error(chromeErr);
}
