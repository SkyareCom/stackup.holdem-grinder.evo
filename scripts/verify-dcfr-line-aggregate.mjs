#!/usr/bin/env node
// Fail-closed validation of a generated DCFR aggregate and its provenance.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bankPath=process.argv[2]||'data/solver/line-bank.json';
const provenancePath=process.argv[3]||'line-bank-provenance.json';
const bytes=readFileSync(bankPath);
const bank=JSON.parse(bytes);
const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));
const sha=createHash('sha256').update(bytes).digest('hex');
function requireValid(ok,why){if(!ok)throw new Error('dcfr_aggregate_invalid:'+why);}
requireValid(provenance.sha256===sha,'sha256_mismatch');
requireValid(provenance.certification==='NOT_CERTIFIED','unsupported_certification_claim');
requireValid(bank.upstream?.commit==='4ade6a9e15a841c41867afde1258b9d110cd6fb1','upstream_commit');
requireValid(provenance.upstreamCommit===bank.upstream.commit,'provenance_upstream');
requireValid(Array.isArray(bank.runouts)&&bank.runouts.length===20,'runout_count');
requireValid(new Set(bank.runouts).size===20,'duplicate_runouts');
requireValid([...new Set(bank.runouts)].sort().join('')==='abcdefghijklmnopqrst','runout_ids');
requireValid(Array.isArray(bank.spots)&&bank.spots.length>0,'empty_spots');
requireValid(provenance.spots===bank.spots.length,'spot_count');
requireValid(Number.isFinite(Number(bank.iterations))&&Number(bank.iterations)>0,'iterations');
requireValid(Number(provenance.iterations)===Number(bank.iterations),'provenance_iterations');
const ids=new Set();
let decisions=0;
for(const spot of bank.spots){
 requireValid(typeof spot.id==='string'&&spot.id.length>0,'spot_id');
 requireValid(!ids.has(spot.id),'duplicate_spot_id:'+spot.id);
 ids.add(spot.id);
 requireValid(spot.solver==='DCFR_SOLVER','solver:'+spot.id);
 requireValid(Array.isArray(spot.strategy)&&spot.strategy.length>0,'empty_strategy:'+spot.id);
 decisions+=spot.strategy.length;
}
console.log(JSON.stringify({status:'AGGREGATE_INTEGRITY_VALID',certification:'NOT_CERTIFIED',sha256:sha,spots:bank.spots.length,decisions,runouts:bank.runouts.length,upstreamCommit:bank.upstream.commit},null,2));
