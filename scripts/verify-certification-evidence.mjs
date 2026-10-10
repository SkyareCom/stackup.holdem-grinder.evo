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
const byKey=new Map((coverage.cards||[]).map(x=>[x.section+':'+x.id,x]));
const deficits=catalog.ALL.map(x=>{
 const card=byKey.get(x.section+':'+x.id);
 const count=Number(card?.validatedSolvedSpots??0);
 return {key:x.section+':'+x.id,solver:x.source,validatedSolvedSpots:count,missing:Math.max(0,1500-count),eligible:count>=1500&&card?.publishable===true};
}).filter(x=>!x.eligible);
let replay=null;
try{replay=JSON.parse(await readFile('.solved-core/independent-replay-certificate.json','utf8'))}catch{}
// A metadata-only certificate is not a mathematical replay. This gate cannot independently verify solver optimality.
const replayMetadataPresent=Boolean(replay?.status==='PASSED'&&replay?.audit_mode==='INDEPENDENT_SOLVER_REPLAY'&&/^[a-f0-9]{64}$/i.test(replay?.report_sha256||'')&&/^[a-f0-9]{40}$/i.test(replay?.verifier_commit||'')&&replay?.coverage_sha256===sha(raw));
const report={
 schemaVersion:1,mode:'FAIL_CLOSED_CERTIFICATION',generatedAt:new Date().toISOString(),
 catalogCount:catalog.ALL.length,coverageCount:coverage.cards?.length??0,
 coverageSha256:sha(raw),minUniqueSolvedDecisionsPerFilter:1500,
 filtersWithDeficits:deficits.length,deficits,
 replayMetadataPresent,
 replayEvidencePresent:false, // Only an actual independent solver replay can set this true.
 coverageComplete:catalog.ALL.length===coverage.cards?.length&&deficits.length===0,
 certified:false
};
report.certified=false; // Fail closed until independently verified solver replay is implemented.
await mkdir('data/solver',{recursive:true});
await writeFile('data/solver/certification-evidence.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({catalogCount:report.catalogCount,filtersWithDeficits:report.filtersWithDeficits,replayEvidencePresent:report.replayEvidencePresent,certified:report.certified,coverageSha256:report.coverageSha256}));
if(!report.certified)process.exitCode=2;
