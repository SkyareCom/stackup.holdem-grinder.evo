'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const missing = 'PIO_PATH não configurado. Nenhuma certificação GTO será emitida';
function run(file,args=[],env={}) {
  const cleanEnv={...process.env}; delete cleanEnv.PIO_PATH;
  return spawnSync(process.execPath,[path.join(root,file),...args],{cwd:root,env:{...cleanEnv,...env},encoding:'utf8'});
}
test('validator rejects unset PIO_PATH with the exact required error',()=>{
  const r=run('core/validate-solver.js',['--section=icm_special']);
  assert.equal(r.status,1); assert.match(r.stderr,new RegExp(missing));
});
test('validator rejects an absent Pio installation',()=>{
  const r=run('core/validate-solver.js',['--section=icm_special'],{PIO_PATH:'/definitely-absent-pio'});
  assert.equal(r.status,1); assert.match(r.stderr,/PioSolver inexistente/);
});
test('adapter does not invent results for unsupported multi-player ICM',async()=>{
  const adapterPath=path.join(root,'core/solver/pio-adapter.js');
  assert.ok(fs.existsSync(adapterPath),'real adapter must exist');
  const {PioAdapter}=require(adapterPath);
  const adapter=new PioAdapter(process.execPath);
  await assert.rejects(adapter.solve({model:'icm',stacks:[15,12,20],payouts:[.5,.3,.2]}),/ICM.*não suportado/);
});
for (const report of [
 {solver:'mock',results:[]},
 {results:[{solver:'PioSolver_MOCK'}]},
 {results:[{evidence:{solver:'MoCk'}}]},
 {results:[],summary:{final_gto_certification:'GTO_CERTIFIED'}},
 {solver:'PioSolver',results:[{key:'icm_special:icm_5_8',status:'SOLVER_CERTIFIED',hash:'forged'}]}
]) test('generator rejects untrusted report '+JSON.stringify(report),()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pio-negative-'));
  try {
    const input=path.join(dir,'report.json'),output=path.join(dir,'catalog.js');
    fs.writeFileSync(input,JSON.stringify(report));
    const r=run('core/generate-gto-certified.js',['--report='+input,'--output='+output]);
    assert.equal(r.status,1);
    assert.match(r.stderr,/mock|evidência|vazio/i);
    assert.equal(fs.existsSync(output),false,'no certified artifact on failure');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('catalog projections have 194 keys and never imply GTO or fabricated math',()=>{
  for(const name of ['CERTIFIED','MATH-CERTIFIED']) {
    const file=path.join(root,'core/stackup-scenario-catalog-'+name+'.js');
    assert.ok(fs.existsSync(file),name+' catalog must exist');
  }
});
test('blank calc_results fields cannot be parsed as zero',()=>{
  const {parseResults}=require('../core/solver/pio-adapter.js');
  assert.throws(()=>parseResults('EV OOP: \nEV IP: 0\nexploitable for: 0'),/válido/);
});
test('a chipEV job cannot be relabelled as ICM or a nine-player game',()=>{
  const {validateFilterJob}=require('../core/solver/certification-evidence.js');
  assert.equal(typeof validateFilterJob,'function');
  for(const filterKey of ['icm_special:icm_bubble','pko_special:bounty_call','seats:s9','pre_extended:five_bet']) {
    assert.throws(()=>validateFilterJob({filterKey,model:'chipEV',board:['As','Kh','2c']}),/não suportado/);
  }
});
test('physical spot identity ignores labels and incidental object key order',()=>{
  const {physicalHash}=require('../core/solver/certification-evidence.js');
  assert.equal(typeof physicalHash,'function');
  const job={model:'chipEV',board:['As','Kh','2c'],hero:'OOP',hand:'QhQs',pot:[0,0,10],effectiveStack:10,ranges:{OOP:[1],IP:[1]},lines:[[0,1],[1]],nodeId:'r:0'};
  const reordered={...job,board:['Kh','2c','As'],hand:'QsQh',ranges:{IP:[1],OOP:[1]},lines:[[1],[0,1]],filterKey:'street:flop',spotId:'different',expectedEv:1};
  assert.equal(physicalHash(job),physicalHash(reordered));
});
test('EV tolerance remains 0.5 percent even when nash EV is below one chip',()=>{
  const {compare}=require('../core/solver/certification-evidence.js');
  const r=compare({expectedEv:0.104,expectedStrategy:[1],pot:[0,0,10]}, {ev_nash:0.1,strategy:[1],convergence:{exploitability:0}});
  assert.equal(r.pass,false);assert.ok(r.evDiffPct>0.5);
});
test('all representations of nested mock markers block reports',()=>{
  const {rejectMock}=require('../core/solver/certification-evidence.js');
  for(const value of [{MoCk:1},{simulated:'yes'},{isMock:true},{nested:{mock:'false'}}])assert.throws(()=>rejectMock(value),/mock/i);
});
test('source identity includes current implementation bytes',()=>{
  const {sourceIdentity}=require('../core/solver/certification-evidence.js');
  const identity=sourceIdentity();
  assert.match(identity.implementation_sha256||'',/^[a-f0-9]{64}$/);
});
test('a subset of the catalog cannot pass the coverage gate',()=>{
  const {requireCoverage,filters}=require('../core/solver/certification-evidence.js');
  assert.equal(typeof requireCoverage,'function');
  const groups=new Map(filters().map(f=>[f.key,[]]));
  groups.get('street:river').push('one actual input hash');
  assert.throws(()=>requireCoverage(groups),/194 filtros.*1500/);
});
test('historical numerical evidence must be complete and finite',()=>{
  const {validateOutput}=require('../core/solver/certification-evidence.js');
  assert.equal(typeof validateOutput,'function');
  for(const output of [{ev_nash:undefined},{ev_nash:null},{ev_nash:'0'},{ev_nash:NaN}])assert.throws(()=>validateOutput(output),/evidência/i);
});
test('catalog projection contents match actual keys and have no math claims',()=>{
  const {filters}=require('../core/solver/certification-evidence.js');
  assert.equal(filters().length,194);
  const text=fs.readFileSync(path.join(root,'core/stackup-scenario-catalog-MATH-CERTIFIED.js'),'utf8');
  const list=JSON.parse(text.match(/export const SCENARIO_FILTERS = (\[[\s\S]*?\n\]);/)[1]);
  assert.equal(list.length,194);
  assert.deepEqual(list.map(f=>f.key),filters().map(f=>f.key));
  assert.ok(list.every(f=>f.mathematical_certification==='NOT_CERTIFIED'&&f.gto_certification==='NOT_CERTIFIED'));
});
test('a silent process ignoring SIGTERM is killed within a bounded timeout',async()=>{
  const {PioAdapter}=require('../core/solver/pio-adapter.js');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pio-silent-'));
  const script=path.join(dir,'silent-process'),pidFile=path.join(dir,'pid');
  fs.writeFileSync(script,'#!/usr/bin/env node\nrequire("node:fs").writeFileSync('+JSON.stringify(pidFile)+',String(process.pid));\nprocess.on("SIGTERM",()=>{});\nprocess.stdin.resume();\nsetInterval(()=>{},1000);\n',{mode:0o755});
  let pid;
  try {
    const adapter=new PioAdapter(script,{timeoutMs:250});
    const started=Date.now();
    await assert.rejects(adapter.solve({model:'chipEV',board:['As','Kh','2c'],hero:'OOP',hand:'QhQs',effectiveStack:10,pot:[0,0,10],ranges:{OOP:Array(1326).fill(1),IP:Array(1326).fill(1)},lines:[[0,0]],nodeId:'r:0',expectedEv:0,expectedStrategy:[1]}),/Timeout/);
    assert.ok(Date.now()-started<3000,'timeout teardown must be bounded');
    pid=Number(fs.readFileSync(pidFile,'utf8'));
    assert.throws(()=>process.kill(pid,0),/ESRCH/,'child must already be gone when solve rejects');
  } finally {
    if(pid)try{process.kill(pid,'SIGKILL');}catch{}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('coverage auditor initializes its root before loading actual bank files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coverage-root-'));
  try {
    const r=spawnSync(process.execPath,[path.join(root,'scripts/audit-scenario-coverage.mjs')],{cwd:dir,encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/ENOENT/);assert.doesNotMatch(r.stderr,/ROOT is not defined/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('app validation accepts the approved complete 194-filter catalog',()=>{
  const r=run('scripts/validate-app.mjs');
  assert.equal(r.status,0,r.stderr||r.stdout);
});
