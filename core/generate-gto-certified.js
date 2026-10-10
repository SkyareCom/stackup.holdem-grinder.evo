'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PioAdapter,sha256}=require('./solver/pio-adapter.js');
const {ROOT,rejectMock,filters,sourceIdentity,compare,validateFilterJob,physicalHash,validateOutput,requireCoverage}=require('./solver/certification-evidence.js');
async function main() {
  const args=process.argv.slice(2),option=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
  const reportPath=path.resolve(option('report')||path.join(ROOT,'reports/solver-validation-report.json'));
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));rejectMock(report);
  if(!Array.isArray(report.results)||!report.results.length)throw Error('Report vazio: nenhuma evidência GTO');
  const identity=sourceIdentity();
  if(report.version!==2||report.solver!=='PioSolver'||Object.keys(identity).some(k=>report[k]!==identity[k]))throw Error('Report sem evidência real ou com fonte divergente');
  const catalog=filters(),groups=new Map(catalog.map(f=>[f.key,[]]));
  const inputHashes=new Map(catalog.map(f=>[f.key,new Set()]));const ids=new Set();
  const evidenceList=[];
  for(const result of report.results) {
    if(result.status!=='REAL_SOLVER_VALIDATED'||result.real_solver!==true||result.solver!=='PioSolver'||!result.ev_check?.pass)throw Error('Resultado sem evidência real aprovada');
    if(!groups.has(result.key)||typeof result.spot_id!=='string'||!result.spot_id.trim())throw Error('Filtro/spot inválido');
    const id=result.key+':'+result.spot_id;if(ids.has(id))throw Error('Spots duplicados');ids.add(id);
    if(typeof result.evidence_file!=='string'||path.isAbsolute(result.evidence_file))throw Error('Caminho de evidência inválido');
    const file=path.resolve(path.dirname(reportPath),result.evidence_file);
    if(!file.startsWith(path.dirname(reportPath)+path.sep))throw Error('Evidência fora da pasta do report');
    const text=fs.readFileSync(file,'utf8');if(sha256(text)!==result.evidence_sha256)throw Error('Hash da evidência divergente');
    const evidence=JSON.parse(text);rejectMock(evidence);
    const {job,output}=evidence;
    if(!job||!output||job.filterKey!==result.key||job.spotId!==result.spot_id||output.real_solver!==true||output.solver!=='PioSolver'||sha256(JSON.stringify(job))!==result.input_sha256||output.input_sha256!==result.input_sha256||sha256(JSON.stringify(output.transcript))!==output.transcript_sha256)throw Error('Evidência não corresponde ao spot');
    validateOutput(output);
    if(!compare(job,output).pass)throw Error('Evidência histórica não passa a comparação real');
    validateFilterJob(job);
    if(inputHashes.get(result.key).has(output.input_sha256))throw Error('Entradas de solve duplicadas no filtro');
    // Do not count different labels on the same physical game as unique solves.
    const physicalId=physicalHash(job);
    if(groups.get(result.key).includes(physicalId))throw Error('Mesmo spot físico repetido');
    groups.get(result.key).push(physicalId);inputHashes.get(result.key).add(output.input_sha256);evidenceList.push(evidence);
  }
  requireCoverage(groups);
  // Hashes alone cannot prove authenticity. Re-execute Pio before issuing a certificate.
  const adapter=new PioAdapter();
  for(const {job,output}of evidenceList) {
    const fresh=await adapter.solve(job);
    validateOutput(fresh);
    if(fresh.executable_sha256!==output.executable_sha256||!compare(job,fresh).pass||Math.abs(fresh.ev_nash-output.ev_nash)>Math.max(1,Math.abs(output.ev_nash))*0.005)throw Error('Reexecução Pio divergiu da evidência');
  }
  if(JSON.stringify(sourceIdentity())!==JSON.stringify(identity))throw Error('Código de origem mudou durante a reexecução; emissão bloqueada');
  const outputPath=path.resolve(option('output')||path.join(ROOT,'core/stackup-scenario-catalog-GTO-CERTIFIED.js'));
  const entries=catalog.map(f=>({...f,gto_certification:'GTO_CERTIFIED',validated_unique_spots:groups.get(f.key).length}));
  const content='// Re-executed with real PioSolver; scope is the supplied explicit game trees.\nexport const GTO_SOURCE = '+JSON.stringify(identity)+';\nexport const SCENARIO_FILTERS = '+JSON.stringify(entries,null,2)+';\n';
  fs.writeFileSync(outputPath,content,{flag:'wx'});
  console.log('GTO_CERTIFIED: 194 filtros com pelo menos 1500 solves reais únicos cada');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
