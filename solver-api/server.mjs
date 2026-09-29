import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PORT=Number(process.env.PORT||3000);
const SOLVER_BIN=process.env.STACKUP_DCFR_BIN||"/usr/local/bin/dcfr-solver";
const CHARTS_PATH=process.env.STACKUP_PREFLOP_CHARTS||"/opt/stackup/preflop_charts.json";
const MATCHUPS_PATH=process.env.STACKUP_PREFLOP_MATCHUPS||"/opt/stackup/matchups.json";
const POSTFLOP_ITERATIONS=Math.max(50,Number(process.env.STACKUP_POSTFLOP_ITERATIONS||120));
const RANGE_MIN_WEIGHT=Math.max(0,Math.min(0.25,Number(process.env.STACKUP_RANGE_MIN_WEIGHT||0.02)));
const ALLOWED_ORIGINS=new Set(
  String(process.env.CORS_ORIGINS||"https://skyarecom.github.io,http://localhost:3000,http://127.0.0.1:5500")
    .split(",").map(v=>v.trim()).filter(Boolean)
);

const POSITION_ORDER=["SB","BB","UTG","HJ","CO","BTN"];
const TABLE_POSITIONS=["BTN","SB","BB","UTG","UTG+1","UTG+2","MP","LJ","HJ","CO"];
const BOARDS={
  FLOP:["As7d2c","Kd9h4s","Qh8h3c","JcTd5s","9s8d6c","AcKc7h","Ts6s2d","8h8c3d"],
  TURN:["As7d2cJh","Kd9h4s2c","Qh8h3c5d","JcTd5s9h","9s8d6c2h","AcKc7h4d","Ts6s2dQc","8h8c3dKs"],
  RIVER:["As7d2cJh4s","Kd9h4s2c8d","Qh8h3c5dTs","JcTd5s9h2d","9s8d6c2hAc","AcKc7h4d3s","Ts6s2dQc9h","8h8c3dKs5c"]
};

let charts=[];
let matchups=[];
let counter=0;
const solveCache=new Map();
let solveQueue=Promise.resolve();

function json(res,status,payload,origin){
  const headers={
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer"
  };
  if(origin&&isOriginAllowed(origin)){
    headers["access-control-allow-origin"]=origin;
    headers["vary"]="Origin";
  }
  res.writeHead(status,headers);
  res.end(JSON.stringify(payload));
}

function isOriginAllowed(origin){
  if(!origin)return true;
  if(ALLOWED_ORIGINS.has("*")||ALLOWED_ORIGINS.has(origin))return true;
  try{
    const u=new URL(origin);
    return u.hostname==="skyarecom.github.io";
  }catch{return false;}
}

async function bodyJson(req){
  let raw="";
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>64_000)throw new Error("payload_too_large");
  }
  if(!raw)return {};
  return JSON.parse(raw);
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function pick(arr,index=counter){return arr[((index%arr.length)+arr.length)%arr.length];}
function cleanStreet(value){
  const s=String(value||"").trim().toUpperCase().replace("PREFLOP","PRE-FLOP");
  return ["PRE-FLOP","FLOP","TURN","RIVER"].includes(s)?s:null;
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
function chartPosition(name){
  const m=String(name||"").match(/^(UTG|HJ|CO|BTN|SB)\b/i);
  return m?m[1].toUpperCase():"BTN";
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
function chooseStrategyHand(strategy,index=counter){
  const live=(strategy||[]).filter(h=>Array.isArray(h.actions)&&h.actions.length);
  return live.length?pick(live,index)?.hand||live[0].hand:null;
}

function preflopSpot(filters){
  let pool=charts;
  if(filters.heroPosition){
    const filtered=pool.filter(c=>chartPosition(c.spot_name)===filters.heroPosition);
    if(filtered.length)pool=filtered;
  }
  const chart=pick(pool);
  if(!chart)throw new Error("preflop_charts_unavailable");
  const heroPosition=chartPosition(chart.spot_name);
  const hands=(chart.hands||[]).filter(h=>Array.isArray(h.actions)&&h.actions.length);
  const chosen=pick(hands,counter*17+3);
  if(!chosen)throw new Error("preflop_chart_empty");

  const strategy=hands.map(h=>({
    hand:h.hand,
    actions:h.actions.map(a=>{
      const n=normalizeActionLabel(a.action);
      return {...n,frequency:Number(a.prob||0)*100};
    })
  }));

  return {
    id:"dcfr-pre-"+chart.spot_name.replace(/\s+/g,"-").toLowerCase()+"-"+chosen.hand,
    solver:"DCFR_SOLVER",
    version:"dcfr-preflop-blueprint",
    solveId:"dcfr-preflop-chart",
    convergence:{iterations:Number(process.env.STACKUP_PREFLOP_ITERATIONS||10_000_000),artifact:"preflop_blueprint"},
    hand:chosen.hand,
    scenario:{
      gameType:filters.gameType||"TOURNAMENT",
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
}

function chooseMatchup(filters){
  let pool=matchups;
  if(filters.heroPosition){
    const f=pool.filter(m=>{
      const roles=postflopRoles(m.opener?.position,m.caller?.position);
      return roles?.oop===filters.heroPosition;
    });
    if(f.length)pool=f;
  }
  return pick(pool,counter*11+5);
}

function run(command,args,{timeoutMs=20_000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{windowsHide:true,shell:false});
    let stdout="",stderr="";
    const timer=setTimeout(()=>{
      child.kill("SIGKILL");
      reject(new Error("solver_timeout"));
    },timeoutMs);
    child.stdout?.on("data",d=>stdout+=d);
    child.stderr?.on("data",d=>stderr+=d);
    child.once("error",e=>{clearTimeout(timer);reject(e);});
    child.once("close",code=>{
      clearTimeout(timer);
      if(code===0)resolve({stdout,stderr});
      else reject(new Error("solver_exit_"+code+":"+stderr.slice(-1200)));
    });
  });
}

function normalizeDcfr(raw,scenario){
  const nodes=raw?.strategy||raw?.strategies||[];
  if(!Array.isArray(nodes)||!nodes.length)throw new Error("dcfr_strategy_missing");
  const root=nodes.find(n=>n?.node==="root")||nodes[0];
  if(!root||!Array.isArray(root.combos)||!root.combos.length)throw new Error("dcfr_root_missing");
  const strategy=root.combos.map(combo=>({
    hand:combo.hand,
    ev:Number(combo.ev??0),
    actions:(combo.actions||[]).map(a=>{
      const n=normalizeActionLabel(a.action);
      return {...n,frequency:Number(a.weight??a.frequency??0)*100};
    })
  })).filter(h=>h.hand&&h.actions.length);
  if(!strategy.length)throw new Error("dcfr_combo_strategy_missing");
  return {
    strategy,
    convergence:{
      iterations:Number(raw.iterations??POSTFLOP_ITERATIONS),
      exploitabilityPct:raw.exploitability_pct??raw.exploitability??null
    },
    version:raw.version||"dcfr-cli",
    solveId:raw.solve_id||raw.solveId||randomUUID()
  };
}

async function solvePostflop(filters,street){
  const matchup=chooseMatchup(filters);
  if(!matchup)throw new Error("postflop_matchup_unavailable");
  const roles=postflopRoles(matchup.opener.position,matchup.caller.position);
  if(!roles)throw new Error("postflop_roles_invalid");
  const boardRaw=pick(BOARDS[street],counter*7+1);
  const key=[street,matchup.matchup,boardRaw,POSTFLOP_ITERATIONS].join("|");
  if(solveCache.has(key))return solveCache.get(key);

  const sideByPos=new Map([
    [matchup.opener.position,matchup.opener],
    [matchup.caller.position,matchup.caller]
  ]);
  const oop=sideByPos.get(roles.oop),ip=sideByPos.get(roles.ip);
  const out=join(tmpdir(),"stackup-"+randomUUID()+".json");
  const args=[
    "solve",
    "--street",street.toLowerCase(),
    "--board",boardRaw,
    "--oop-range",rangeString(oop.range),
    "--ip-range",rangeString(ip.range),
    "--pot",String(matchup.pot_chips),
    "--stack",String(matchup.eff_stack_chips),
    "--iterations",String(POSTFLOP_ITERATIONS),
    "--format","json",
    "--output",out,
    "--bet-sizes","33,67,125",
    "--raise-sizes","50,100",
    "--max-raises","2",
    "--allin-threshold","0.67",
    "--allin-pot-ratio","3",
    "--skip-cum-strategy"
  ];

  await run(SOLVER_BIN,args,{timeoutMs:Number(process.env.STACKUP_SOLVER_TIMEOUT_MS||20_000)});
  const raw=JSON.parse(await readFile(out,"utf8"));
  await rm(out,{force:true}).catch(()=>{});
  const normalized=normalizeDcfr(raw,{
    street,
    heroPosition:roles.oop,
    villainPosition:roles.ip
  });
  const stackBb=Number(matchup.eff_stack_chips)/2;
  const potBb=Number(matchup.pot_chips)/2;
  const hand=chooseStrategyHand(normalized.strategy,counter*13+7);
  const result={
    id:"dcfr-"+street.toLowerCase()+"-"+matchup.matchup.replace(/\s+/g,"-").toLowerCase()+"-"+boardRaw+"-"+hand,
    solver:"DCFR_SOLVER",
    version:normalized.version,
    solveId:normalized.solveId,
    convergence:normalized.convergence,
    hand,
    scenario:{
      gameType:filters.gameType||"TOURNAMENT",
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
      playerStacks:Object.fromEntries(TABLE_POSITIONS.map(p=>[p,stackBb]))
    },
    strategy:normalized.strategy
  };
  solveCache.set(key,result);
  if(solveCache.size>48)solveCache.delete(solveCache.keys().next().value);
  return result;
}

function enqueuePostflop(filters,street){
  const job=solveQueue.then(()=>solvePostflop(filters,street));
  solveQueue=job.catch(()=>{});
  return job;
}

function parseFilters(url){
  const q=url.searchParams;
  const street=cleanStreet(q.get("street"));
  const heroPosition=String(q.get("heroPosition")||"").toUpperCase()||null;
  return {
    street,
    heroPosition,
    gameType:String(q.get("gameType")||"").toUpperCase()||null,
    phase:q.get("phase")||null,
    effectiveStack:Number(q.get("effectiveStack"))||null,
    special:q.get("special")||null
  };
}

async function bootstrap(){
  [charts,matchups]=await Promise.all([
    readFile(CHARTS_PATH,"utf8").then(JSON.parse),
    readFile(MATCHUPS_PATH,"utf8").then(JSON.parse)
  ]);
  if(!Array.isArray(charts)||charts.length<5)throw new Error("invalid_preflop_charts");
  if(!Array.isArray(matchups)||matchups.length<15)throw new Error("invalid_preflop_matchups");
  console.log(JSON.stringify({
    event:"solver_boot",
    solver:"DCFR_SOLVER",
    charts:charts.length,
    matchups:matchups.length,
    postflopIterations:POSTFLOP_ITERATIONS
  }));
}

const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||"";
  if(origin&&!isOriginAllowed(origin)){
    return json(res,403,{ok:false,error:"origin_not_allowed"},null);
  }
  if(req.method==="OPTIONS"){
    res.writeHead(204,{
      "access-control-allow-origin":origin||"*",
      "access-control-allow-methods":"GET,POST,OPTIONS",
      "access-control-allow-headers":"Content-Type,Authorization,X-StackUp-Product",
      "access-control-max-age":"86400",
      "vary":"Origin"
    });
    return res.end();
  }

  const url=new URL(req.url||"/","http://localhost");
  try{
    if(req.method==="GET"&&url.pathname==="/health"){
      return json(res,200,{
        ok:true,
        service:"stackup-grinder-solver-api",
        solver:"DCFR_SOLVER",
        preflop:{ready:charts.length>=5,charts:charts.length},
        postflop:{ready:matchups.length>=15,matchups:matchups.length,iterations:POSTFLOP_ITERATIONS},
        cache:solveCache.size
      },origin);
    }

    if(req.method==="GET"&&url.pathname==="/v1/grinder/spots/next"){
      counter=(counter+1)>>>0;
      const filters=parseFilters(url);
      let street=filters.street;
      if(!street){
        const rotation=["PRE-FLOP","FLOP","TURN","RIVER"];
        street=rotation[counter%rotation.length];
      }
      const spot=street==="PRE-FLOP"
        ?preflopSpot(filters)
        :await enqueuePostflop(filters,street);
      return json(res,200,{ok:true,spot},origin);
    }

    if(req.method==="POST"&&url.pathname==="/v1/grinder/spots/answer"){
      const payload=await bodyJson(req);
      return json(res,200,{
        ok:true,
        accepted:true,
        spotId:payload.spotId||null,
        solver:payload.solver||null,
        solveId:payload.solveId||null
      },origin);
    }

    return json(res,404,{ok:false,error:"not_found"},origin);
  }catch(error){
    console.error(JSON.stringify({
      event:"request_error",
      path:url.pathname,
      message:String(error?.message||error)
    }));
    return json(res,500,{ok:false,error:"solver_error",detail:String(error?.message||error)},origin);
  }
});

await bootstrap();
server.listen(PORT,"0.0.0.0",()=>{
  console.log(JSON.stringify({event:"listening",port:PORT}));
});
