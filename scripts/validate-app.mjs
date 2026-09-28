import fs from 'node:fs';

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

const config=JSON.parse(fs.readFileSync(new URL('../config/grinder.product.json',import.meta.url),'utf8'));
if(config?.product?.id!=='grinder') failures.push('product config must identify grinder');

const auth=JSON.parse(fs.readFileSync(new URL('../config/auth.json',import.meta.url),'utf8'));
if(auth?.environment!=='closed_test') failures.push('auth environment must remain closed_test during the 14-day test phase');
if(auth?.policy!=='google_only') failures.push('closed-test auth policy must remain google_only');
if(auth?.providers?.google?.enabled!==true) failures.push('Google must be enabled for closed testing');
for(const provider of ['stackup_id','whatsapp','biometrics']){
  if(auth?.providers?.[provider]?.enabled!==false) failures.push(provider+' must remain disabled during closed testing');
}
if(!html.includes('id="googleLoginCard"')) failures.push('Grinder Google login card is missing');
const loginHtml=html.slice(0,html.indexOf('<script>\nconst T='));
if(/data-a="(?:wa|stackid|bio|google)"/.test(loginHtml)){
  failures.push('legacy active auth action detected on closed-test login screen');
}
if(!loginHtml.includes('class="btn login-disabled bio"')) failures.push('disabled biometric card must remain visible during closed testing');
if(!loginHtml.includes('class="btn login-disabled wa"')) failures.push('disabled WhatsApp card must remain visible during closed testing');
if(loginHtml.includes('stackid')) failures.push('Stack ID must remain hidden during closed testing');
if(!html.includes('<script src="core/stackup-auth.js"></script>')) failures.push('StackUp auth runtime is missing');
if(!auth?.providers?.google?.client_id){
  console.warn('GRINDER AUTH WARNING: Google Client ID is not configured yet; real Google sign-in will remain disabled.');
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
console.log('- auth policy: closed-test Google only');
console.log('- Google Client ID:',auth?.providers?.google?.client_id?'configured':'PENDING');
