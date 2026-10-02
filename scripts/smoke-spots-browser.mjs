import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFile,execFileSync} from 'node:child_process';

const ROOT=process.cwd();
const PORT=4173;
const BASE=`http://127.0.0.1:${PORT}`;

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

const smokeHtml=`<!doctype html>
<html><head><meta charset="utf-8"><title>Spots smoke</title></head>
<body>
<pre id="result">SPOTS_BROWSER_SMOKE_PENDING</pre>
<iframe id="frame" src="/?smoke=spots" style="width:430px;height:932px;border:0"></iframe>
<script>
(function(){
  const result=document.getElementById('result');
  const frame=document.getElementById('frame');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let last=null;
  function fail(reason,extra){
    result.textContent='SPOTS_BROWSER_SMOKE_FAIL '+reason+' '+JSON.stringify(extra||last||{});
    document.body.dataset.smoke='fail';
  }
  window.addEventListener('error',e=>fail('window_error',{message:e.message,stack:e.error&&e.error.stack}));
  frame.addEventListener('load',async()=>{
    try{
      const w=frame.contentWindow;
      const d=frame.contentDocument;
      let app=null;
      for(let i=0;i<80;i++){
        app=d.getElementById('app2');
        if(app&&typeof app.grinderEnter==='function'&&app.shadowRoot)break;
        await sleep(100);
      }
      if(!app||!app.shadowRoot)return fail('app_not_ready');
      app.grinderEnter();
      const root=app.shadowRoot;
      const tab=root.querySelector('.tab[data-t="spots"]');
      if(!tab)return fail('spots_tab_missing');
      tab.click();

      let start=null;
      for(let i=0;i<60;i++){
        start=root.querySelector('[data-spot-start]');
        if(start)break;
        await sleep(100);
      }
      if(!start)return fail('start_button_missing');
      start.click();

      for(let i=0;i<100;i++){
        const wrap=root.querySelector('.spotwrap');
        const client=w.StackUpSpotsClient&&w.StackUpSpotsClient.state;
        last={
          elapsed:i*150,
          seats:root.querySelectorAll('.spotwrap .seat').length,
          hero:root.querySelectorAll('.spotwrap .seat.hero').length,
          cards:root.querySelectorAll('.spotwrap .pcard:not(.pempty)').length,
          actions:root.querySelectorAll('.spotactions .spotaction').length,
          setup:!!root.querySelector('[data-spot-start]'),
          loading:client?client.loading:null,
          error:client?client.error:null,
          source:client?client.source:null,
          current:client&&client.current?client.current.id:null,
          wrapText:(wrap&&wrap.textContent||'').trim().slice(0,240)
        };
        if(last.seats>0&&last.hero>0&&last.current){
          result.textContent='SPOTS_BROWSER_SMOKE_OK '+JSON.stringify(last);
          document.body.dataset.smoke='ok';
          return;
        }
        if(last.setup&&last.error){
          return fail('returned_to_setup',last);
        }
        await sleep(150);
      }
      fail('timeout',last);
    }catch(error){
      fail('exception',{message:String(error&&error.message||error),stack:String(error&&error.stack||'')});
    }
  });
})();
<\/script>
</body></html>`;

const server=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,BASE);
    if(u.pathname==='/__smoke_spots.html'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return res.end(smokeHtml);
    }
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

let chromeBin='';
try{
  chromeBin=execFileSync('bash',['-lc','command -v google-chrome-stable || command -v google-chrome || command -v chromium || command -v chromium-browser'],{encoding:'utf8'}).trim();
}catch(_){}
if(!chromeBin)throw new Error('Chrome/Chromium not available on runner');
console.log('SPOTS_CHROME_BIN='+chromeBin);

const args=[
  '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--window-size=430,932','--touch-events=enabled',
  '--user-agent=Mozilla/5.0 (Linux; Android 16; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  '--virtual-time-budget=22000','--dump-dom',
  BASE+'/__smoke_spots.html'
];

try{
  const {stdout,stderr}=await new Promise((resolve,reject)=>{
    execFile(chromeBin,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:30000},(error,stdout,stderr)=>{
      if(error&&error.killed)return reject(new Error('Chrome smoke timeout; stderr='+String(stderr).slice(-3000)));
      resolve({stdout:String(stdout||''),stderr:String(stderr||''),error});
    });
  });
  const marker=stdout.match(/SPOTS_BROWSER_SMOKE_(?:OK|FAIL)[^<]*/);
  console.log(marker?marker[0]:'SPOTS_BROWSER_SMOKE_NO_MARKER');
  if(!stdout.includes('SPOTS_BROWSER_SMOKE_OK')){
    console.error('CHROME_STDERR='+stderr.slice(-4000));
    console.error('CHROME_DOM_TAIL='+stdout.slice(-8000));
    throw new Error('Spots browser smoke failed');
  }
}finally{
  await new Promise(r=>server.close(()=>r()));
}
