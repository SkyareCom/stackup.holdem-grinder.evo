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
