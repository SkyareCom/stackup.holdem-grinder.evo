#!/usr/bin/env node
// Independent card/deck consistency audit. This is NOT a solver-optimality certificate.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
const R='23456789TJQKA',S='cdhs';
const card=c=>{const v=String(c||'').toUpperCase().replace(/10/g,'T');return /^[2-9TJQKA][CDHS]$/.test(v)?v:null};
const cardsFromHand=h=>{
 const s=String(h||'').toUpperCase().replace(/10/g,'T');
 const m=s.match(/^([2-9TJQKA][CDHS])([2-9TJQKA][CDHS])$/);
 return m?[m[1],m[2]]:null;
};
const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
const failures=[],stats={banks:0,spots:0,decisions:0,exactHandDecisions:0,classHandDecisions:0};
const reject=(bank,id,reason)=>{if(failures.length<100)failures.push({bank,id,reason});};
for(const m of manifests){
 stats.banks++;
 const gz=await readFile('.solved-core/'+m.bankName+'.gz');
 if(hash(gz)!==m.sha256)throw Error('bank_sha_mismatch:'+m.bankName);
 const payload=JSON.parse(gunzipSync(gz));
 const spots=Array.isArray(payload)?payload:payload.spots||[];
 for(const spot of spots){
  stats.spots++;
  const id=String(spot.solveId||spot.id||'');
  const scenario=spot.scenario||{};
  const board=Array.isArray(scenario.board)?scenario.board.map(card):[];
  const expected={'PRE-FLOP':0,FLOP:3,TURN:4,RIVER:5}[String(scenario.street||'').toUpperCase()];
  if(expected===undefined||board.length!==expected||board.some(x=>!x)||new Set(board).size!==board.length)reject(m.bankName,id,'invalid_board');
  for(const e of spot.strategy||[]){
   stats.decisions++;
   const hand=cardsFromHand(e.hand);
   if(hand){
    stats.exactHandDecisions++;
    if(hand[0]===hand[1])reject(m.bankName,id,'duplicate_hole_card');
    if(hand.some(c=>board.includes(c)))reject(m.bankName,id,'hole_board_collision');
   }else{
    stats.classHandDecisions++;
    const h=String(e.hand||'').toUpperCase().replace(/10/g,'T');
    if(!/^([2-9TJQKA])([2-9TJQKA])([SO])?$/.test(h))reject(m.bankName,id,'invalid_hand_class');
    if(expected!==0)reject(m.bankName,id,'nonexact_postflop_hand');
   }
   const actions=e.actions||[];
   if(!Array.isArray(actions)||!actions.length)reject(m.bankName,id,'actions_missing');
   const sum=actions.reduce((n,a)=>n+Number(a.frequency),0);
   if(!Number.isFinite(sum)||Math.abs(sum-100)>1.25)reject(m.bankName,id,'frequency_sum_invalid');
  }
 }
}
const report={schemaVersion:1,auditMode:'INDEPENDENT_DECK_AND_STRATEGY_INTEGRITY',mathematicalSolverReplay:false,passed:failures.length===0,stats,failures};
await mkdir('.solved-core',{recursive:true});
await writeFile('.solved-core/card-integrity-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!report.passed)process.exitCode=2;
