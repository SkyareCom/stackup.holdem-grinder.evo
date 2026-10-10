#!/usr/bin/env node
// Evidence gate. Coverage alone is NOT mathematical certification.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const sha=x=>createHash('sha256').update(x).digest('hex');
const raw=await readFile('data/solver/coverage.json');
const coverage=JSON.parse(raw.toString());
const catalogCode=await readFile('core/stackup-scenario-catalog.js','utf8');
const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(catalogCode,sandbox);
const catalog=sandbox.window.StackUpScenarioCatalog;
if(!catalog)throw Error('scenario_catalog_missing');
const byKey=new Map();
for(const card of coverage.cards||[]){
 const key=card.section+':'+card.id;
 if(byKey.has(key))throw Error('duplicate_coverage_filter:'+key);
 byKey.set(key,card);
}
const catalogKeys=new Set(catalog.ALL.map(x=>x.section+':'+x.id));
if(catalogKeys.size!==catalog.ALL.length)throw Error('duplicate_catalog_filter');
const unknownCoverageKeys=[...byKey.keys()].filter(key=>!catalogKeys.has(key));
const deficits=catalog.ALL.map(x=>{
 const card=byKey.get(x.section+':'+x.id);
 const count=Number(card?.validatedSolvedSpots??0);
 if(!Number.isSafeInteger(count)||count<0)throw Error('invalid_solved_count:'+x.section+':'+x.id);
 return {key:x.section+':'+x.id,solver:x.source,validatedSolvedSpots:count,missing:Math.max(0,1500-count),eligible:count>=1500&&card?.publishable===true};
}).filter(x=>!x.eligible);
let replay=null;
try{replay=JSON.parse(await readFile('.solved-core/independent-replay-certificate.json','utf8'))}catch{}
// A metadata-only certificate is not a mathematical replay. This gate cannot independently verify solver optimality.
const replayMetadataPresent=Boolean(replay?.status==='PASSED'&&replay?.audit_mode==='INDEPENDENT_SOLVER_REPLAY'&&/^[a-f0-9]{64}$/i.test(replay?.report_sha256||'')&&/^[a-f0-9]{40}$/i.test(replay?.verifier_commit||'')&&replay?.coverage_sha256===sha(raw));
const report={
 schemaVersion:1,mode:'FAIL_CLOSED_CERTIFICATION',generatedAt:new Date().toISOString(),
 catalogCount:catalog.ALL.length,coverageCount:coverage.cards?.length??0,
 unknownCoverageKeys,
 coverageSha256:sha(raw),minUniqueSolvedDecisionsPerFilter:1500,
 filtersWithDeficits:deficits.length,deficits,
 replayMetadataPresent,
 replayEvidencePresent:false, // Only an actual independent solver replay can set this true.
 coverageComplete:catalog.ALL.length===coverage.cards?.length&&unknownCoverageKeys.length===0&&deficits.length===0,
 certified:false
};
report.certified=false; // Fail closed until independently verified solver replay is implemented.
await mkdir('data/solver',{recursive:true});
await writeFile('data/solver/certification-evidence.json',JSON.stringify(report,null,2)+'\n');
const queue=deficits.map(d=>({
 key:d.key,solver:d.solver,verifiedUniqueDecisions:d.validatedSolvedSpots,
 minimumRequired:1500,additionalVerifiedDecisionsNeeded:d.missing,
 status:d.solver==='UNSUPPORTED'?'ENGINE_REQUIRED':'SOLVE_REQUIRED'
})).sort((a,b)=>b.additionalVerifiedDecisionsNeeded-a.additionalVerifiedDecisionsNeeded||a.key.localeCompare(b.key));
await writeFile('data/solver/certification-deficit-queue.json',JSON.stringify({
 schemaVersion:1,sourceCoverageSha256:report.coverageSha256,
 generatedAt:report.generatedAt,totalDeficitFilters:queue.length,
 totalAdditionalDecisionsNeeded:queue.reduce((n,x)=>n+x.additionalVerifiedDecisionsNeeded,0),
 queue
},null,2)+'\n');
console.log(JSON.stringify({catalogCount:report.catalogCount,filtersWithDeficits:report.filtersWithDeficits,replayEvidencePresent:report.replayEvidencePresent,certified:report.certified,coverageSha256:report.coverageSha256}));
if(!report.certified)process.exitCode=2;
