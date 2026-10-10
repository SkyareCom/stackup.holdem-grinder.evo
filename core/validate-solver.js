'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PioAdapter,sha256}=require('./solver/pio-adapter.js');
const {ROOT,rejectMock,mathFilters,sourceIdentity,compare,validateFilterJob,validateOutput}=require('./solver/certification-evidence.js');
async function main() {
  // Configuration is checked before catalog/jobs; never fall back to /opt or a mock.
  const adapter=new PioAdapter();
  const args=process.argv.slice(2);
  const option=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
  const jobsPath=path.resolve(option('jobs')||path.join(ROOT,'core/solver/pio-jobs.json'));
  if(!fs.existsSync(jobsPath))throw Error('Entradas reais ausentes: '+jobsPath+'. Não serão inferidos stacks, payouts, ranges ou resultados');
  const manifest=JSON.parse(fs.readFileSync(jobsPath,'utf8'));rejectMock(manifest);
  const identity=sourceIdentity();
  const catalog=mathFilters(),known=new Map(catalog.map(f=>[f.key,f]));
  if(!Array.isArray(manifest.jobs)||!manifest.jobs.length)throw Error('Manifest de jobs vazio');
  for(const j of manifest.jobs)if(!known.has(j.filterKey)||typeof j.spotId!=='string'||!j.spotId.trim())throw Error('Job sem filtro/spotId real válido');
  const section=option('section');
  if(section&&!catalog.some(f=>f.section===section))throw Error('Seção desconhecida: '+section);
  const jobs=manifest.jobs.filter(j=>(args.includes('--full-solve')||known.get(j.filterKey).requires_solver_validation===true)&&(!section||known.get(j.filterKey).section===section));
  if(!jobs.length)throw Error('Nenhum job real para a seção solicitada');
  const ids=jobs.map(j=>j.filterKey+':'+j.spotId);
  if(new Set(ids).size!==ids.length)throw Error('Jobs duplicados');
  const reportDir=path.resolve(option('reports')||path.join(ROOT,'reports'));
  const runDir=path.join(reportDir,'pio-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(runDir,{recursive:true});
  const results=[];
  for(const job of jobs) {
    console.log('[VALIDATING] '+job.filterKey+' / '+job.spotId);
    try {
      validateFilterJob(job);
      const output=await adapter.solve(job);validateOutput(output);const evCheck=compare(job,output);
      const evidence={job,output};const evidenceText=JSON.stringify(evidence,null,2)+'\n';
      const evidenceFile=path.join(runDir,sha256(job.filterKey+':'+job.spotId)+'.json');
      fs.writeFileSync(evidenceFile,evidenceText,{flag:'wx'});
      results.push({key:job.filterKey,spot_id:job.spotId,status:evCheck.pass?'SOLVER_CERTIFIED':'SOLVER_FAIL',
        solver:'piosolver_edge_real',is_mock:false,real_solver:true,solver_hash:output.hash,ev_check:evCheck,input_sha256:output.input_sha256,
        evidence_file:path.relative(reportDir,evidenceFile),evidence_sha256:sha256(evidenceText)});
    } catch(error) {
      results.push({key:job.filterKey,spot_id:job.spotId,status:'SOLVER_BLOCKED',solver:'piosolver_edge_real',is_mock:false,real_solver:false,error:error.message});
    }
    console.log(' -> '+results.at(-1).status);
  }
  const validated=results.filter(r=>r.status==='SOLVER_CERTIFIED').length;
  if(JSON.stringify(sourceIdentity())!==JSON.stringify(identity))throw Error('Código de origem mudou durante o solve; report bloqueado');
  const report={version:3,...identity,generated_at:new Date().toISOString(),solver:'piosolver_edge_real',is_mock:false,
    summary:{total_processed:results.length,solver_validated:validated,blocked_or_failed:results.length-validated,
      final_gto_certification:'NOT_CERTIFIED',scope:section||'MANIFEST_ONLY'},results};
  fs.writeFileSync(path.join(reportDir,'solver-validation-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Validados: '+validated+'/'+results.length+'. Certificação global: NOT_CERTIFIED');
  if(validated!==results.length)process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
