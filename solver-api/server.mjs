import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomInt } from "node:crypto";

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
function csv(value,map=v=>v){
  return [...new Set(String(value||"").split(",").map(v=>v.trim()).filter(Boolean).map(map).filter(Boolean))];
}
function parseSpecial(value){
  if(!value)return {};
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch{return {};}
}
function boardTags(raw){
  const cards=displayBoard(raw);
  if(cards.length<3)return [];
  const rv={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,"10":10,J:11,Q:12,K:13,A:14};
  const ranks=cards.map(x=>rv[x.slice(0,-1).toUpperCase()]||0);
  const suits=cards.map(x=>x.slice(-1));
  const tags=[];
  const unique=new Set(ranks);
  const counts={};suits.forEach(s=>counts[s]=(counts[s]||0)+1);
  if(unique.size<ranks.length)tags.push("board_paired");
  if(Math.max(...Object.values(counts))>=3)tags.push("board_monotone");
  else if(Object.values(counts).some(n=>n===2))tags.push("board_twotone");
  const max=Math.max(...ranks),min=Math.min(...ranks);
  if(max>=12)tags.push("board_high_card");
  if(max<=9)tags.push("board_low");
  const sorted=[...unique].sort((a,b)=>a-b);
  let span=99;
  for(let i=0;i<sorted.length;i++)for(let j=i+2;j<sorted.length;j++)span=Math.min(span,sorted[j]-sorted[i]);
  if(span<=4||(max-min<=5&&unique.size>=3))tags.push("board_connected","board_dynamic");
  else tags.push("board_dry","board_static");
  return tags;
}
function matchupTags(hero,villain,matchup){
  const tags=[];
  if(hero==="BB"){
    if(villain==="UTG")tags.push("bb_ep");
    else if(villain==="HJ"||villain==="CO")tags.push("bb_mp");
    else if(villain==="BTN"||villain==="SB")tags.push("bb_lp");
  }
  if(hero==="SB"){
    if(villain==="UTG")tags.push("sb_ep");
    else if(villain==="HJ")tags.push("sb_mp");
    else if(villain==="CO"||villain==="BTN")tags.push("sb_cobtn");
  }
  if(/CO vs BTN/i.test(String(matchup||"")))tags.push("attack_cobtn");
  return tags;
}
function specialMatches(tags,special){
  const set=new Set(tags||[]);
  const groups=Object.entries(special||{}).filter(([,v])=>Array.isArray(v)&&v.length);
  return groups.every(([,values])=>values.some(v=>set.has(String(v))));
}
function stackMatches(actual,requested){
  if(!requested?.length)return true;
  const n=Number(actual);
  return requested.some(v=>Math.abs(n-Number(v))<=5);
}
function randomPick(array){
  if(!array?.length)return null;
  return array[randomInt(array.length)];
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
  if(filters.phases.length)throw new Error("phase_filter_requires_icm_solver_family");
  if(!stackMatches(100,filters.effectiveStacks))throw new Error("preflop_stack_not_available");
  let pool=charts.filter(chart=>{
    const hero=chartPosition(chart.spot_name);
    if(filters.heroPositions.length&&!filters.heroPositions.includes(hero))return false;
    const tags=["open_by_pos"];
    if(hero==="SB")tags.push("blind_war");
    return specialMatches(tags,filters.special);
  });
  const chart=randomPick(pool);
  if(!chart)throw new Error("preflop_filter_family_unavailable");
  const heroPosition=chartPosition(chart.spot_name);
  const hands=(chart.hands||[]).filter(h=>Array.isArray(h.actions)&&h.actions.length);
  const chosen=randomPick(hands);
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
      playerStacks:Object.fromEntries(TABLE_POSITIONS.map(p=>[p,100])),
      tags:[..."open_by_pos",...(heroPosition==="SB"?["blind_war"]:[])]
    },
    strategy
  };
}

function chooseMatchup(filters,street){
  if(filters.phases.length)throw new Error("phase_filter_requires_icm_solver_family");
  const pool=matchups.filter(m=>{
    const roles=postflopRoles(m.opener?.position,m.caller?.position);
    if(!roles)return false;
    if(filters.heroPositions.length&&!filters.heroPositions.includes(roles.oop))return false;
    const stackBb=Number(m.eff_stack_chips)/2;
    if(!stackMatches(stackBb,filters.effectiveStacks))return false;
    const baseTags=[
      ...matchupTags(roles.oop,roles.ip,m.matchup),
      ...(street==="FLOP"?["bet_33","bet_66","overbet_125"]:[])
    ];
    const nonTexture={...filters.special};
    delete nonTexture.texture_special;
    return specialMatches(baseTags,nonTexture);
  });
  return randomPick(pool);
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
  const matchup=chooseMatchup(filters,street);
  if(!matchup)throw new Error("postflop_filter_family_unavailable");
  const roles=postflopRoles(matchup.opener.position,matchup.caller.position);
  if(!roles)throw new Error("postflop_roles_invalid");
  const textureRequested=filters.special?.texture_special||[];
  const boardPool=(BOARDS[street]||[]).filter(board=>{
    if(!textureRequested.length)return true;
    const tags=[
      ...boardTags(board),
      ...(street==="FLOP"?["bet_33","bet_66","overbet_125"]:[])
    ];
    return textureRequested.some(v=>tags.includes(String(v)));
  });
  const boardRaw=randomPick(boardPool);
  if(!boardRaw)throw new Error("postflop_board_filter_unavailable");
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
      playerStacks:Object.fromEntries(TABLE_POSITIONS.map(p=>[p,stackBb])),
      tags:[
        ...matchupTags(roles.oop,roles.ip,matchup.matchup),
        ...boardTags(boardRaw),
        ...(street==="FLOP"?["bet_33","bet_66","overbet_125"]:[])
      ],
      trainingContext:{
        phase:filters.phases,
        tournamentType:filters.tournamentType,
        fieldSize:filters.fieldSize,
        opponentProfile:filters.opponentProfile,
        extras:filters.extras
      }
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
  const streets=csv(q.get("streets")||q.get("street"),cleanStreet);
  const heroPositions=csv(q.get("heroPositions")||q.get("heroPosition"),v=>String(v).toUpperCase());
  const effectiveStacks=csv(q.get("effectiveStacks")||q.get("effectiveStack"),v=>{
    const n=Number(v);return Number.isFinite(n)&&n>0?n:null;
  });
  const phases=csv(q.get("phases")||q.get("phase"),String);
  return {
    street:streets.length===1?streets[0]:null,
    streets,
    heroPosition:heroPositions.length===1?heroPositions[0]:null,
    heroPositions,
    gameType:String(q.get("gameType")||"").toUpperCase()||null,
    phase:phases.length===1?phases[0]:null,
    phases,
    effectiveStack:effectiveStacks.length===1?effectiveStacks[0]:null,
    effectiveStacks,
    tableSize:Number(q.get("tableSize"))||null,
    seats:q.get("seats")||null,
    tournamentType:q.get("tournamentType")||null,
    fieldSize:q.get("fieldSize")||null,
    opponentProfile:q.get("opponentProfile")||null,
    sampleSize:Number(q.get("sampleSize"))||null,
    extras:csv(q.get("extras"),String),
    special:parseSpecial(q.get("special"))
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
        const allowed=filters.streets.length?filters.streets:["PRE-FLOP","FLOP","TURN","RIVER"];
        street=randomPick(allowed);
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
