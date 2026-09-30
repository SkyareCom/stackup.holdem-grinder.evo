import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const execFileAsync=promisify(execFile);
const ROOT=resolve(process.cwd());
const BIN=process.env.STACKUP_DCFR_BIN||join(ROOT,".stackup","dcfr-solver");
const WORK=join(ROOT,".stackup","solver-bank");
const OUT=join(ROOT,"data","solver");
const PREFLOP_ITERATIONS=Math.max(100_000,Number(process.env.STACKUP_PREFLOP_ITERATIONS||10_000_000));
const POSTFLOP_ITERATIONS=Math.max(50,Number(process.env.STACKUP_POSTFLOP_ITERATIONS||120));
const RANGE_MIN_WEIGHT=Math.max(0,Math.min(0.25,Number(process.env.STACKUP_RANGE_MIN_WEIGHT||0.08)));
const POSITION_ORDER=["SB","BB","UTG","HJ","CO","BTN"];
const TABLE_POSITIONS=["BTN","SB","BB","UTG","UTG+1","UTG+2","MP","LJ","HJ","CO"];
const BOARDS={
  FLOP:["As7d2c","Qh8h3c"],
  TURN:["As7d2cJh","Qh8h3c5d"],
  RIVER:["As7d2cJh4s","Qh8h3c5dTs"]
};
const SHARD_COUNT=Math.max(1,Number(process.env.STACKUP_SHARD_COUNT||1));
const SHARD_INDEX=Math.max(0,Math.min(SHARD_COUNT-1,Number(process.env.STACKUP_SHARD_INDEX||0)));
const BOARDS_PER_STREET=Math.max(1,Number(process.env.STACKUP_BOARDS_PER_STREET||BOARDS.FLOP.length));
const SHARD_OUT=process.env.STACKUP_SHARD_OUT?resolve(process.env.STACKUP_SHARD_OUT):OUT;

await mkdir(WORK,{recursive:true});
await mkdir(OUT,{recursive:true});
await mkdir(SHARD_OUT,{recursive:true});

const blueprint=join(WORK,"preflop_blueprint.bin");
const chartsPath=join(WORK,"preflop_charts.json");
const matchupsPath=join(WORK,"matchups.json");

console.log("Generating DCFR preflop blueprint...");
await execFileAsync(BIN,[
  "preflop",
  "--iterations",String(PREFLOP_ITERATIONS),
  "--output",blueprint,
  "--chart-output",chartsPath,
  "--matchup-output",matchupsPath
],{maxBuffer:16*1024*1024});

const charts=JSON.parse(await readFile(chartsPath,"utf8"));
const matchups=JSON.parse(await readFile(matchupsPath,"utf8"));

function chartPosition(name){
  const m=String(name||"").match(/^(UTG|HJ|CO|BTN|SB)\b/i);
  return m?m[1].toUpperCase():"BTN";
}
function normalizeActionLabel(label){
  const text=String(label||"").trim();
  const compact=text.toLowerCase().replace(/[ _-]+/g,"");
  let kind="unknown";
  if(compact.includes("fold"))kind="fold";
  else if(compact.includes("check"))kind="check";
  else if(compact.includes("call"))kind="call";
  else if(compact.includes("allin")||compact.includes("jam"))kind="jam";
  else if(compact.includes("raise")||compact.includes("bet"))kind="raise";
  const m=text.match(/(\d+(?:\.\d+)?)/);
  return {action:text,kind,to:m?Number(m[1]):null};
}
function rangeString(range){
  return Object.entries(range||{})
    .filter(([,w])=>Number(w)>=RANGE_MIN_WEIGHT)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([hand,w])=>hand+":"+Number(w).toFixed(8).replace(/0+$/,"").replace(/\.$/,""))
    .join(",");
}
function postflopRoles(a,b){
  const ai=POSITION_ORDER.indexOf(a),bi=POSITION_ORDER.indexOf(b);
  if(ai<0||bi<0||ai===bi)return null;
  return ai<bi?{oop:a,ip:b}:{oop:b,ip:a};
}
function displayBoard(raw){
  return String(raw||"").match(/(?:10|[2-9TJQKA])[cdhs]/gi)?.map(c=>{
    const rank=c.slice(0,-1).toUpperCase();
    return rank==="T"?"10"+c.slice(-1).toLowerCase():rank+c.slice(-1).toLowerCase();
  })||[];
}
function matchupContext(matchup,heroPosition){
  const name=String(matchup?.matchup||"");
  const tags=[];
  let potType="SRP";
  if(/open vs .* 3bet/i.test(name)){
    potType="3BET";
    const m=name.match(/^(\S+) open vs (\S+) 3bet/i);
    if(m){
      const opener=m[1].toUpperCase(),bettor=m[2].toUpperCase();
      if(heroPosition===opener)tags.push("call_3bet");
      if(heroPosition===bettor){
        const roles=postflopRoles(opener,bettor);
        tags.push(roles?.ip===bettor?"3bet_ip":"3bet_oop");
      }
    }
  }else if(/4bet vs .* call/i.test(name)){
    potType="4BET";
    tags.push("pot_4bet");
    const m=name.match(/^(\S+) 4bet vs (\S+) call/i);
    if(m&&heroPosition===m[2].toUpperCase())tags.push("call_4bet");
  }
  return {potType,tags};
}
function hashId(value){
  return createHash("sha256").update(value).digest("hex").slice(0,24);
}
function normalizeRaw(raw){
  const nodes=raw?.strategy||raw?.strategies||[];
  const root=Array.isArray(nodes)?(nodes.find(n=>n?.node==="root")||nodes[0]):null;
  if(!root||!Array.isArray(root.combos)||!root.combos.length)throw new Error("DCFR root strategy missing");
  const strategy=root.combos.map(combo=>({
    hand:combo.hand,
    ev:Number(combo.ev??0),
    actions:(combo.actions||[]).map(a=>{
      const n=normalizeActionLabel(a.action);
      const ev=Number(a.ev??a.expectedValue??a.expected_value);
      return {...n,frequency:Number(a.weight??a.frequency??0)*100,ev:Number.isFinite(ev)?ev:null};
    })
  })).filter(h=>h.hand&&h.actions.length);
  if(!strategy.length)throw new Error("DCFR combo strategy missing");
  return {
    strategy,
    convergence:{
      iterations:Number(raw.iterations??POSTFLOP_ITERATIONS),
      exploitabilityPct:raw.exploitability_pct??raw.exploitability??null
    },
    version:raw.version||"dcfr-cli"
  };
}

const preflop=charts.map(chart=>{
  const heroPosition=chartPosition(chart.spot_name);
  const strategy=(chart.hands||[]).map(h=>({
    hand:h.hand,
    actions:(h.actions||[]).map(a=>{
      const n=normalizeActionLabel(a.action);
      const ev=Number(a.ev??a.expectedValue??a.expected_value);
      return {...n,frequency:Number(a.prob||0)*100,ev:Number.isFinite(ev)?ev:null};
    })
  })).filter(h=>h.hand&&h.actions.length);
  const baseId="dcfr-pre-"+chart.spot_name.replace(/\s+/g,"-").toLowerCase();
  return {
    id:baseId,
    solver:"DCFR_SOLVER",
    version:"dcfr-preflop-blueprint",
    solveId:hashId(baseId+"|"+PREFLOP_ITERATIONS),
    convergence:{iterations:PREFLOP_ITERATIONS,artifact:"preflop_blueprint"},
    scenario:{
      gameType:"TOURNAMENT",
      street:"PRE-FLOP",
      tableSize:6,
      heroPosition,
      villainPosition:"BB",
      effectiveStack:100,
      pot:1.5,
      board:[],
      heroRange:"solver-blueprint",
      villainRange:"solver-blueprint",
      actionHistory:[],
      positions:["UTG","HJ","CO","BTN","SB","BB"],
      playerStacks:Object.fromEntries(TABLE_POSITIONS.map(p=>[p,100]))
    },
    strategy
  };
});

const MAX_MATCHUPS=Math.max(1,Math.min(matchups.length,Number(process.env.STACKUP_MAX_MATCHUPS||30)));
const selectedAll=matchups
  .filter(m=>postflopRoles(m.opener?.position,m.caller?.position))
  .slice(0,MAX_MATCHUPS);
const selected=selectedAll.filter((_,index)=>index%SHARD_COUNT===SHARD_INDEX);

console.log("Selected postflop matchups:",selected.length,"of",selectedAll.length,"shard",SHARD_INDEX+"/"+SHARD_COUNT);
console.log(selected.map(m=>m.matchup).join(" | "));

const postflop=[];
for(const matchup of selected){
  const roles=postflopRoles(matchup.opener.position,matchup.caller.position);
  const sideByPos=new Map([
    [matchup.opener.position,matchup.opener],
    [matchup.caller.position,matchup.caller]
  ]);
  const oop=sideByPos.get(roles.oop),ip=sideByPos.get(roles.ip);
  for(const street of ["FLOP","TURN","RIVER"]){
    for(const boardRaw of BOARDS[street].slice(0,BOARDS_PER_STREET)){
      const key=[street,matchup.matchup,boardRaw,POSTFLOP_ITERATIONS].join("|");
      const rawPath=join(WORK,hashId(key)+".json");
      console.log("Solving",key);
      await execFileAsync(BIN,[
        "solve",
        "--street",street.toLowerCase(),
        "--board",boardRaw,
        "--oop-range",rangeString(oop.range),
        "--ip-range",rangeString(ip.range),
        "--pot",String(matchup.pot_chips),
        "--stack",String(matchup.eff_stack_chips),
        "--iterations",String(POSTFLOP_ITERATIONS),
        "--format","json",
        "--output",rawPath,
        // Memory-safe postflop tree for GitHub-hosted bank generation. The live API can use
        // deeper trees; the static bank prioritizes reliability and representative training spots.
        "--bet-sizes","33,75",
        "--raise-sizes","75",
        "--max-raises","1",
        "--allin-threshold","0.67",
        "--allin-pot-ratio","3",
        "--skip-cum-strategy"
      ],{maxBuffer:16*1024*1024});
      const raw=JSON.parse(await readFile(rawPath,"utf8"));
      const normalized=normalizeRaw(raw);
      await rm(rawPath,{force:true}).catch(()=>{});
      const stackBb=Number(matchup.eff_stack_chips)/2;
      const potBb=Number(matchup.pot_chips)/2;
      const id="dcfr-"+street.toLowerCase()+"-"+hashId(key);
      const context=matchupContext(matchup,roles.oop);
      postflop.push({
        id,
        solver:"DCFR_SOLVER",
        version:normalized.version,
        solveId:hashId("solve|"+key),
        convergence:normalized.convergence,
        matchup:matchup.matchup,
        scenario:{
          gameType:"TOURNAMENT",
          street,
          tableSize:6,
          heroPosition:roles.oop,
          villainPosition:roles.ip,
          effectiveStack:stackBb,
          pot:potBb,
          board:displayBoard(boardRaw),
          heroRange:rangeString(oop.range),
          villainRange:rangeString(ip.range),
          actionHistory:[],
          positions:["UTG","HJ","CO","BTN","SB","BB"],
          playerStacks:Object.fromEntries(TABLE_POSITIONS.map(p=>[p,stackBb])),
          potType:context.potType,
          tags:context.tags
        },
        strategy:normalized.strategy
      });
    }
  }
}

const generatedAt=new Date().toISOString();
const manifest={
  schemaVersion:1,
  generatedAt,
  solver:{
    id:"DCFR_SOLVER",
    upstream:"exinori/DCFR-SOLVER",
    license:"MIT"
  },
  shard:{index:SHARD_INDEX,count:SHARD_COUNT,boardsPerStreet:BOARDS_PER_STREET},
  preflop:{
    iterations:PREFLOP_ITERATIONS,
    spots:preflop.length,
    hands:preflop.reduce((n,s)=>n+s.strategy.length,0),
    effectiveStackBb:100
  },
  postflop:{
    iterations:POSTFLOP_ITERATIONS,
    spots:postflop.length,
    matchupCount:selected.length,
    totalMatchups:selectedAll.length,
    matchups:selected.map(m=>m.matchup),
    potTypes:["SRP","3BET","4BET"],
    streets:["FLOP","TURN","RIVER"]
  }
};

if(SHARD_COUNT>1){
  await writeFile(join(SHARD_OUT,"preflop.json"),JSON.stringify(preflop),"utf8");
  await writeFile(join(SHARD_OUT,`postflop-shard-${SHARD_INDEX}.json`),JSON.stringify(postflop),"utf8");
  await writeFile(join(SHARD_OUT,`shard-manifest-${SHARD_INDEX}.json`),JSON.stringify(manifest,null,2)+"\n","utf8");
}else{
  await writeFile(join(OUT,"preflop.json"),JSON.stringify(preflop),"utf8");
  await writeFile(join(OUT,"postflop.json"),JSON.stringify(postflop),"utf8");
  await writeFile(join(OUT,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
}
console.log(JSON.stringify(manifest,null,2));
