#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.SOLVED_SPOT_SUPABASE_URL, key=process.env.SOLVED_SPOT_SUPABASE_SERVICE_KEY, bucket=process.env.SOLVED_SPOT_BUCKET||'solved-spots';
if(!base||!key) throw new Error('missing_server_credentials');
const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
for(const m of manifests){
 const body=await readFile('.solved-core/'+m.bankName+'.gz');
 const u=base+'/storage/v1/object/'+bucket+'/'+m.objectPath;
 const res=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/gzip','x-upsert':'false'},body});
 if(!res.ok && res.status!==409) throw new Error('upload_failed:'+m.bankName+':'+res.status+':'+await res.text());
 const dl=await fetch(u,{headers:{authorization:'Bearer '+key,apikey:key}}); if(!dl.ok) throw new Error('download_failed:'+m.bankName+':'+dl.status);
 const got=Buffer.from(await dl.arrayBuffer()); const sha=createHash('sha256').update(got).digest('hex'); if(sha!==m.sha256) throw new Error('sha_mismatch:'+m.bankName);
 const q=base+'/rest/v1/solved_spot_manifests?on_conflict=sha256';
 const row={engine:m.engine,family:m.family,solver_version:m.solverVersion,sha256:m.sha256,decision_count:m.decisionCount,object_path:m.objectPath,compression:'gzip',source_commit:process.env.GITHUB_SHA||null,validated:true,bank_name:m.bankName,contract_version:m.contractVersion,audit_mode:'STRICT_SOLVED_ONLY',migrated_at:new Date().toISOString()};
 const wr=await fetch(q,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json',prefer:'resolution=ignore-duplicates'},body:JSON.stringify(row)});
 if(!wr.ok) throw new Error('manifest_failed:'+m.bankName+':'+wr.status+':'+await wr.text());
 console.log('verified',m.bankName,m.decisionCount,m.sha256);
}
