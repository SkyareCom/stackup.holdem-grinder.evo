import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {createHash} from "node:crypto";

const execFileAsync=promisify(execFile);
const ROOT=resolve(process.cwd());
const BIN=process.env.STACKUP_DCFR_BIN||join(ROOT,".stackup","dcfr-solver");
const WORK=join(ROOT,".stackup","line-bank");
const OUT=process.env.STACKUP_LINE_OUT
  ?resolve(ROOT,process.env.STACKUP_LINE_OUT)
  :join(ROOT,"data","solver","line-bank.json");
const ITER=Math.max(100,Number(process.env.STACKUP_LINE_ITERATIONS||160));
await mkdir(WORK,{recursive:true});
await mkdir(dirname(OUT),{recursive:true});

const baseBank=JSON.parse(await readFile(join(ROOT,"data","solver","postflop.json"),"utf8"));
const baseCallerOop=baseBank.find(s=>s?.matchup==="UTG vs BB"&&s?.scenario?.street==="FLOP");
const baseAggressorOop=baseBank.find(s=>s?.matchup==="UTG vs HJ"&&s?.scenario?.street==="FLOP");
if(!baseCallerOop||!baseAggressorOop)throw new Error("required_line_base_matchups_missing");

const ALL_RUNOUTS=[
  {id:"a",flop:"As7d2c",turn:"Jh",river:"4s"},
  {id:"b",flop:"Qh8h3c",turn:"5d",river:"Ts"},
  {id:"c",flop:"9s8d6c",turn:"Kh",river:"2s"},
  {id:"d",flop:"KcQd5h",turn:"5s",river:"9c"},
  {id:"e",flop:"7s6s2d",turn:"8h",river:"Ac"},
  {id:"f",flop:"Jc9c4d",turn:"2h",river:"Qs"},
  {id:"g",flop:"AhKd7c",turn:"3s",river:"8d"},
  {id:"h",flop:"Ts9h5c",turn:"Qd",river:"2c"},
  {id:"i",flop:"8c8d3s",turn:"Kh",river:"6h"},
  {id:"j",flop:"QsJd4h",turn:"9c",river:"Ac"},
  {id:"k",flop:"6h5d2s",turn:"Tc",river:"Kc"},
  {id:"l",flop:"Kd9s7h",turn:"4c",river:"Jd"},
  {id:"m",flop:"AcQc6d",turn:"8s",river:"3h"},
  {id:"n",flop:"JhTd3d",turn:"7s",river:"2c"},
  {id:"o",flop:"9c7h4s",turn:"Ad",river:"5c"},
  {id:"p",flop:"Ks8s5d",turn:"2h",river:"Qc"},
  {id:"q",flop:"7d7c4h",turn:"Js",river:"9s"},
  {id:"r",flop:"QcTc2h",turn:"6s",river:"Ad"},
  {id:"s",flop:"8h6c3d",turn:"Kd",river:"Ts"},
  {id:"t",flop:"Jd9s5h",turn:"4c",river:"2d"}
];
const selectedRunoutId=String(process.env.STACKUP_LINE_RUNOUT_ID||"").trim();
const RUNOUTS=selectedRunoutId
  ?ALL_RUNOUTS.filter(x=>x.id===selectedRunoutId)
  :ALL_RUNOUTS;
if(selectedRunoutId&&!RUNOUTS.length)throw new Error("unknown_line_runout_"+selectedRunoutId);
const POSITIONS=["UTG","HJ","CO","BTN","SB","BB"];
const SUITS=["c","d","h","s"];
const RANKS="AKQJT98765432";

function hash(v){return createHash("sha256").update(String(v)).digest("hex").slice(0,18);}
function cardId(card){
  const t=String(card||"").replace(/^10/i,"T");
  const r=RANKS.indexOf(t[0].toUpperCase());
  const s=SUITS.indexOf(t.slice(-1).toLowerCase());
  return (r<0||s<0)?999:(12-r)*4+s;
}
function comboKey(hand){
  const t=String(hand||"").replace(/10/g,"T");
  const m=t.match(/^([2-9TJQKA][cdhs])([2-9TJQKA][cdhs])$/i);
  if(!m)return t;
  const cards=[m[1][0].toUpperCase()+m[1][1].toLowerCase(),m[2][0].toUpperCase()+m[2][1].toLowerCase()]
    .sort((a,b)=>cardId(a)-cardId(b));
  return cards.join("");
}
function classCombos(hand){
  const t=String(hand||"").trim().toUpperCase().replace(/10/g,"T");
  const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?$/);
  if(!m)return [];
  const a=m[1],b=m[2],kind=m[3]||"";
  const out=[];
  if(a===b){
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)out.push(a+SUITS[i]+b+SUITS[j]);
    return out;
  }
  for(const s1 of SUITS)for(const s2 of SUITS){
    if(kind==="S"&&s1!==s2)continue;
    if(kind==="O"&&s1===s2)continue;
    out.push(a+s1+b+s2);
  }
  return out;
}
function parseRange(raw){
  const map=new Map();
  for(const token of String(raw||"").split(",")){
    if(!token.trim())continue;
    const [h,wRaw]=token.trim().split(":");
    const weight=Number(wRaw??1);
    if(!h||!Number.isFinite(weight)||weight<=0)continue;
    const exact=/^(?:10|[2-9TJQKA])[cdhs](?:10|[2-9TJQKA])[cdhs]$/i.test(h);
    const hands=exact?[h]:classCombos(h);
    for(const hand of hands){
      const key=comboKey(hand);
      map.set(key,{hand:key,weight});
    }
  }
  return map;
}
function rangeText(map,minWeight=0.00002){
  return [...map.values()]
    .filter(x=>x.weight>=minWeight)
    .map(x=>x.hand+":"+Math.min(1,x.weight).toFixed(7))
    .join(",");
}
function withoutBoard(map,board){
  const blocked=new Set(boardCards(board).map(c=>String(c).replace(/^10/i,"T")));
  const out=new Map();
  for(const [key,item] of map||[]){
    const text=String(item?.hand||key||"").replace(/10/g,"T");
    const m=text.match(/^([2-9TJQKA][cdhs])([2-9TJQKA][cdhs])$/i);
    if(!m)continue;
    const a=m[1][0].toUpperCase()+m[1][1].toLowerCase();
    const b=m[2][0].toUpperCase()+m[2][1].toLowerCase();
    if(blocked.has(a)||blocked.has(b))continue;
    out.set(key,item);
  }
  return out;
}
function actionKind(text){
  const s=String(text||"").toLowerCase().replace(/[ _-]+/g,"");
  if(s.includes("fold"))return "fold";
  if(s.includes("check"))return "check";
  if(s.includes("call"))return "call";
  if(s.includes("allin")||s.includes("jam"))return "jam";
  if(s.includes("bet")||s.includes("raise"))return "raise";
  return "unknown";
}
function sizingPct(text){
  const s=String(text||"").toLowerCase();
  let m=s.match(/(\d+(?:\.\d+)?)\s*%/);if(m)return Number(m[1]);
  m=s.match(/(?:bet|raise)\s+(\d+)\s*\/\s*(\d+)/);if(m&&Number(m[2]))return Number(m[1])/Number(m[2])*100;
  m=s.match(/(?:bet|raise)\s+(\d+(?:\.\d+)?)x/);if(m)return Number(m[1])*100;
  return null;
}
function nodePath(node){
  if(!node||node==="root")return [];
  return String(node).split(/\s*(?:→|->)\s*/).map(x=>x.trim()).filter(Boolean);
}
function actionMatches(label,spec){
  const kind=actionKind(label);
  if(spec.kind&&kind!==spec.kind)return false;
  if(spec.pct!=null){
    const pct=sizingPct(label);
    if(!Number.isFinite(pct)||Math.abs(pct-spec.pct)>3)return false;
  }
  if(spec.label&&String(label).toLowerCase()!==String(spec.label).toLowerCase())return false;
  return true;
}
function findNode(raw,path){
  const nodes=raw?.strategy||[];
  return nodes.find(n=>{
    const p=nodePath(n.node);
    return p.length===path.length&&p.every((label,i)=>actionMatches(label,path[i]));
  })||null;
}
function normalizeNode(node){
  if(!node||!Array.isArray(node.combos))return [];
  return node.combos.map(combo=>({
    hand:combo.hand,
    ev:Number.isFinite(Number(combo.ev))?Number(combo.ev):null,
    actions:(combo.actions||[]).map(a=>({
      action:String(a.action||""),
      kind:actionKind(a.action),
      sizingPct:sizingPct(a.action),
      frequency:Number(a.weight??a.frequency??0)*100,
      ev:null
    }))
  })).filter(h=>h.hand&&h.actions.length);
}
function priorWeight(map,hand){
  return Number(map.get(comboKey(hand))?.weight||0);
}
function conditionRange(prior,node,spec){
  const raw=[];
  if(!node)return new Map();
  let maxWeight=0;
  for(const combo of node.combos||[]){
    const pw=priorWeight(prior,combo.hand);
    if(pw<=0)continue;
    const action=(combo.actions||[]).find(a=>actionMatches(a.action,spec));
    const p=Number(action?.weight??action?.frequency??0);
    const w=pw*p;
    if(w>1e-10){
      raw.push({hand:comboKey(combo.hand),weight:w});
      if(w>maxWeight)maxWeight=w;
    }
  }
  const out=new Map();
  if(maxWeight<=0)return out;
  // Bayesian conditioning changes relative combo weights. Rescaling the
  // posterior so its largest weight is 1 preserves the exact relative range
  // while preventing repeated street transitions from numerically pruning
  // legitimate low-frequency combos.
  for(const item of raw){
    const weight=item.weight/maxWeight;
    if(weight>1e-7)out.set(item.hand,{hand:item.hand,weight});
  }
  return out;
}
function aggregateActionWeight(prior,node,label){
  let total=0;
  for(const combo of node?.combos||[]){
    const pw=priorWeight(prior,combo.hand);
    if(pw<=0)continue;
    const action=(combo.actions||[]).find(a=>String(a.action)===label);
    if(action)total+=pw*Number(action.weight??0);
  }
  return total;
}
function chooseBet(prior,node,{minPct=20,maxPct=160}={}){
  const labels=[...new Set((node?.combos||[]).flatMap(c=>(c.actions||[]).map(a=>String(a.action))))]
    .filter(x=>actionKind(x)==="raise")
    .filter(x=>{const p=sizingPct(x);return Number.isFinite(p)&&p>=minPct&&p<=maxPct;});
  if(!labels.length)return null;
  return labels.map(label=>({label,pct:sizingPct(label),score:aggregateActionWeight(prior,node,label)}))
    .sort((a,b)=>b.score-a.score)[0];
}
function boardCards(raw){
  return String(raw).match(/(?:10|[2-9TJQKA])[cdhs]/gi)?.map(c=>{
    const r=c.slice(0,-1).toUpperCase();return (r==="T"?"10":r)+c.slice(-1).toLowerCase();
  })||[];
}
function appendCard(board,card){return String(board)+String(card);}
function actionEvent(position,label,to,street){
  return {position,action:String(label).toUpperCase(),kind:actionKind(label),to:+Number(to||0).toFixed(4),street};
}
function checkEvent(position,street){return {position,action:"CHECK",kind:"check",to:0,street};}
function callEvent(position,to,street){return {position,action:"CALL",kind:"call",to:+Number(to||0).toFixed(4),street};}

function solverErrorText(error){
  const parts=[
    String(error?.stderr||"").trim(),
    String(error?.stdout||"").trim(),
    String(error?.message||error||"").trim()
  ].filter(Boolean);
  return parts.join("\n").slice(-6000);
}
async function solveRaw({id,street,board,oopRange,ipRange,potBb,stackBb,betSizes="33,75",raiseSizes="75",maxRaises=1}){
  const cleanOop=withoutBoard(oopRange,board);
  const cleanIp=withoutBoard(ipRange,board);
  if(cleanOop.size<4||cleanIp.size<4){
    throw new Error("solver_range_too_small_"+cleanOop.size+"_"+cleanIp.size+"_"+street+"_"+board);
  }
  const rawPath=join(WORK,id+"-"+hash([street,board,potBb,stackBb,betSizes,raiseSizes].join("|"))+".json");
  const args=[
    "solve","--street",street.toLowerCase(),"--board",board,
    "--oop-range",rangeText(cleanOop),"--ip-range",rangeText(cleanIp),
    "--pot",String(potBb*2),"--stack",String(stackBb*2),
    "--iterations",String(ITER),"--format","json","--output",rawPath,
    "--bet-sizes",betSizes,"--raise-sizes",raiseSizes,
    "--max-raises",String(maxRaises),"--allin-threshold","0.67","--allin-pot-ratio","3",
    "--skip-cum-strategy"
  ];
  try{
    await execFileAsync(BIN,args,{maxBuffer:48*1024*1024});
    return JSON.parse(await readFile(rawPath,"utf8"));
  }catch(error){
    throw new Error(solverErrorText(error));
  }finally{
    await rm(rawPath,{force:true}).catch(()=>{});
  }
}
function playerRanges(nodePlayer,oopRange,ipRange){
  return nodePlayer==="IP"
    ?{hero:ipRange,villain:oopRange}
    :{hero:oopRange,villain:ipRange};
}
function materialize({
  id,raw,node,tags,base,oopRange,ipRange,potBb,stackBb,history,currentBet=0,
  extra={}
}){
  if(!node)return null;
  const strategy=normalizeNode(node);
  if(strategy.length<40)return null;
  const nodePlayer=String(node.player||"OOP").toUpperCase()==="IP"?"IP":"OOP";
  const heroPosition=nodePlayer==="IP"?base.scenario.villainPosition:base.scenario.heroPosition;
  const villainPosition=nodePlayer==="IP"?base.scenario.heroPosition:base.scenario.villainPosition;
  const boardRaw=raw.config?.board||extra.board||"";
  const cleanOop=withoutBoard(oopRange,boardRaw);
  const cleanIp=withoutBoard(ipRange,boardRaw);
  const ranges=playerRanges(nodePlayer,cleanOop,cleanIp);
  return {
    id:"dcfr-line-"+id+"-"+hash(base.matchup+"|"+id+"|"+node.node),
    solver:"DCFR_SOLVER",
    version:raw.version||"dcfr-line-v1",
    solveId:"line|"+id+"|"+hash(base.matchup+"|"+node.node),
    convergence:{iterations:Number(raw.iterations??ITER),solveProfile:"TARGETED_PROPAGATED_LINE"},
    matchup:base.matchup,
    scenario:{
      gameType:"TOURNAMENT",
      street:String(raw.config?.street||extra.street||"").toUpperCase(),
      tableSize:6,
      heroPosition,villainPosition,
      heroStack:stackBb,effectiveStack:stackBb,
      pot:+potBb.toFixed(4),currentBet:+Number(currentBet||0).toFixed(4),
      board:boardCards(boardRaw),
      heroRange:rangeText(ranges.hero),villainRange:rangeText(ranges.villain),
      actionHistory:history,
      positions:POSITIONS,
      playerStacks:Object.fromEntries(POSITIONS.map(p=>[p,stackBb])),
      tags:[...new Set(tags)],
      solverNode:node.node,
      provenance:{
        strategySource:"DCFR_SOLVER",
        upstream:"exinori/DCFR-SOLVER",
        upstreamCommit:"4ade6a9e15a841c41867afde1258b9d110cd6fb1",
        license:"MIT",
        purpose:"TARGETED_PROPAGATED_LINE"
      },
      ...extra
    },
    strategy
  };
}
function addSpot(spots,spot){if(spot)spots.push(spot);}

const spots=[],failures=[];

for(const runout of RUNOUTS){
  // -----------------------------------------------------------------------
  // LINE A: UTG opener IP vs BB caller OOP.
  // Flop check-back -> Turn probe / delayed c-bet -> River checked-through.
  // -----------------------------------------------------------------------
  try{
    const base=baseCallerOop;
    const oop0=parseRange(base.scenario.heroRange);
    const ip0=parseRange(base.scenario.villainRange);
    const pot0=Number(base.scenario.pot);
    const stack0=Number(base.scenario.effectiveStack);
    const flopRaw=await solveRaw({
      id:"caller-oop-flop-"+runout.id,street:"FLOP",board:runout.flop,
      oopRange:oop0,ipRange:ip0,potBb:pot0,stackBb:stack0,
      betSizes:"33,75",raiseSizes:"75",maxRaises:1
    });
    const root=findNode(flopRaw,[]);
    const afterCheck=findNode(flopRaw,[{kind:"check"}]);
    if(!root||!afterCheck)throw new Error("lineA_flop_nodes_missing");

    addSpot(spots,materialize({
      id:"donk-"+runout.id,raw:flopRaw,node:root,tags:["donk_bet"],
      base,oopRange:oop0,ipRange:ip0,potBb:pot0,stackBb:stack0,history:[]
    }));
    addSpot(spots,materialize({
      id:"checkback-"+runout.id,raw:flopRaw,node:afterCheck,tags:["check_back_flop","miss_cbet"],
      base,oopRange:conditionRange(oop0,root,{kind:"check"}),ipRange:ip0,
      potBb:pot0,stackBb:stack0,
      history:[checkEvent(base.scenario.heroPosition,"FLOP")]
    }));

    const flopIpBet=chooseBet(ip0,afterCheck);
    if(!flopIpBet)throw new Error("lineA_ip_bet_missing");
    const afterCheckBet=findNode(flopRaw,[{kind:"check"},{kind:"raise",pct:flopIpBet.pct}]);
    const flopBetAmt=pot0*(flopIpBet.pct/100);
    addSpot(spots,materialize({
      id:"checkraise-flop-"+runout.id,raw:flopRaw,node:afterCheckBet,tags:["check_raise"],
      base,
      oopRange:conditionRange(oop0,root,{kind:"check"}),
      ipRange:conditionRange(ip0,afterCheck,{label:flopIpBet.label}),
      potBb:pot0+flopBetAmt,stackBb:stack0,
      currentBet:flopBetAmt,
      history:[
        checkEvent(base.scenario.heroPosition,"FLOP"),
        actionEvent(base.scenario.villainPosition,flopIpBet.label,flopBetAmt,"FLOP")
      ]
    }));

    // Check-check propagation to turn. Remove the newly exposed turn card
    // from both exact posterior ranges before solving the next street.
    const turnBoard=appendCard(runout.flop,runout.turn);
    const oopTurn=withoutBoard(conditionRange(oop0,root,{kind:"check"}),turnBoard);
    const ipTurn=withoutBoard(conditionRange(ip0,afterCheck,{kind:"check"}),turnBoard);
    if(oopTurn.size<4||ipTurn.size<4)throw new Error("lineA_checkcheck_ranges_too_small_"+oopTurn.size+"_"+ipTurn.size);
    const turnRaw=await solveRaw({
      id:"caller-oop-turn-"+runout.id,street:"TURN",board:turnBoard,
      oopRange:oopTurn,ipRange:ipTurn,potBb:pot0,stackBb:stack0,
      betSizes:"33,75",raiseSizes:"75",maxRaises:1
    });
    const turnRoot=findNode(turnRaw,[]);
    const turnAfterCheck=findNode(turnRaw,[{kind:"check"}]);
    const priorCheckCheck=[
      checkEvent(base.scenario.heroPosition,"FLOP"),
      checkEvent(base.scenario.villainPosition,"FLOP")
    ];
    addSpot(spots,materialize({
      id:"probe-"+runout.id,raw:turnRaw,node:turnRoot,tags:["probe_bet","vs_missed_cbet","sequential_lines"],
      base,oopRange:oopTurn,ipRange:ipTurn,potBb:pot0,stackBb:stack0,history:priorCheckCheck
    }));
    addSpot(spots,materialize({
      id:"delayed-"+runout.id,raw:turnRaw,node:turnAfterCheck,tags:["delayed_cbet","sequential_lines"],
      base,oopRange:conditionRange(oopTurn,turnRoot,{kind:"check"}),ipRange:ipTurn,
      potBb:pot0,stackBb:stack0,
      history:[...priorCheckCheck,checkEvent(base.scenario.heroPosition,"TURN")]
    }));

    const turnIpBet=chooseBet(ipTurn,turnAfterCheck);
    if(turnIpBet){
      const turnAfterCheckBet=findNode(turnRaw,[{kind:"check"},{kind:"raise",pct:turnIpBet.pct}]);
      const betAmt=pot0*(turnIpBet.pct/100);
      addSpot(spots,materialize({
        id:"turn-checkraise-"+runout.id,raw:turnRaw,node:turnAfterCheckBet,
        tags:["turn_check_raise","sequential_lines"],
        base,
        oopRange:conditionRange(oopTurn,turnRoot,{kind:"check"}),
        ipRange:conditionRange(ipTurn,turnAfterCheck,{label:turnIpBet.label}),
        potBb:pot0+betAmt,stackBb:stack0,currentBet:betAmt,
        history:[
          ...priorCheckCheck,checkEvent(base.scenario.heroPosition,"TURN"),
          actionEvent(base.scenario.villainPosition,turnIpBet.label,betAmt,"TURN")
        ]
      }));
    }

    // Check-check turn as well -> river ranges for block bets and bluff catches.
    if(turnRoot&&turnAfterCheck){
      const riverBoard=appendCard(turnBoard,runout.river);
      const oopRiver=withoutBoard(conditionRange(oopTurn,turnRoot,{kind:"check"}),riverBoard);
      const ipRiver=withoutBoard(conditionRange(ipTurn,turnAfterCheck,{kind:"check"}),riverBoard);
      if(oopRiver.size>=4&&ipRiver.size>=4){
        const riverRaw=await solveRaw({
          id:"caller-oop-river-"+runout.id,street:"RIVER",board:riverBoard,
          oopRange:oopRiver,ipRange:ipRiver,potBb:pot0,stackBb:stack0,
          betSizes:"25,75,125,150",raiseSizes:"75",maxRaises:1
        });
        const riverRoot=findNode(riverRaw,[]);
        const riverAfterCheck=findNode(riverRaw,[{kind:"check"}]);
        const histRiver=[
          ...priorCheckCheck,
          checkEvent(base.scenario.heroPosition,"TURN"),
          checkEvent(base.scenario.villainPosition,"TURN")
        ];
        addSpot(spots,materialize({
          id:"blockbet-"+runout.id,raw:riverRaw,node:riverRoot,
          tags:["block_bet_20_25","sequential_lines"],
          base,oopRange:oopRiver,ipRange:ipRiver,potBb:pot0,stackBb:stack0,history:histRiver
        }));

        const over=(riverAfterCheck?.combos||[]).flatMap(c=>c.actions||[])
          .map(a=>String(a.action)).find(x=>actionKind(x)==="raise"&&Number(sizingPct(x))>=120);
        const fallbackBet=chooseBet(ipRiver,riverAfterCheck,{minPct:50,maxPct:160});
        const chosen=over?{label:over,pct:sizingPct(over)}:fallbackBet;
        if(chosen){
          const response=findNode(riverRaw,[{kind:"check"},{label:chosen.label}]);
          const betAmt=pot0*(chosen.pct/100);
          const tags=["river_bluff_catch","river_check_raise","sequential_lines"];
          if(chosen.pct>=120)tags.push("vs_overbet");
          addSpot(spots,materialize({
            id:"river-response-"+runout.id,raw:riverRaw,node:response,tags,
            base,
            oopRange:conditionRange(oopRiver,riverRoot,{kind:"check"}),
            ipRange:conditionRange(ipRiver,riverAfterCheck,{label:chosen.label}),
            potBb:pot0+betAmt,stackBb:stack0,currentBet:betAmt,
            history:[
              ...histRiver,checkEvent(base.scenario.heroPosition,"RIVER"),
              actionEvent(base.scenario.villainPosition,chosen.label,betAmt,"RIVER")
            ]
          }));
        }

        // Bet/fold node: OOP small-bets, IP raises, OOP must continue or fold.
        const small=(riverRoot?.combos||[]).flatMap(c=>c.actions||[])
          .map(a=>String(a.action)).find(x=>actionKind(x)==="raise"&&Math.abs(Number(sizingPct(x))-25)<=3);
        if(small){
          const afterSmall=findNode(riverRaw,[{label:small}]);
          const raise=chooseBet(ipRiver,afterSmall,{minPct:40,maxPct:120});
          if(raise){
            const response=findNode(riverRaw,[{label:small},{label:raise.label}]);
            const b1=pot0*(sizingPct(small)/100);
            const potAfterCall=pot0+2*b1;
            const raiseAmount=potAfterCall*(raise.pct/100);
            const to=b1+raiseAmount;
            addSpot(spots,materialize({
              id:"betfold-"+runout.id,raw:riverRaw,node:response,tags:["bet_fold","sequential_lines"],
              base,
              oopRange:conditionRange(oopRiver,riverRoot,{label:small}),
              ipRange:conditionRange(ipRiver,afterSmall,{label:raise.label}),
              potBb:pot0+b1+to,stackBb:stack0,currentBet:to,
              history:[
                ...histRiver,
                actionEvent(base.scenario.heroPosition,small,b1,"RIVER"),
                actionEvent(base.scenario.villainPosition,raise.label,to,"RIVER")
              ]
            }));
          }
        }
      }
    }
  }catch(error){
    failures.push({runout:runout.id,line:"CHECKBACK_PROBE",error:String(error?.message||error).slice(0,1400)});
  }

  // -----------------------------------------------------------------------
  // LINE B: UTG opener OOP vs HJ caller IP.
  // Flop c-bet -> call -> Turn double barrel -> call -> River triple barrel.
  // -----------------------------------------------------------------------
  try{
    const base=baseAggressorOop;
    const oop0=parseRange(base.scenario.heroRange);
    const ip0=parseRange(base.scenario.villainRange);
    const pot0=Number(base.scenario.pot);
    const stack0=Number(base.scenario.effectiveStack);
    const flopRaw=await solveRaw({
      id:"aggressor-oop-flop-"+runout.id,street:"FLOP",board:runout.flop,
      oopRange:oop0,ipRange:ip0,potBb:pot0,stackBb:stack0,
      betSizes:"33,75",raiseSizes:"75",maxRaises:1
    });
    const root=findNode(flopRaw,[]);
    if(!root)throw new Error("lineB_root_missing");
    const flopBet=chooseBet(oop0,root);
    if(!flopBet)throw new Error("lineB_flop_bet_missing");
    const afterBet=findNode(flopRaw,[{label:flopBet.label}]);
    const betAmt=pot0*(flopBet.pct/100);
    addSpot(spots,materialize({
      id:"float-"+runout.id,raw:flopRaw,node:afterBet,tags:["float_flop"],
      base,
      oopRange:conditionRange(oop0,root,{label:flopBet.label}),ipRange:ip0,
      potBb:pot0+betAmt,stackBb:stack0,currentBet:betAmt,
      history:[actionEvent(base.scenario.heroPosition,flopBet.label,betAmt,"FLOP")]
    }));

    const turnBoard=appendCard(runout.flop,runout.turn);
    const oopTurn=withoutBoard(conditionRange(oop0,root,{label:flopBet.label}),turnBoard);
    const ipTurn=withoutBoard(conditionRange(ip0,afterBet,{kind:"call"}),turnBoard);
    if(oopTurn.size<4||ipTurn.size<4)throw new Error("lineB_betcall_ranges_too_small_"+oopTurn.size+"_"+ipTurn.size);
    const potTurn=pot0+2*betAmt;
    const stackTurn=stack0-betAmt;
    const turnRaw=await solveRaw({
      id:"aggressor-oop-turn-"+runout.id,street:"TURN",board:turnBoard,
      oopRange:oopTurn,ipRange:ipTurn,potBb:potTurn,stackBb:stackTurn,
      betSizes:"33,75",raiseSizes:"75",maxRaises:1
    });
    const turnRoot=findNode(turnRaw,[]);
    const histTurn=[
      actionEvent(base.scenario.heroPosition,flopBet.label,betAmt,"FLOP"),
      callEvent(base.scenario.villainPosition,betAmt,"FLOP")
    ];
    addSpot(spots,materialize({
      id:"doublebarrel-"+runout.id,raw:turnRaw,node:turnRoot,tags:["double_barrel","sequential_lines"],
      base,oopRange:oopTurn,ipRange:ipTurn,potBb:potTurn,stackBb:stackTurn,history:histTurn
    }));

    const turnBet=chooseBet(oopTurn,turnRoot);
    if(!turnBet)throw new Error("lineB_turn_bet_missing");
    const turnAfterBet=findNode(turnRaw,[{label:turnBet.label}]);
    const turnBetAmt=potTurn*(turnBet.pct/100);
    const riverBoard=appendCard(turnBoard,runout.river);
    const oopRiver=withoutBoard(conditionRange(oopTurn,turnRoot,{label:turnBet.label}),riverBoard);
    const ipRiver=withoutBoard(conditionRange(ipTurn,turnAfterBet,{kind:"call"}),riverBoard);
    if(oopRiver.size<4||ipRiver.size<4)throw new Error("lineB_turncall_ranges_too_small_"+oopRiver.size+"_"+ipRiver.size);
    const potRiver=potTurn+2*turnBetAmt;
    const stackRiver=stackTurn-turnBetAmt;
    const riverRaw=await solveRaw({
      id:"aggressor-oop-river-"+runout.id,street:"RIVER",board:riverBoard,
      oopRange:oopRiver,ipRange:ipRiver,potBb:potRiver,stackBb:stackRiver,
      betSizes:"25,50,75,125",raiseSizes:"75",maxRaises:1
    });
    const riverRoot=findNode(riverRaw,[]);
    const histRiver=[
      ...histTurn,
      actionEvent(base.scenario.heroPosition,turnBet.label,turnBetAmt,"TURN"),
      callEvent(base.scenario.villainPosition,turnBetAmt,"TURN")
    ];
    addSpot(spots,materialize({
      id:"triplebarrel-"+runout.id,raw:riverRaw,node:riverRoot,
      tags:["triple_barrel","sequential_lines"],
      base,oopRange:oopRiver,ipRange:ipRiver,potBb:potRiver,stackBb:stackRiver,history:histRiver
    }));
  }catch(error){
    failures.push({runout:runout.id,line:"BARREL",error:String(error?.message||error).slice(0,1400)});
  }
}

const payload={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  solver:"DCFR_SOLVER",
  upstream:{repository:"exinori/DCFR-SOLVER",commit:"4ade6a9e15a841c41867afde1258b9d110cd6fb1",license:"MIT"},
  iterations:ITER,
  baseMatchups:[baseCallerOop.matchup,baseAggressorOop.matchup],
  spots,failures
};
await writeFile(OUT,JSON.stringify(payload),"utf8");
console.log(JSON.stringify({
  selectedRunoutId:selectedRunoutId||null,
  spots:spots.length,failures:failures.length,
  tags:[...new Set(spots.flatMap(s=>s.scenario?.tags||[]))].sort(),
  failureDetails:failures
},null,2));
// Do not fail an individual runout on an arbitrary local volume floor.
// The aggregate workflow is the authority: every decision is contract-validated
// and every required family must reach the strict solved floor there.
if(!spots.length&&failures.length){
  console.warn("runout produced no solved roots; aggregate strict-floor validation will decide publishability");
}
