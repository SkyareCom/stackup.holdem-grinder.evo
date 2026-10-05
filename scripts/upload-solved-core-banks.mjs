#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.SOLVED_SPOT_SUPABASE_URL, key=process.env.SOLVED_SPOT_SUPABASE_SERVICE_KEY, bucket=process.env.SOLVED_SPOT_BUCKET||'solved-spots';
if(!base||!key) throw new Error('missing_server_credentials');
if(process.env.SOLVED_SPOT_AUDIT_APPROVED!=='true') throw new Error('audit_approval_required');
const auditRef=String(process.env.SOLVED_SPOT_AUDIT_REF||'').trim();
if(!auditRef) throw new Error('audit_reference_required');
const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
for(const m of manifests){
 const body=await readFile('.solved-core/'+m.bankName+'.gz');
 const u=base+'/storage/v1/object/'+bucket+'/'+m.objectPath;
 const res=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/gzip','x-upsert':'false'},body});
 if(!res.ok && res.status!==409) throw new Error('upload_failed:'+m.bankName+':'+res.status+':'+await res.text());
 const dl=await fetch(u,{headers:{authorization:'Bearer '+key,apikey:key}}); if(!dl.ok) throw new Error('download_failed:'+m.bankName+':'+dl.status);
 const got=Buffer.from(await dl.arrayBuffer()); const sha=createHash('sha256').update(got).digest('hex'); if(sha!==m.sha256) throw new Error('sha_mismatch:'+m.bankName);
 const q=base+'/rest/v1/solved_spot_manifests?on_conflict=sha256';
 const row={engine:m.engine,family:m.family,solver_version:m.solverVersion,sha256:m.sha256,decision_count:m.decisionCount,object_path:m.objectPath,compression:'gzip',source_repository:process.env.GITHUB_REPOSITORY||'SkyareCom/stackup.holdem-grinder.evo',source_commit:process.env.GITHUB_SHA||'UNVERIFIED',validated:true,bank_name:m.bankName,contract_version:m.contractVersion,audit_mode:'STRICT_SOLVED_ONLY',audit_status:'APPROVED',published:true,audited_at:new Date().toISOString(),provenance:{pipeline:'solved-core-migration',github_run_id:process.env.GITHUB_RUN_ID||null,audit_ref:auditRef}};
 const wr=await fetch(q,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json',prefer:'resolution=ignore-duplicates'},body:JSON.stringify(row)});
 if(!wr.ok) throw new Error('manifest_failed:'+m.bankName+':'+wr.status+':'+await wr.text());
 console.log('verified',m.bankName,m.decisionCount,m.sha256);
}

const catalog=JSON.parse(await readFile('.solved-core/catalog.json','utf8'));
const manifestRows=await fetch(base+'/rest/v1/solved_spot_manifests?select=id,sha256',{headers:{authorization:'Bearer '+key,apikey:key}});
if(!manifestRows.ok)throw new Error('manifest_lookup_failed:'+manifestRows.status+':'+await manifestRows.text());
const manifestBySha=new Map((await manifestRows.json()).map(x=>[x.sha256,x.id]));
const batchSize=500;
for(let i=0;i<catalog.length;i+=batchSize){
 const batch=catalog.slice(i,i+batchSize).map(x=>{
   const manifest_id=manifestBySha.get(x.manifest_sha256);
   if(!manifest_id)throw new Error('manifest_id_missing:'+x.bank_name+':'+x.manifest_sha256);
   const {bank_name,manifest_sha256,...row}=x;
   return {...row,manifest_id};
 });
 const wr=await fetch(base+'/rest/v1/solved_spot_catalog?on_conflict=solve_id',{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json',prefer:'resolution=ignore-duplicates'},body:JSON.stringify(batch)});
 if(!wr.ok)throw new Error('catalog_failed:'+i+':'+wr.status+':'+await wr.text());
 console.log('catalog_batch',i,batch.length);
}
console.log('catalog_complete',catalog.length);
