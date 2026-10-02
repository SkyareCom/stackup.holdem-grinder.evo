import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {createHash} from "node:crypto";

const execFileAsync=promisify(execFile);
const ROOT=resolve(process.cwd());
const BIN=process.env.STACKUP_DCFR_BIN||join(ROOT,".stackup","dcfr-solver");
const WORK=join(ROOT,".stackup","texture-sizing");
const OUT=process.env.STACKUP_TEXTURE_OUT
  ?resolve(ROOT,process.env.STACKUP_TEXTURE_OUT)
  :join(ROOT,"data","solver","texture-sizing.json");
const ITER=Math.max(80,Number(process.env.STACKUP_TEXTURE_ITERATIONS||120));

await mkdir(WORK,{recursive:true});
await mkdir(dirname(OUT),{recursive:true});

const bank=JSON.parse(await readFile(join(ROOT,"data","solver","postflop.json"),"utf8"));
const base=bank.find(s=>s?.matchup==="CO vs BTN"&&s?.scenario?.street==="FLOP"&&String(s?.scenario?.heroRange||"").length>20)
  ||bank.find(s=>s?.scenario?.street==="FLOP"&&String(s?.scenario?.heroRange||"").length>20);
if(!base)throw new Error("texture_base_spot_unavailable");

const ALL_CASES=[
  {id:"paired-a",tag:"board_paired",board:"AsAd7c",bet:"33"},
  {id:"paired-b",tag:"board_paired",board:"KhKd4s",bet:"33"},
  {id:"paired-c",tag:"board_paired",board:"QsQd6h",bet:"33"},
  {id:"paired-d",tag:"board_paired",board:"9c9d3h",bet:"33"},
  {id:"paired-e",tag:"board_paired",board:"7s7h2d",bet:"33"},
  {id:"paired-f",tag:"board_paired",board:"JcJh5s",bet:"33"},
  {id:"monotone-a",tag:"board_monotone",board:"As7s2s",bet:"33"},
  {id:"monotone-b",tag:"board_monotone",board:"Qh8h3h",bet:"33"},
  {id:"monotone-c",tag:"board_monotone",board:"Kd9d4d",bet:"33"},
  {id:"monotone-d",tag:"board_monotone",board:"Jc6c2c",bet:"33"},
  {id:"monotone-e",tag:"board_monotone",board:"Ts7s4s",bet:"33"},
  {id:"monotone-f",tag:"board_monotone",board:"AhJh5h",bet:"33"},
  {id:"low-a",tag:"board_low",board:"8s5d2c",bet:"33"},
  {id:"low-b",tag:"board_low",board:"7h4c3d",bet:"33"},
  {id:"low-c",tag:"board_low",board:"9c6h2d",bet:"33"},
  {id:"low-d",tag:"board_low",board:"8d6c4h",bet:"33"},
  {id:"low-e",tag:"board_low",board:"7c5s2h",bet:"33"},
  {id:"low-f",tag:"board_low",board:"9h5c3s",bet:"33"},

  {id:"bet25-a",tag:"bet_25",board:"As7d2c",bet:"25"},
  {id:"bet25-b",tag:"bet_25",board:"Qh8h3c",bet:"25"},
  {id:"bet25-c",tag:"bet_25",board:"9s6d4c",bet:"25"},
  {id:"bet25-d",tag:"bet_25",board:"KcQd5h",bet:"25"},
  {id:"bet50-a",tag:"bet_50",board:"As7d2c",bet:"50"},
  {id:"bet50-b",tag:"bet_50",board:"Qh8h3c",bet:"50"},
  {id:"bet50-c",tag:"bet_50",board:"9s6d4c",bet:"50"},
  {id:"bet50-d",tag:"bet_50",board:"KcQd5h",bet:"50"},
  {id:"bet66-a",tag:"bet_66",board:"As7d2c",bet:"66"},
  {id:"bet66-b",tag:"bet_66",board:"Qh8h3c",bet:"66"},
  {id:"bet66-c",tag:"bet_66",board:"9s6d4c",bet:"66"},
  {id:"bet66-d",tag:"bet_66",board:"KcQd5h",bet:"66"},
  {id:"bet75-a",tag:"bet_75",board:"As7d2c",bet:"75"},
  {id:"bet75-b",tag:"bet_75",board:"Qh8h3c",bet:"75"},
  {id:"bet75-c",tag:"bet_75",board:"9s6d4c",bet:"75"},
  {id:"bet75-d",tag:"bet_75",board:"KcQd5h",bet:"75"},
  {id:"pot-a",tag:"pot_bet",board:"As7d2c",bet:"100"},
  {id:"pot-b",tag:"pot_bet",board:"Qh8h3c",bet:"100"},
  {id:"pot-c",tag:"pot_bet",board:"9s6d4c",bet:"100"},
  {id:"pot-d",tag:"pot_bet",board:"KcQd5h",bet:"100"},
  {id:"over125-a",tag:"overbet_125",board:"As7d2c",bet:"125"},
  {id:"over125-b",tag:"overbet_125",board:"Qh8h3c",bet:"125"},
  {id:"over125-c",tag:"overbet_125",board:"9s6d4c",bet:"125"},
  {id:"over125-d",tag:"overbet_125",board:"KcQd5h",bet:"125"},
  {id:"over150-a",tag:"overbet_150",board:"As7d2c",bet:"150"},
  {id:"over150-b",tag:"overbet_150",board:"Qh8h3c",bet:"150"},
  {id:"over150-c",tag:"overbet_150",board:"9s6d4c",bet:"150"},
  {id:"over150-d",tag:"overbet_150",board:"KcQd5h",bet:"150"}
];
const selectedTag=String(process.env.STACKUP_TEXTURE_TAG||"").trim();
const cases=selectedTag?ALL_CASES.filter(x=>x.tag===selectedTag):ALL_CASES;
if(selectedTag&&!cases.length)throw new Error("unknown_texture_tag_"+selectedTag);

function hash(v){return createHash("sha256").update(String(v)).digest("hex").slice(0,20);}
function boardCards(raw){
  return String(raw).match(/(?:10|[2-9TJQKA])[cdhs]/gi)?.map(c=>{
    const r=c.slice(0,-1).toUpperCase();return (r==="T"?"10":r)+c.slice(-1).toLowerCase();
  })||[];
}
function actionKind(text){
  const x=String(text||"").toLowerCase().replace(/[ _-]+/g,"");
  if(x.includes("fold"))return "fold";
  if(x.includes("check"))return "check";
  if(x.includes("call"))return "call";
  if(x.includes("allin")||x.includes("jam"))return "jam";
  if(x.includes("bet")||x.includes("raise"))return "raise";
  return "unknown";
}
function sizingPct(text){
  const s=String(text||"").toLowerCase();
  let m=s.match(/(\d+(?:\.\d+)?)\s*%/);if(m)return Number(m[1]);
  m=s.match(/bet\s+(\d+)\s*\/\s*(\d+)/);if(m&&Number(m[2]))return Number(m[1])/Number(m[2])*100;
  return null;
}
function normalizeRoot(raw){
  const nodes=raw?.strategy||raw?.strategies||[];
  const root=Array.isArray(nodes)?(nodes.find(n=>n?.node==="root")||nodes[0]):null;
  if(!root||!Array.isArray(root.combos)||!root.combos.length)throw new Error("dcfr_root_missing");
  return root.combos.map(combo=>({
    hand:combo.hand,
    ev:Number.isFinite(Number(combo.ev))?Number(combo.ev):null,
    actions:(combo.actions||[]).map(a=>({
      action:String(a.action||""),
      kind:actionKind(a.action),
      sizingPct:sizingPct(a.action),
      frequency:Number(a.weight??a.frequency??0)*100,
      ev:Number.isFinite(Number(a.ev??a.expectedValue??a.expected_value))?Number(a.ev??a.expectedValue??a.expected_value):null
    }))
  })).filter(h=>h.hand&&h.actions.length);
}

const spots=[],failures=[];
for(const item of cases){
  const rawPath=join(WORK,item.id+"-"+hash(item.board+"|"+item.bet)+".json");
  const args=[
    "solve",
    "--street","flop",
    "--board",item.board,
    "--oop-range",base.scenario.heroRange,
    "--ip-range",base.scenario.villainRange,
    "--pot",String(Number(base.scenario.pot)*2),
    "--stack",String(Number(base.scenario.effectiveStack)*2),
    "--iterations",String(ITER),
    "--format","json",
    "--output",rawPath,
    "--bet-sizes",item.bet,
    "--raise-sizes","75",
    "--max-raises","0",
    "--allin-threshold","0.67",
    "--allin-pot-ratio","3",
    "--skip-cum-strategy"
  ];
  try{
    console.log("Solving",item.id,item.board,item.bet+"%");
    await execFileAsync(BIN,args,{maxBuffer:32*1024*1024});
    const raw=JSON.parse(await readFile(rawPath,"utf8"));
    const strategy=normalizeRoot(raw);
    if(strategy.length<250)throw new Error("insufficient_exact_combos_"+strategy.length);
    const stack=Number(base.scenario.effectiveStack);
    spots.push({
      id:"dcfr-target-"+item.id+"-"+hash(item.board),
      solver:"DCFR_SOLVER",
      version:raw.version||"dcfr-target-v1",
      solveId:"texture-sizing|"+item.id+"|"+hash(item.board+"|"+item.bet),
      convergence:{
        iterations:Number(raw.iterations??ITER),
        exploitabilityPct:raw.exploitability_pct??raw.exploitability??null,
        solveProfile:"ROOT_ONLY_SINGLE_SIZING"
      },
      matchup:base.matchup||"CO vs BTN",
      scenario:{
        gameType:"TOURNAMENT",
        street:"FLOP",
        tableSize:6,
        heroPosition:base.scenario.heroPosition,
        villainPosition:base.scenario.villainPosition,
        heroStack:stack,
        effectiveStack:stack,
        pot:Number(base.scenario.pot),
        currentBet:0,
        board:boardCards(item.board),
        heroRange:base.scenario.heroRange,
        villainRange:base.scenario.villainRange,
        actionHistory:[],
        positions:["UTG","HJ","CO","BTN","SB","BB"],
        playerStacks:Object.fromEntries(["UTG","HJ","CO","BTN","SB","BB"].map(p=>[p,stack])),
        tags:[item.tag],
        targetSizingPct:Number(item.bet),
        provenance:{
          strategySource:"DCFR_SOLVER",
          upstream:"exinori/DCFR-SOLVER",
          upstreamCommit:"4ade6a9e15a841c41867afde1258b9d110cd6fb1",
          license:"MIT",
          purpose:"TARGETED_TEXTURE_OR_SIZING",
          solveProfile:"ROOT_ONLY_SINGLE_SIZING"
        }
      },
      strategy
    });
  }catch(error){
    failures.push({id:item.id,tag:item.tag,board:item.board,bet:item.bet,error:String(error?.message||error).slice(0,1200)});
  }finally{
    await rm(rawPath,{force:true}).catch(()=>{});
  }
}

const payload={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  solver:"DCFR_SOLVER",
  upstream:{repository:"exinori/DCFR-SOLVER",commit:"4ade6a9e15a841c41867afde1258b9d110cd6fb1",license:"MIT"},
  iterations:ITER,
  baseSpot:{id:base.id,matchup:base.matchup},
  spots,failures
};
await writeFile(OUT,JSON.stringify(payload),"utf8");
console.log(JSON.stringify({
  selectedTag:selectedTag||null,
  spots:spots.length,
  failures:failures.length,
  tags:spots.map(s=>s.scenario.tags[0]),
  failureDetails:failures
},null,2));
if(spots.length<(selectedTag?Math.max(3,cases.length-1):40))process.exitCode=2;
