#!/usr/bin/env node
// Fail-closed automated technical approval. This is NOT independent solver replay.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceCommit=String(process.env.GITHUB_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sourceCommit))throw new Error('source_commit_required');
const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
const catalogBytes=await readFile('.solved-core/catalog.json');
const catalog=JSON.parse(catalogBytes.toString('utf8'));
if(!Array.isArray(manifests)||!manifests.length||!Array.isArray(catalog)||!catalog.length)throw new Error('empty_package');
const code=await readFile('core/stackup-solved-spot-contract.js','utf8');
const sb={globalThis:{}};vm.createContext(sb);vm.runInContext(code,sb);
const C=sb.globalThis.StackUpSolvedSpotContract;
if(!C)throw new Error('contract_missing');
const byBank=new Map(),seen=new Set(),canonicalDecisions=new Set();
for(const m of manifests){
 if(!m.bankName||byBank.has(m.bankName)||!/^([a-f0-9]{64})$/.test(m.sha256))throw new Error('invalid_manifest');
 const gz=await readFile('.solved-core/'+m.bankName+'.gz');
 if(hash(gz)!==m.sha256)throw new Error('bank_sha_mismatch:'+m.bankName);
 const payload=JSON.parse(gunzipSync(gz).toString('utf8'));
 const spots=Array.isArray(payload)?payload:(payload.spots??[]);
 const audit=C.auditSpots(spots);
 if(audit.invalidEntries||audit.projectedRejected||audit.uniqueSolvedSpots!==audit.rawEntries||audit.uniqueSolvedSpots!==m.decisionCount)throw new Error('bank_audit_failed:'+m.bankName);
 let count=0;
 for(const spot of spots)for(const entry of spot.strategy||[]){
   const v=C.validateSolvedDecision(spot,entry);
   if(!v.ok||seen.has(v.id))throw new Error('invalid_or_duplicate_decision:'+m.bankName+':'+v.id);
   const canonicalKey=JSON.stringify([v.scenarioFingerprint,String(entry.hand||'').trim().toUpperCase()]);
   if(canonicalDecisions.has(canonicalKey))throw new Error('canonical_scenario_hand_duplicate:'+m.bankName);
   canonicalDecisions.add(canonicalKey);
   seen.add(v.id);count++;
 }
 if(count!==m.decisionCount)throw new Error('decision_count_mismatch:'+m.bankName);
 byBank.set(m.bankName,m);
}
if(catalog.length!==seen.size)throw new Error('catalog_size_mismatch');
const catalogIds=new Set();
for(const row of catalog){
 const m=byBank.get(row.bank_name);
 if(!m||row.manifest_sha256!==m.sha256||row.object_path!==m.objectPath||!seen.has(row.solve_id)||catalogIds.has(row.solve_id)||row.audit_status!=='PENDING'||row.published!==false)throw new Error('catalog_mismatch:'+row.solve_id);
 catalogIds.add(row.solve_id);
}
const approval={
 schema_version:1,status:'APPROVED',audit_ref:'github-actions-automated-contract-audit:'+String(process.env.GITHUB_RUN_ID||'local'),
 audit_mode:'AUTOMATED_STRICT_CONTRACT',audited_at:new Date().toISOString(),
 source_commit:sourceCommit,contract_version:C.VERSION,decision_count:seen.size,
 catalog_sha256:hash(catalogBytes),manifests:manifests.map(m=>({bank_name:m.bankName,sha256:m.sha256}))
};
await writeFile('.solved-core/approval.json',JSON.stringify(approval,null,2)+'\n');
console.log(JSON.stringify({status:approval.status,mode:approval.audit_mode,banks:manifests.length,decisions:seen.size}));
