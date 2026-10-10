'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {sha256}=require('./pio-adapter.js');
const ROOT=path.resolve(__dirname,'../..');
function rejectMock(value) {
  if(typeof value==='string'&&/mock|simulated|synthetic|placeholder/i.test(value))throw Error('Report contém mock/dados simulados. Nenhuma certificação GTO será emitida');
  if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){
    if(/^(?:is[_-]?)?(mock|simulated|synthetic)(?:[_-]?solver)?$/i.test(key))throw Error('Report contém mock/simulated marker');
    rejectMock(item);
  }
}
function filters() {
  const source=fs.readFileSync(path.join(ROOT,'core/stackup-scenario-catalog-CERTIFIED.js'),'utf8');
  const match=source.match(/export const SCENARIO_FILTERS = (\[[\s\S]*?\n\]);/);
  if(!match)throw Error('Catálogo estrutural inválido');
  const list=JSON.parse(match[1]);
  if(list.length!==194||new Set(list.map(f=>f.key)).size!==194||new Set(list.map(f=>f.section)).size!==26)throw Error('Catálogo deve ter 194 filtros únicos em 26 seções');
  return list;
}
function sourceIdentity() {
  const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
  const files=['core/solver/pio-adapter.js','core/solver/certification-evidence.js','core/validate-solver.js','core/generate-gto-certified.js',
    'core/stackup-scenario-catalog.js','core/stackup-solved-spot-contract.js','core/stackup-solved-spot-classifier.js'];
  const implementation=files.map(file=>({file,sha256:sha256(fs.readFileSync(path.join(ROOT,file)))}));
  return {source_commit:git(['rev-parse','HEAD']),source_catalog_blob:git(['hash-object','core/stackup-scenario-catalog.js']),
    implementation_sha256:sha256(JSON.stringify(implementation)),
    structural_catalog_sha256:sha256(fs.readFileSync(path.join(ROOT,'core/stackup-scenario-catalog-CERTIFIED.js')))};
}
function validateOutput(output) {
  const invalid=()=>{throw Error('Evidência numérica/protocolo incompleta ou inválida');};
  if(!output||output.solver!=='PioSolver'||output.real_solver!==true||output.model!=='chipEV'||
    typeof output.solver_version!=='string'||!output.solver_version.trim()||typeof output.ev_nash!=='number'||!Number.isFinite(output.ev_nash)||
    typeof output.equity!=='number'||!Number.isFinite(output.equity)||output.equity<0||output.equity>1)invalid();
  if(!Array.isArray(output.strategy)||!output.strategy.length||output.strategy.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(output.strategy.reduce((a,b)=>a+b,0)-1)>1e-5)invalid();
  for(const key of ['ev_oop','ev_ip','exploitability'])if(typeof output.convergence?.[key]!=='number'||!Number.isFinite(output.convergence[key]))invalid();
  if(output.convergence.exploitability<0)invalid();
  for(const key of ['input_sha256','executable_sha256','transcript_sha256','hash'])if(typeof output[key]!=='string'||!/^[a-f0-9]{64}$/.test(output[key]))invalid();
  if(!Array.isArray(output.transcript)||!output.transcript.length||output.transcript.some(t=>typeof t.command!=='string'||typeof t.response!=='string'||!t.command||!t.response))invalid();
  if(sha256(JSON.stringify(output.transcript))!==output.transcript_sha256||sha256(output.input_sha256+JSON.stringify(output.transcript))!==output.hash)invalid();
}
function requireCoverage(groups) {
  if(groups.size!==194||[...groups.values()].some(spots=>spots.length<1500))throw Error('Evidência insuficiente: todos os 194 filtros exigem pelo menos 1500 solves reais únicos');
}
function validateFilterJob(job) {
  const streets={'street:flop':3,'street:turn':4,'street:river':5};
  if(job.model!=='chipEV'||!['mode:cash','seats:s2',...Object.keys(streets)].includes(job.filterKey)) {
    throw Error('Filtro não suportado pelo adaptador heads-up postflop chipEV: '+job.filterKey);
  }
  if(streets[job.filterKey]&&job.board?.length!==streets[job.filterKey])throw Error('Street do filtro difere do board real');
}
function physicalHash(job) {
  const normalized={model:job.model,board:[...job.board.slice(0,3)].sort().concat(job.board.slice(3)),hero:job.hero,
    hand:job.hand.match(/.{2}/g).sort().join(''),pot:job.pot,effectiveStack:job.effectiveStack,
    ranges:{OOP:job.ranges.OOP,IP:job.ranges.IP},lines:job.lines.map(line=>JSON.stringify(line)).sort(),nodeId:job.nodeId};
  return sha256(JSON.stringify(normalized));
}
function compare(job,output) {
  const evDiff=Math.abs(job.expectedEv-output.ev_nash);
  const evDiffPct=output.ev_nash===0?(evDiff===0?0:Infinity):100*evDiff/Math.abs(output.ev_nash);
  const sameActions=job.expectedStrategy.length===output.strategy.length;
  const strategyDiff=sameActions?Math.max(...job.expectedStrategy.map((v,i)=>Math.abs(v-output.strategy[i]))):null;
  const exploitabilityPct=100*output.convergence.exploitability/job.pot.reduce((a,b)=>a+b,0);
  return {evDiff,evDiffPct,strategyDiff,exploitabilityPct,
    pass:sameActions&&evDiffPct<=0.5&&strategyDiff<=0.005&&exploitabilityPct<=0.5};
}
module.exports={ROOT,rejectMock,filters,sourceIdentity,compare,validateFilterJob,physicalHash,validateOutput,requireCoverage};
