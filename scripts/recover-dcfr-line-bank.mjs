#!/usr/bin/env node
// Reconstruct DCFR line-bank evidence from the 20 original JSON shards.
// This tool does not certify solver optimality or publish data.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const source=process.argv[2]||'.stackup/line-in';
const destination=process.argv[3]||'.stackup';
const files=(await readdir(source)).filter(x=>/^line-[a-t]\.json$/.test(x)).sort();
if(files.length!==20)throw Error('expected_20_shards:'+files.length);
const ids=new Set(),runouts=[],spots=[],failures=[],shardHashes=[];
let upstream,iterations=Infinity,baseMatchups;
for(const file of files){
 const raw=await readFile(join(source,file));
 const d=JSON.parse(raw);
 const runout=file.match(/^line-([a-t])\.json$/)[1];
 if(runouts.includes(runout))throw Error('duplicate_runout:'+runout);
 runouts.push(runout);
 if(!upstream){upstream=d.upstream;baseMatchups=d.baseMatchups;}
 if(JSON.stringify(d.upstream)!==JSON.stringify(upstream))throw Error('upstream_drift:'+file);
 const n=Number(d.iterations);
 if(!Number.isFinite(n)||n<=0)throw Error('invalid_iterations:'+file);
 iterations=Math.min(iterations,n);
 for(const spot of d.spots||[]){
  if(!spot.id||ids.has(spot.id))throw Error('duplicate_or_missing_spot_id:'+spot.id);
  ids.add(spot.id);spots.push(spot);
 }
 failures.push(...(d.failures||[]));
 shardHashes.push({file,sha256:createHash('sha256').update(raw).digest('hex'),spots:(d.spots||[]).length});
}
if(runouts.join('')!=='abcdefghijklmnopqrst')throw Error('missing_runout');
if(upstream?.commit!=='4ade6a9e15a841c41867afde1258b9d110cd6fb1')throw Error('unexpected_upstream_commit');
if(!spots.length)throw Error('empty_aggregate');
const bank={schemaVersion:1,solver:'DCFR_SOLVER',upstream,iterations,baseMatchups,runouts,spots,failures};
const raw=Buffer.from(JSON.stringify(bank));
const provenance={schemaVersion:1,sourceRunId:process.env.SOURCE_RUN_ID||null,upstreamCommit:upstream.commit,sha256:createHash('sha256').update(raw).digest('hex'),shardHashes,spots:spots.length,decisions:spots.reduce((n,s)=>n+(s.strategy||[]).length,0),failures:failures.length,certification:'NOT_CERTIFIED'};
await mkdir(destination,{recursive:true});
await writeFile(join(destination,'recovered-line-bank.json'),raw);
await writeFile(join(destination,'recovered-line-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({status:'RECOVERED_NOT_CERTIFIED',...provenance,shardHashes:undefined},null,2));
