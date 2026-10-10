#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.SOLVED_SPOT_SUPABASE_URL, key=process.env.SOLVED_SPOT_SUPABASE_SERVICE_KEY, bucket=process.env.SOLVED_SPOT_BUCKET||'solved-spots';
if(!base||!key) throw new Error('missing_server_credentials');
const approvalBytes=await readFile('.solved-core/approval.json');
const approvalSha256=createHash('sha256').update(approvalBytes).digest('hex');
const approval=JSON.parse(approvalBytes.toString('utf8'));
const sourceCommit=String(process.env.GITHUB_SHA||'').trim();
if(!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('verified_source_commit_required');
if(approval?.status!=='APPROVED') throw new Error('audit_approval_required');
if(approval?.audit_mode!=='AUTOMATED_STRICT_CONTRACT') throw new Error('automated_audit_mode_required');
if(approval?.source_commit!==sourceCommit) throw new Error('approval_source_commit_mismatch');
const auditRef=String(approval?.audit_ref||'').trim();
if(!auditRef) throw new Error('audit_reference_required');
if(!approval?.audited_at) throw new Error('audit_timestamp_required');
const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
const approved=new Map((approval?.manifests||[]).map(x=>[x.bank_name,x.sha256]));
if(approved.size!==manifests.length) throw new Error('approval_manifest_count_mismatch');
for(const m of manifests){
 if(approved.get(m.bankName)!==m.sha256) throw new Error('approval_hash_mismatch:'+m.bankName);
}
// Complete approval preflight before the first remote write.
const catalogBytes=await readFile('.solved-core/catalog.json');
const catalog=JSON.parse(catalogBytes.toString('utf8'));
const catalogSha=createHash('sha256').update(catalogBytes).digest('hex');
if(String(approval?.catalog_sha256||'')!==catalogSha) throw new Error('approval_catalog_hash_mismatch');
if(!Array.isArray(catalog)||catalog.length!==approval.decision_count)throw new Error('approval_catalog_count_mismatch');
const approvedManifests=new Map(manifests.map(m=>[m.bankName,m]));
const uniqueIds=new Set();
for(const row of catalog){
 const m=approvedManifests.get(row.bank_name);
 if(!m||row.manifest_sha256!==m.sha256||row.object_path!==m.objectPath||!row.solve_id||uniqueIds.has(row.solve_id))throw new Error('approval_catalog_row_mismatch');
 uniqueIds.add(row.solve_id);
}
for(const m of manifests){
 const body=await readFile('.solved-core/'+m.bankName+'.gz');
 const localSha=createHash('sha256').update(body).digest('hex');
 if(localSha!==m.sha256)throw new Error('local_bank_sha_mismatch:'+m.bankName);
 const u=base+'/storage/v1/object/'+bucket+'/'+m.objectPath;
 const res=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/gzip','x-upsert':'false'},body});
 if(!res.ok && res.status!==409) throw new Error('upload_failed:'+m.bankName+':'+res.status+':'+await res.text());
 const dl=await fetch(u,{headers:{authorization:'Bearer '+key,apikey:key}}); if(!dl.ok) throw new Error('download_failed:'+m.bankName+':'+dl.status);
 const got=Buffer.from(await dl.arrayBuffer()); const sha=createHash('sha256').update(got).digest('hex'); if(sha!==m.sha256) throw new Error('sha_mismatch:'+m.bankName);
 const q=base+'/rest/v1/solved_spot_manifests?on_conflict=sha256';
 const row={engine:m.engine,family:m.family,solver_version:m.solverVersion,sha256:m.sha256,decision_count:m.decisionCount,object_path:m.objectPath,compression:'gzip',source_repository:process.env.GITHUB_REPOSITORY||'SkyareCom/stackup.holdem-grinder.evo',source_commit:sourceCommit,validated:true,bank_name:m.bankName,contract_version:m.contractVersion,audit_mode:'STRICT_SOLVED_ONLY',audit_status:'APPROVED',published:true,audited_at:approval.audited_at,provenance:{pipeline:'solved-core-migration',github_run_id:process.env.GITHUB_RUN_ID||null,audit_ref:auditRef,approval_sha256:approvalSha256}};
 const wr=await fetch(q,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json',prefer:'resolution=ignore-duplicates'},body:JSON.stringify(row)});
 if(!wr.ok) throw new Error('manifest_failed:'+m.bankName+':'+wr.status+':'+await wr.text());
 console.log('verified',m.bankName,m.decisionCount,m.sha256);
}

const manifestBySha=new Map();
for(const m of manifests){
 const manifestUrl=base+'/rest/v1/solved_spot_manifests?select=id,sha256&sha256=eq.'+encodeURIComponent(m.sha256);
 const manifestRows=await fetch(manifestUrl,{headers:{authorization:'Bearer '+key,apikey:key}});
 if(!manifestRows.ok)throw new Error('manifest_lookup_failed:'+m.bankName+':'+manifestRows.status+':'+await manifestRows.text());
 const rows=await manifestRows.json();
 if(!Array.isArray(rows)||rows.length!==1||!rows[0].id||rows[0].sha256!==m.sha256)throw new Error('manifest_lookup_ambiguous:'+m.bankName);
 manifestBySha.set(m.sha256,rows[0].id);
}
for(const m of manifests)if(!manifestBySha.has(m.sha256))throw new Error('remote_manifest_missing:'+m.bankName);
const batchSize=500;
for(let i=0;i<catalog.length;i+=batchSize){
 const batch=catalog.slice(i,i+batchSize).map(x=>{
   const manifest_id=manifestBySha.get(x.manifest_sha256);
   if(!manifest_id)throw new Error('manifest_id_missing:'+x.bank_name+':'+x.manifest_sha256);
   const {bank_name,manifest_sha256,...row}=x;
   return {...row,manifest_id,audit_status:'APPROVED',published:true,provenance:{...(row.provenance||{}),audit_ref:auditRef,approval_sha256:approvalSha256,audited_at:approval.audited_at,source_commit:sourceCommit}};
 });
 const wr=await fetch(base+'/rest/v1/solved_spot_catalog?on_conflict=solve_id',{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json',prefer:'resolution=ignore-duplicates'},body:JSON.stringify(batch)});
 if(!wr.ok)throw new Error('catalog_failed:'+i+':'+wr.status+':'+await wr.text());
 console.log('catalog_batch',i,batch.length);
}
const countUrl=base+'/rest/v1/solved_spot_catalog?select=solve_id&published=eq.true&provenance->>approval_sha256=eq.'+encodeURIComponent(approvalSha256);
const verify=await fetch(countUrl,{headers:{authorization:'Bearer '+key,apikey:key,prefer:'count=exact'},method:'HEAD'});
if(!verify.ok)throw new Error('catalog_parity_lookup_failed:'+verify.status);
const range=verify.headers.get('content-range')||'';
if(!/^\d+-\d+\/\d+$/.test(range))throw new Error('catalog_parity_content_range_invalid:'+range);
const remoteCount=Number(range.split('/').pop());
if(!Number.isSafeInteger(remoteCount)||remoteCount!==catalog.length)throw new Error('catalog_parity_mismatch:'+remoteCount+':'+catalog.length);
console.log('catalog_complete_verified',catalog.length);
