#!/usr/bin/env node
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const BANKS=['preflop.json','postflop.json','tournament.json','reentry.json','opponent-profile.json','multiway-tournament.json','multiway-postflop.json','preflop-decisions.json','preflop-9max.json','preflop-multistack.json','preflop-hu.json','texture-sizing.json'];
const code=await readFile('core/stackup-solved-spot-contract.js','utf8'); const sb={globalThis:{}}; vm.createContext(sb); vm.runInContext(code,sb); const C=sb.globalThis.StackUpSolvedSpotContract;
await mkdir('.solved-core',{recursive:true}); const manifests=[];
for(const bank of BANKS){
 const payload=JSON.parse(await readFile('data/solver/'+bank,'utf8')); const spots=Array.isArray(payload)?payload:(payload.spots??[]);
 const audit=C.auditSpots(spots); if(audit.invalidEntries||audit.projectedRejected||audit.uniqueSolvedSpots!==audit.rawEntries) throw new Error('strict_audit_failed:'+bank);
 const raw=Buffer.from(JSON.stringify(payload)); const gz=gzipSync(raw,{level:9}); const sha=createHash('sha256').update(gz).digest('hex');
 const solver=[...new Set(spots.map(x=>x?.solver).filter(Boolean))].sort().join('+')||'UNKNOWN';
 const objectPath='banks/'+solver+'/'+bank.replace(/\.json$/,'')+'/'+sha+'.json.gz';
 const out='.solved-core/'+bank+'.gz'; await writeFile(out,gz);
 manifests.push({schemaVersion:1,bankName:bank,engine:solver,family:'bank',solverVersion:String(payload.version??payload.modelVersion??payload.schemaVersion??'v1'),sha256:sha,decisionCount:audit.uniqueSolvedSpots,objectPath,compression:'gzip',validated:true,contractVersion:C.VERSION});
}
await writeFile('.solved-core/manifests.json',JSON.stringify(manifests,null,2)+'\n');
console.log(JSON.stringify({banks:manifests.length,decisions:manifests.reduce((n,x)=>n+x.decisionCount,0)},null,2));
