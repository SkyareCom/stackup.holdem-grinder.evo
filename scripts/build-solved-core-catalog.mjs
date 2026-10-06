#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const manifests=JSON.parse(await readFile('.solved-core/manifests.json','utf8'));
const code=await readFile('core/stackup-solved-spot-contract.js','utf8');
const sb={globalThis:{}}; vm.createContext(sb); vm.runInContext(code,sb);
const C=sb.globalThis.StackUpSolvedSpotContract;
const sha256=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const normGame=v=>String(v||'').trim().toUpperCase();
const normStreet=v=>C.normStreet(v);
const rows=[];
const seenIds=new Set();
const seenDecisions=new Map();

for(const m of manifests){
  const payload=JSON.parse(await readFile('data/solver/'+m.bankName,'utf8'));
  const spots=Array.isArray(payload)?payload:(payload.spots??[]);
  for(const spot of spots){
    for(const entry of Array.isArray(spot?.strategy)?spot.strategy:[]){
      const v=C.validateSolvedDecision(spot,entry);
      if(!v.ok)throw new Error('invalid_decision:'+m.bankName+':'+(spot?.solveId||spot?.id||'unknown')+':'+v.errors.join(','));
      if(seenIds.has(v.id))throw new Error('duplicate_solve_id:'+v.id);
      seenIds.add(v.id);
      const scenario=spot.scenario||{};
      const scenarioHash=sha256(JSON.stringify(C.stable({
        contractVersion:C.VERSION,
        scenarioFingerprint:v.scenarioFingerprint
      })));
      // Canonical uniqueness is the concrete scenario + hand, never an arbitrary solve id.
      const handKey=String(entry.hand||'').trim();
      const decisionHash=sha256(JSON.stringify(C.stable({
        contractVersion:C.VERSION,
        scenarioHash,
        hand:handKey
      })));
      const prior=seenDecisions.get(decisionHash);
      if(prior)throw new Error('duplicate_scenario_hand:'+decisionHash+':'+prior+':'+v.id);
      seenDecisions.set(decisionHash,v.id);
      rows.push({
        solve_id:v.id,
        bank_name:m.bankName,
        manifest_sha256:m.sha256,
        engine:m.engine,
        family:m.family,
        game_type:normGame(scenario.gameType),
        street:normStreet(scenario.street),
        hero_position:scenario.heroPosition??null,
        effective_stack:Number.isFinite(Number(scenario.effectiveStack))?Number(scenario.effectiveStack):null,
        hand_key:handKey,
        solver_ref:String(spot.solveId||spot.id||'').trim(),
        object_path:m.objectPath,
        scenario_hash:scenarioHash,
        decision_hash:decisionHash,
        audit_status:'PENDING',
        published:false,
        provenance:{contract_version:C.VERSION,source_bank:m.bankName,source_solver:spot.solver,scenario_fingerprint:v.scenarioFingerprint}
      });
    }
  }
}
await writeFile('.solved-core/catalog.json',JSON.stringify(rows)+'\n');
console.log(JSON.stringify({catalogRows:rows.length,uniqueSolveIds:seenIds.size,uniqueScenarioHands:seenDecisions.size,banks:manifests.length},null,2));
