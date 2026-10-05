#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const BANKS = [
  'preflop.json','postflop.json','pushfold-hu-v1.json','tournament.json','reentry.json',
  'opponent-profile.json','multiway-tournament.json','multiway-postflop.json',
  'preflop-decisions.json','preflop-9max.json','preflop-multistack.json','preflop-hu.json',
  'texture-sizing.json','line-bank.json'
];
const contractCode=await readFile('core/stackup-solved-spot-contract.js','utf8');
const sandbox={globalThis:{}}; vm.createContext(sandbox); vm.runInContext(contractCode,sandbox);
const C=sandbox.globalThis.StackUpSolvedSpotContract;
if(!C) throw new Error('solved_spot_contract_unavailable');

const rows=[];
for(const bank of BANKS){
  const payload=JSON.parse(await readFile('data/solver/'+bank,'utf8'));
  const spots=Array.isArray(payload)?payload:(payload.spots??[]);
  const audit=C.auditSpots(spots);
  const solvers=[...new Set(spots.map(x=>x?.solver).filter(Boolean))].sort();
  rows.push({bank,solvers,...audit,eligible:audit.uniqueSolvedSpots>0});
}
const report={
 schemaVersion:1, mode:'STRICT_SOLVED_ONLY', contractVersion:C.VERSION,
 generatedAt:new Date().toISOString(),
 banks:rows,
 totals:rows.reduce((a,r)=>({
   rawEntries:a.rawEntries+r.rawEntries,
   validEntries:a.validEntries+r.validEntries,
   uniqueSolvedSpots:a.uniqueSolvedSpots+r.uniqueSolvedSpots,
   invalidEntries:a.invalidEntries+r.invalidEntries,
   projectedRejected:a.projectedRejected+r.projectedRejected
 }),{rawEntries:0,validEntries:0,uniqueSolvedSpots:0,invalidEntries:0,projectedRejected:0})
};
await writeFile('data/solver/solved-core-migration-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
