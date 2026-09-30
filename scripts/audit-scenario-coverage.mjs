import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";

const ROOT=resolve(process.cwd());
const SOLVER_DIR=join(ROOT,"data","solver");
const catalogCode=await readFile(join(ROOT,"core","stackup-scenario-catalog.js"),"utf8");
const fakeWindow={};
new Function("window",catalogCode)(fakeWindow);
const catalog=fakeWindow.StackUpScenarioCatalog;
if(!catalog)throw new Error("scenario catalog unavailable");

const preflop=JSON.parse(await readFile(join(SOLVER_DIR,"preflop.json"),"utf8"));
const postflop=JSON.parse(await readFile(join(SOLVER_DIR,"postflop.json"),"utf8"));
const pushfold=JSON.parse(await readFile(join(SOLVER_DIR,"pushfold-hu-v1.json"),"utf8"));

const SUIT_PERMS=[
  {s:"s",h:"h",d:"d",c:"c"},
  {s:"h",h:"s",d:"c",c:"d"},
  {s:"d",h:"c",d:"s",c:"h"},
  {s:"c",h:"d",d:"h",c:"s"},
  {s:"h",h:"d",d:"c",c:"s"},
  {s:"d",h:"c",d:"h",c:"s"}
];

function isExactHand(hand){
  return /^(?:10|[2-9TJQKA])[cdhs](?:10|[2-9TJQKA])[cdhs]$/i.test(String(hand||""));
}
const RANKS="AKQJT98765432";
function allHandClasses(){
  const out=[];
  for(let i=0;i<RANKS.length;i++){
    for(let j=0;j<RANKS.length;j++){
      const a=RANKS[i],b=RANKS[j];
      if(i===j)out.push(a+a);
      else if(i<j)out.push(a+b+"s");
      else out.push(b+a+"o");
    }
  }
  return out;
}
function classComboCount(hand){
  const t=String(hand||"").trim().toUpperCase().replace(/10/g,"T");
  const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?$/);
  if(!m)return 1;
  if(m[1]===m[2])return 6;
  return m[3]==="S"?4:m[3]==="O"?12:1;
}
function pushfoldSpots(){
  if(!pushfold?.charts)return [];
  const expl=Number(pushfold.final_exploitability_bb_per_100);
  if(!Number.isFinite(expl)||expl>=0.05)return [];
  const classes=allHandClasses();
  const out=[];
  for(const stack of (pushfold.stack_depths_bb||[]).map(Number).filter(v=>v>=2&&v<=15)){
    const jam=pushfold.charts?.sb_jam?.[String(stack)]||{};
    const call=pushfold.charts?.bb_call_vs_jam?.[String(stack)]||{};
    out.push({
      id:"pushfold-hu-sb-"+stack+"bb",solver:"POKER_SOLVER_PUSHFOLD",
      scenario:{gameType:"TOURNAMENT",street:"PRE-FLOP",tableSize:2,trainingTableSize:2,heroPosition:"SB",villainPosition:"BB",effectiveStack:stack,pot:1.5,board:[],actionHistory:[],tags:["open_shove","push_fold","heads_up_2max","blind_war"]},
      strategy:classes.map(hand=>{const p=Math.max(0,Math.min(1,Number(jam[hand])||0));return {hand,actions:[{action:"FOLD",frequency:(1-p)*100},{action:"ALL IN",frequency:p*100}]};})
    });
    out.push({
      id:"pushfold-hu-bb-"+stack+"bb",solver:"POKER_SOLVER_PUSHFOLD",
      scenario:{gameType:"TOURNAMENT",street:"PRE-FLOP",tableSize:2,trainingTableSize:2,heroPosition:"BB",villainPosition:"SB",effectiveStack:stack,pot:stack+1,board:[],actionHistory:[{position:"SB",action:"ALL IN",kind:"jam",to:stack}],tags:["call_shove","push_fold","heads_up_2max","blind_war"]},
      strategy:classes.map(hand=>{const p=Math.max(0,Math.min(1,Number(call[hand])||0));return {hand,actions:[{action:"FOLD",frequency:(1-p)*100},{action:"CALL",frequency:p*100}]};})
    });
  }
  return out;
}
const all=[...preflop,...postflop,...pushfoldSpots()];
function transformCard(card,perm){
  const text=String(card||"");
  const m=text.match(/^(10|[2-9TJQKA])([cdhs])$/i);
  if(!m)return text;
  return m[1].toUpperCase().replace("10","T")+(perm[m[2].toLowerCase()]||m[2].toLowerCase());
}
function transformHand(hand,perm){
  const text=String(hand||"");
  const m=text.match(/^(10|[2-9TJQKA])([cdhs])(10|[2-9TJQKA])([cdhs])$/i);
  if(!m)return text;
  return transformCard(m[1]+m[2],perm)+transformCard(m[3]+m[4],perm);
}
function handVariants(spot,hand){
  if(!isExactHand(hand))return 1;
  const set=new Set();
  for(const perm of SUIT_PERMS){
    const board=(spot?.scenario?.board||[]).map(c=>transformCard(c,perm)).join("");
    set.add(board+"|"+transformHand(hand,perm));
  }
  return set.size;
}
function candidateCount(spots){
  let total=0;
  for(const spot of spots){
    const pre=normStreet(spot?.scenario?.street)==="PRE-FLOP";
    for(const h of spot?.strategy||[]){
      if(!h?.hand||!Array.isArray(h.actions)||!h.actions.length)continue;
      if(pre&&!isExactHand(h.hand))total+=classComboCount(h.hand);
      else total+=handVariants(spot,h.hand);
    }
  }
  return total;
}
function normStreet(value){
  const s=String(value||"").toUpperCase().replace("PREFLOP","PRE-FLOP");
  return s;
}
function tags(spot){
  const raw=spot?.tags||spot?.scenario?.tags||spot?.scenario?.special||[];
  const set=new Set();
  if(Array.isArray(raw))raw.forEach(x=>set.add(String(x)));
  else if(raw&&typeof raw==="object")Object.values(raw).flat().forEach(x=>set.add(String(x)));
  return set;
}
function matchAdjust(item,spot){
  const s=spot?.scenario||{};
  switch(item.section){
    case "mode": return item.id==="mtt"?String(s.gameType||"").toUpperCase()==="TOURNAMENT":item.id==="cash"?String(s.gameType||"").toUpperCase()==="CASH":false;
    case "seats": return Number(s.trainingTableSize??s.tableSize)===Number(item.tableSize);
    case "ttype": return String(s.tournamentType||"")===item.id;
    case "extras": return Array.isArray(s.extras)&&s.extras.includes(item.id);
    case "fsize": return String(s.fieldSize||"")===item.id;
    case "fskill": return String(s.opponentProfile||"")===item.id;
    case "hands": return true;
    case "phase": return String(s.phase||"")===item.id;
    case "pos": return String(s.heroPosition||"").toUpperCase()===item.id.toUpperCase();
    case "street": {
      const map={pre:"PRE-FLOP",flop:"FLOP",turn:"TURN",river:"RIVER"};
      return normStreet(s.street)===map[item.id];
    }
    case "stack": return Math.abs(Number(s.effectiveStack)-Number(item.stackBb))<.01;
    default:return false;
  }
}
function matchAdvance(item,spot){
  return tags(spot).has(item.id);
}
function baseSpotsFor(item){
  return all.filter(spot=>item.section.endsWith("_special")?matchAdvance(item,spot):matchAdjust(item,spot));
}

const cards=[];
for(const item of catalog.ALL){
  const spots=baseSpotsFor(item);
  const available=candidateCount(spots);
  cards.push({
    section:item.section,
    id:item.id,
    label:item.label,
    source:item.source,
    validator:item.validator,
    minSpots:item.minSpots,
    baseSpots:spots.length,
    available,
    publishable:available>=item.minSpots
  });
}

const summary={
  generatedAt:new Date().toISOString(),
  minSpots:catalog.MIN_SPOTS,
  counts:catalog.count(),
  publishable:cards.filter(x=>x.publishable).length,
  incomplete:cards.filter(x=>!x.publishable).length,
  cards
};

await writeFile(join(SOLVER_DIR,"coverage.json"),JSON.stringify(summary,null,2)+"\n","utf8");
console.log(JSON.stringify({
  generatedAt:summary.generatedAt,
  counts:summary.counts,
  minSpots:summary.minSpots,
  publishable:summary.publishable,
  incomplete:summary.incomplete
},null,2));
