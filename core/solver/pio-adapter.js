'use strict';
// Real Pio UPI only. No fallback solver, inferred ranges, or fabricated results.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const MISSING_PIO = 'PIO_PATH não configurado. Nenhuma certificação GTO será emitida';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function executable(pioPath) {
  if(typeof pioPath!=='string'||!pioPath.trim()) throw Error(MISSING_PIO);
  let file=path.resolve(pioPath);
  if(!fs.existsSync(file)) throw Error('PioSolver inexistente: '+file+'. Nenhuma certificação GTO será emitida');
  if(fs.statSync(file).isDirectory()) {
    const names=fs.readdirSync(file).filter(n=>/^PioSOLVER.*(?:\.exe)?$/i.test(n)&&fs.statSync(path.join(file,n)).isFile());
    if(names.length!==1) throw Error('PIO_PATH deve apontar para um único executável PioSolver (não PioViewer)');
    file=path.join(file,names[0]);
  }
  fs.accessSync(file,process.platform==='win32'?fs.constants.R_OK:fs.constants.X_OK);
  return fs.realpathSync(file);
}
function assertFinite(value,name,min=-Infinity,max=Infinity) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) throw Error(name+' inválido');
}
function validateJob(job) {
  if(!job||typeof job!=='object') throw Error('Job Pio ausente');
  if(job.model!=='chipEV'||job.stacks?.length>2||job.payouts||job.bounty) {
    throw Error('ICM/PKO/multiway não suportado por este adaptador heads-up chipEV. É necessário um modelo real compatível; nenhuma certificação será emitida');
  }
  if(!Array.isArray(job.board)||![3,4,5].includes(job.board.length)||job.board.some(c=>typeof c!=='string'||!/^[2-9TJQKA][cdhs]$/.test(c))||new Set(job.board).size!==job.board.length) throw Error('Board pós-flop explícito inválido');
  if(!['OOP','IP'].includes(job.hero)) throw Error('Hero deve ser OOP ou IP');
  if(typeof job.hand!=='string'||!/^([2-9TJQKA][cdhs]){2}$/.test(job.hand)) throw Error('Combo hero inválido');
  const hand=job.hand.match(/.{2}/g);
  if(hand[0]===hand[1]||hand.some(c=>job.board.includes(c))) throw Error('Combo hero colide com board');
  assertFinite(job.effectiveStack,'effectiveStack',1); if(!Number.isSafeInteger(job.effectiveStack)) throw Error('effectiveStack deve ser inteiro');
  if(!Array.isArray(job.pot)||job.pot.length!==3||job.pot.some(v=>!Number.isSafeInteger(v)||v<0)||job.pot.reduce((a,b)=>a+b,0)<=0) throw Error('Pot deve ser [OOP, IP, dead] em chips inteiros');
  for(const player of ['OOP','IP']) {
    const range=job.ranges?.[player];
    if(!Array.isArray(range)||range.length!==1326||range.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||!range.some(v=>v>0)) throw Error('Range real '+player+' deve conter 1326 pesos [0,1] na ordem show_hand_order');
  }
  if(!Array.isArray(job.lines)||job.lines.length===0||job.lines.some(line=>!Array.isArray(line)||!line.length||line.some(v=>!Number.isSafeInteger(v)||v<0||v>job.effectiveStack))) throw Error('Linhas de apostas explícitas inválidas');
  if(typeof job.nodeId!=='string'||!/^r(?::(?:0|c|b\d+|[2-9TJQKA][cdhs]))+$/.test(job.nodeId)) throw Error('nodeId de decisão inválido');
  assertFinite(job.expectedEv,'expectedEv');
  if(!Array.isArray(job.expectedStrategy)||!job.expectedStrategy.length||job.expectedStrategy.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(job.expectedStrategy.reduce((a,b)=>a+b,0)-1)>1e-6) throw Error('Estratégia do motor a comparar ausente/inválida');
}
function numericRows(response,count) {
  const rows=response.trim().split(/\r?\n/).filter(Boolean).map(line=>line.trim().split(/\s+/).map(Number));
  if(rows.length!==count||rows.some(r=>r.length!==1326||r.some(v=>!Number.isFinite(v)))) throw Error('Resposta numérica UPI inválida');
  return rows;
}
function parseResults(response) {
  const read=label=>{
    const line=response.split(/\r?\n/).find(l=>l.toLowerCase().startsWith(label.toLowerCase()+':'));
    const raw=line?line.slice(line.indexOf(':')+1).trim():'';
    const number=raw?Number(raw):NaN;
    if(!Number.isFinite(number)) throw Error('calc_results sem '+label+' válido');
    return number;
  };
  const result={ev_oop:read('EV OOP'),ev_ip:read('EV IP'),exploitability:read('exploitable for')};
  if(result.exploitability<0) throw Error('Exploitability negativo');
  return result;
}

class UpiSession {
  constructor(file,timeoutMs) {
    this.marker='STACKUP_END_'+crypto.randomBytes(12).toString('hex');
    this.timeoutMs=timeoutMs; this.transcript=[]; this.pending=null; this.lines=[]; this.update=false; this.failure=null; this.banner=false;
    this.child=spawn(file,[],{cwd:path.dirname(file),shell:false,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const fail=error=>{
      this.failure=error;
      if(this.pending) {clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
    };
    this.child.on('error',error=>fail(Error('Falha ao iniciar PioSolver: '+error.message)));
    this.child.on('exit',(code,signal)=>fail(Error('PioSolver encerrou antes da resposta: '+(signal||code))));
    this.child.stdin.on('error',error=>fail(Error('Entrada PioSolver: '+error.message)));
    this.child.stderr.on('data',()=>fail(Error('PioSolver escreveu em stderr; solve bloqueado')));
    this.reader=readline.createInterface({input:this.child.stdout});
    this.reader.on('line',line=>{
      if(/PioSOLVER/i.test(line)) this.banner=true;
      if(/activation key|license.*(?:invalid|error)|ERROR(?:\s|:)/i.test(line)) {fail(Error('PioSolver: erro UPI/licença; nenhuma certificação será emitida'));return;}
      if(/^SOLVER:/.test(line)) {this.update=line.trim()==='SOLVER:';return;}
      if(this.update) {if(line===this.marker)this.update=false;return;}
      if(line===this.marker) {
        if(!this.pending)return;
        const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
        let response=this.lines.join('\n');this.lines=[];
        if(pending.command.startsWith('set_end_string')) {
          response=response.split('\n').filter(l=>/^set_end_string\s+ok!$/i.test(l.trim())).join('\n');
        }
        this.transcript.push({command:pending.command,response});pending.resolve(response);
      } else if(this.pending) {
        this.lines.push(line);
        if(this.lines.length>20000) fail(Error('Resposta PioSolver excedeu o limite'));
      }
    });
  }
  command(command) {
    if(this.failure)return Promise.reject(this.failure);
    if(this.pending)return Promise.reject(Error('Comandos UPI devem ser sequenciais'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;this.close();reject(Error('Timeout PioSolver; nenhuma certificação será emitida'));},this.timeoutMs);
      this.pending={command,resolve,reject,timer};this.lines=[];this.child.stdin.write(command+'\n');
    });
  }
  async ok(command) {
    const response=await this.command(command);
    if(response.trim().toLowerCase()!==command.split(' ')[0].toLowerCase()+' ok!') throw Error('PioSolver não confirmou '+command.split(' ')[0]);
  }
  close() {
    if(this.closing)return this.closing;
    this.closing=new Promise(resolve=>{
      if(this.child.exitCode!==null||this.child.signalCode!==null){resolve();return;}
      const timer=setTimeout(()=>this.child.kill('SIGKILL'),1000);
      this.child.once('close',()=>{clearTimeout(timer);resolve();});
    });
    this.reader.close();this.child.stdin.destroy();this.child.stdout.destroy();this.child.stderr.destroy();
    this.child.kill();
    return this.closing;
  }
}

class PioAdapter {
  constructor(pioPath=process.env.PIO_PATH,{timeoutMs=120000,steps=5000}={}) {
    this.path=executable(pioPath);
    assertFinite(timeoutMs,'timeoutMs',1);assertFinite(steps,'steps',1);
    if(!Number.isSafeInteger(steps))throw Error('steps deve ser inteiro');
    this.timeoutMs=timeoutMs;this.steps=steps;
  }
  async calcICM() {throw Error('ICM multiway não suportado: calcular equidade matemática isolada não certifica uma estratégia GTO');}
  async solve(job) {
    validateJob(job);
    const binaryHash=sha256(fs.readFileSync(this.path));
    const session=new UpiSession(this.path,this.timeoutMs);
    try {
      await session.ok('set_end_string '+session.marker);
      await session.ok('is_ready');
      const version=(await session.command('show_version')).trim();
      if(!session.banner||!version||/mock|simulat|fake/i.test(version))throw Error('Processo não identificou PioSolver real');
      const handOrder=(await session.command('show_hand_order')).trim().split(/\s+/);
      if(handOrder.length!==1326||new Set(handOrder).size!==1326||handOrder.some(h=>!/^([2-9TJQKA][cdhs]){2}$/.test(h)))throw Error('Ordem de combos inválida');
      const comboIndex=handOrder.findIndex(h=>h===job.hand||h===job.hand.slice(2)+job.hand.slice(0,2));
      if(comboIndex<0||job.ranges[job.hero][comboIndex]<=0)throw Error('Combo hero fora do range');
      await session.ok('set_board '+job.board.join(''));
      for(const p of ['OOP','IP'])await session.ok('set_range '+p+' '+job.ranges[p].join(' '));
      await session.ok('set_eff_stack '+job.effectiveStack);
      await session.ok('set_pot '+job.pot.join(' '));
      await session.ok('clear_lines');
      for(const line of job.lines)await session.ok('add_line '+line.join(' '));
      await session.ok('build_tree');
      await session.ok('set_accuracy 0.0001 fraction');
      await session.ok('go '+this.steps+' steps');
      await session.ok('wait_for_solver');
      const convergence=parseResults(await session.command('calc_results'));
      const node=await session.command('show_node '+job.nodeId);
      const nodeLines=node.trim().split(/\r?\n/);
      if(nodeLines[0]!==job.nodeId||nodeLines[1]!==job.hero+'_DEC'||/INCOMPLETE_TREE|LOCKED/i.test(node))throw Error('Nó incompleto ou jogador incompatível');
      const nodeBoard=nodeLines[2].replace(/\s/g,'');
      if(nodeBoard!==job.board.join(''))throw Error('Board do nó difere do spot; informe um job a partir desta street');
      const ev=numericRows(await session.command('calc_ev '+job.hero+' '+job.nodeId),2);
      const strategyText=await session.command('show_strategy '+job.nodeId);
      const strategyRows=numericRows(strategyText,strategyText.trim().split(/\r?\n/).length);
      const strategy=strategyRows.map(row=>row[comboIndex]);
      if(ev[1][comboIndex]<=0||strategy.some(v=>v<0||v>1)||Math.abs(strategy.reduce((a,b)=>a+b,0)-1)>1e-5)throw Error('Combo sem matchups/estratégia válida');
      const eqText=await session.command('calc_eq_node '+job.hero+' '+job.nodeId);
      const eqLines=eqText.trim().split(/\r?\n/);
      if(eqLines.length!==3||!Number.isFinite(Number(eqLines[2])))throw Error('Resposta equity UPI inválida');
      const eq=numericRows(eqLines.slice(0,2).join('\n'),2)[0][comboIndex];
      assertFinite(eq,'equity',0,1);
      if(sha256(fs.readFileSync(this.path))!==binaryHash)throw Error('Executável mudou durante o solve');
      const inputHash=sha256(JSON.stringify(job));
      return {solver:'PioSolver',solver_version:version,real_solver:true,model:'chipEV',
        ev_nash:ev[0][comboIndex],equity:eq,strategy,convergence,
        input_sha256:inputHash,executable_sha256:binaryHash,
        transcript:session.transcript,transcript_sha256:sha256(JSON.stringify(session.transcript)),
        hash:sha256(inputHash+JSON.stringify(session.transcript))};
    } finally {await session.close();}
  }
}
module.exports={PioAdapter,MISSING_PIO,sha256,validateJob,parseResults,numericRows};
