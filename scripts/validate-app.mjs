import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const failures=[];

if(Buffer.byteLength(html,'utf8')>=1024*1024) failures.push('index.html must remain below 1 MB');
if(!html.includes('/* ENTRY GUARD:')) failures.push('ENTRY GUARD marker is missing');
if(!html.includes('REGRA DE TRADUCAO: todo novo item deve ser criado simultaneamente em PT, EN e ES.')){
  failures.push('translation rule marker is missing');
}
if(/(?<!\$)\$\('\[data-i\]'\)\.forEach/.test(html)){
  failures.push("render regression detected: use $$('[data-i]') instead of $('[data-i]')");
}

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>/g)].map(m=>{
  const tag=m[0];
  const start=m.index+tag.length;
  const end=html.indexOf('</script>',start);
  return {tag,code:end>=0?html.slice(start,end):''};
}).filter(x=>!(/\bsrc\s*=/.test(x.tag)));

scripts.forEach((s,i)=>{
  try{new Function(s.code);}
  catch(error){failures.push('inline script '+i+' syntax error: '+error.message);}
});

const tournamentMathPath=new URL('../core/stackup-tournament-math.js',import.meta.url);
const catalogPath=new URL('../core/stackup-scenario-catalog.js',import.meta.url);
const sequencerPath=new URL('../core/stackup-training-sequencer.js',import.meta.url);
const spotsClientPath=new URL('../core/stackup-spots-client.js',import.meta.url);
const serverPath=new URL('../solver-api/server.mjs',import.meta.url);
const tournamentMath=fs.readFileSync(tournamentMathPath,'utf8');
const catalog=fs.readFileSync(catalogPath,'utf8');
const sequencer=fs.readFileSync(sequencerPath,'utf8');
try{
  const mathWindow={};
  new Function('window',tournamentMath)(mathWindow);
  const icm=mathWindow.StackUpTournamentMath;
  const winnerTakeAll=icm.equities([60,30,10],[100,0,0]);
  if(Math.abs(winnerTakeAll[0]-60)>1e-7||Math.abs(winnerTakeAll[1]-30)>1e-7||Math.abs(winnerTakeAll[2]-10)>1e-7){
    failures.push('ICM winner-take-all invariant failed');
  }
  const equal=icm.equities([1,1,1],[50,30,20]);
  if(equal.some(v=>Math.abs(v-(100/3))>1e-7))failures.push('ICM equal-stack symmetry invariant failed');
  const rp=icm.riskPremium({stacks:[40,30,20,10],payouts:[50,30,20,0],heroIndex:1,villainIndex:0,risk:10});
  if(!Number.isFinite(rp.factor)||!Number.isFinite(rp.requiredWinProbability))failures.push('ICM risk premium must be finite');
}catch(error){failures.push('tournament math syntax/runtime error: '+error.message);}
const spotsClient=fs.readFileSync(spotsClientPath,'utf8');
try{
  const fakeWindow={};
  new Function('window',catalog)(fakeWindow);
  const counts=fakeWindow.StackUpScenarioCatalog?.count?.();
  if(counts?.adjust!==58)failures.push('scenario catalog must contain exactly 58 AJUSTES cards, found '+String(counts?.adjust));
  if(counts?.advance!==104)failures.push('scenario catalog must contain exactly 104 ADVANCE cards, found '+String(counts?.advance));
  if(fakeWindow.StackUpScenarioCatalog?.MIN_SPOTS!==1500)failures.push('scenario catalog minimum must be 1500 spots per card');
}catch(error){failures.push('scenario catalog syntax/runtime error: '+error.message);}
try{new Function(sequencer);}
catch(error){failures.push('training sequencer syntax error: '+error.message);}
try{new Function(spotsClient);}
catch(error){failures.push('spots client syntax error: '+error.message);}
if(!html.includes('<script src="core/stackup-tournament-math.js"></script>')){
  failures.push('tournament math script is missing from index');
}
if(!html.includes('<script src="core/stackup-scenario-catalog.js"></script>')){
  failures.push('scenario catalog script is missing from index');
}
if(!html.includes('<script src="core/stackup-training-sequencer.js"></script>')){
  failures.push('training sequencer script is missing from index');
}
if(html.indexOf('stackup-scenario-catalog.js')>html.indexOf('stackup-training-sequencer.js')){
  failures.push('scenario catalog must load before training sequencer');
}
if(html.indexOf('stackup-training-sequencer.js')>html.indexOf('stackup-spots-client.js')){
  failures.push('training sequencer must load before spots client');
}
if(!spotsClient.includes('sequencer.pick(bank,filters||{})')){
  failures.push('spots client must use Training Sequencer V2');
}
if(!sequencer.includes('trainingSignature')||!sequencer.includes('recentFamilies')){
  failures.push('anti-repeat signature/family protection is missing');
}
if(!html.includes('heroPositions:positions')||!html.includes('effectiveStacks')){
  failures.push('multi-select solver filters are not wired from the UI');
}
const serverCheck=spawnSync(process.execPath,['--check',fileURLToPath(serverPath)],{encoding:'utf8'});
if(serverCheck.status!==0){
  failures.push('solver API syntax error: '+String(serverCheck.stderr||serverCheck.stdout||'unknown').trim());
}

const config=JSON.parse(fs.readFileSync(new URL('../config/grinder.product.json',import.meta.url),'utf8'));
if(config?.product?.id!=='grinder') failures.push('product config must identify grinder');

const auth=JSON.parse(fs.readFileSync(new URL('../config/auth.json',import.meta.url),'utf8'));
const loginHtml=html.slice(0,html.indexOf('<script>\nconst T='));
if(!html.includes('<script src="core/stackup-auth.js"></script>')) failures.push('StackUp auth runtime is missing');
if(!html.includes('id="googleLoginCard"')) failures.push('Grinder Google login card is missing');

if(auth?.environment==='development'){
  if(auth?.policy!=='development_bypass') failures.push('development auth policy must be development_bypass');
  if(auth?.require_auth!==false) failures.push('development must allow direct app entry');
}else if(auth?.environment==='closed_test'){
  if(auth?.policy!=='google_only') failures.push('closed-test auth policy must be google_only');
  if(auth?.require_auth!==true) failures.push('closed test must require authentication');
  if(auth?.providers?.google?.enabled!==true) failures.push('Google must be enabled for closed testing');
  for(const provider of ['stackup_id','whatsapp','biometrics']){
    if(auth?.providers?.[provider]?.enabled!==false) failures.push(provider+' must remain disabled during closed testing');
  }
  if(/data-a="(?:wa|stackid|bio|google)"/.test(loginHtml)){
    failures.push('legacy active auth action detected on closed-test login screen');
  }
  if(!loginHtml.includes('class="btn login-disabled bio"')) failures.push('disabled biometric card must remain visible during closed testing');
  if(!loginHtml.includes('class="btn login-disabled wa"')) failures.push('disabled WhatsApp card must remain visible during closed testing');
  if(loginHtml.includes('stackid')) failures.push('Stack ID must remain hidden during closed testing');
  if(!auth?.providers?.google?.client_id){
    failures.push('Google Client ID must be configured for closed testing');
  }
}else{
  failures.push('unsupported auth environment: '+String(auth?.environment));
}
for(const plan of ['free','edge','full']){
  if(!config?.plans?.[plan]) failures.push('missing plan '+plan);
}
if(config?.rollout?.feature_gating_enabled!==false){
  failures.push('feature gating must remain disabled until server entitlements are live');
}

const contract=JSON.parse(fs.readFileSync(new URL('../contracts/analytics-events.json',import.meta.url),'utf8'));
if(contract?.product!=='grinder') failures.push('analytics contract must identify grinder');
for(const event of ['app_open','training_started','training_completed','subscription_started','cross_sell_converted']){
  if(!contract?.events?.[event]) failures.push('analytics contract missing '+event);
}

if(failures.length){
  console.error('\nGRINDER VALIDATION FAILED\n- '+failures.join('\n- '));
  process.exit(1);
}

console.log('GRINDER validation passed');
console.log('- inline scripts:',scripts.length);
console.log('- index bytes:',Buffer.byteLength(html,'utf8'));
console.log('- plans: FREE / EDGE / FULL');
console.log('- product analytics: grinder');
console.log('- auth environment:',auth?.environment);
console.log('- auth policy:',auth?.policy);
console.log('- require auth:',auth?.require_auth);
