import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";

const ROOT=resolve(process.cwd());
const SOLVER_DIR=join(ROOT,"data","solver");
const catalogCode=await readFile(join(ROOT,"core","stackup-scenario-catalog.js"),"utf8");
const contractCode=await readFile(join(ROOT,"core","stackup-solved-spot-contract.js"),"utf8");
const classifierCode=await readFile(join(ROOT,"core","stackup-solved-spot-classifier.js"),"utf8");
const fakeWindow={};
new Function("window",catalogCode)(fakeWindow);
new Function("window","globalThis",contractCode)(fakeWindow,fakeWindow);
new Function("window","globalThis",classifierCode)(fakeWindow,fakeWindow);
const catalog=fakeWindow.StackUpScenarioCatalog;
const solvedContract=fakeWindow.StackUpSolvedSpotContract;
const solvedClassifier=fakeWindow.StackUpSolvedSpotClassifier;
if(!catalog)throw new Error("scenario catalog unavailable");
if(!solvedContract)throw new Error("solved spot contract unavailable");
if(!solvedClassifier)throw new Error("solved spot classifier unavailable");
const solvedPolicy=JSON.parse(await readFile(join(SOLVER_DIR,"solved-spot-policy.json"),"utf8"));

const preflop=JSON.parse(await readFile(join(SOLVER_DIR,"preflop.json"),"utf8"));
const postflop=JSON.parse(await readFile(join(SOLVER_DIR,"postflop.json"),"utf8"));
const pushfold=JSON.parse(await readFile(join(SOLVER_DIR,"pushfold-hu-v1.json"),"utf8"));
const tournament=JSON.parse(await readFile(join(SOLVER_DIR,"tournament.json"),"utf8"));
const reentry=JSON.parse(await readFile(join(SOLVER_DIR,"reentry.json"),"utf8"));
const opponentProfile=JSON.parse(await readFile(join(SOLVER_DIR,"opponent-profile.json"),"utf8"));
const multiwayTournament=JSON.parse(await readFile(join(SOLVER_DIR,"multiway-tournament.json"),"utf8"));
const multiwayPostflop=JSON.parse(await readFile(join(SOLVER_DIR,"multiway-postflop.json"),"utf8"));
const preflopDecisions=JSON.parse(await readFile(join(SOLVER_DIR,"preflop-decisions.json"),"utf8"));
const preflop9max=JSON.parse(await readFile(join(SOLVER_DIR,"preflop-9max.json"),"utf8"));
const preflopMultistack=JSON.parse(await readFile(join(SOLVER_DIR,"preflop-multistack.json"),"utf8"));
const preflopHu=JSON.parse(await readFile(join(SOLVER_DIR,"preflop-hu.json"),"utf8"));
const textureSizing=JSON.parse(await readFile(join(SOLVER_DIR,"texture-sizing.json"),"utf8"));
const lineBank=JSON.parse(await readFile(join(SOLVER_DIR,"line-bank.json"),"utf8"));

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
const all=[
  ...preflop,...postflop,...pushfoldSpots(),
  ...((tournament?.spots)||[]),
  ...((reentry?.spots)||[]),
  ...((opponentProfile?.spots)||[]),
  ...((multiwayTournament?.spots)||[]),
  ...((multiwayPostflop?.spots)||[]),
  ...((preflopDecisions?.spots)||[]),
  ...((preflop9max?.spots)||[]),
  ...((preflopMultistack?.spots)||[]),
  ...((preflopHu?.spots)||[]),
  ...((textureSizing?.spots)||[]),
  ...((lineBank?.spots)||[])
];
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
function exactCardsFromHand(hand){
  const text=String(hand||"").replace(/10/g,"T");
  const m=text.match(/^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i);
  return m?[m[1].toUpperCase()+m[2].toLowerCase(),m[3].toUpperCase()+m[4].toLowerCase()]:[];
}
function cardRankValue(card){
  const r=String(card||"").slice(0,-1).toUpperCase();
  return ({2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14})[r]||0;
}
function drawProfile(spot,hand){
  const hero=exactCardsFromHand(hand);
  const board=(spot?.scenario?.board||[]).map(x=>String(x).replace(/^10/i,"T"));
  if(hero.length!==2||board.length<3||board.length>4)return null;
  const cards=[...hero,...board];
  const suits={};
  for(const card of cards){
    const suit=card.slice(-1).toLowerCase();
    (suits[suit]??=[]).push(card);
  }
  let flushDraw=false,nonNutFlushDraw=false;
  for(const [suit,suitCards] of Object.entries(suits)){
    if(suitCards.length!==4)continue;
    const boardSuit=board.filter(x=>x.slice(-1).toLowerCase()===suit);
    const heroSuit=hero.filter(x=>x.slice(-1).toLowerCase()===suit);
    if(!heroSuit.length)continue;
    flushDraw=true;
    const boardRanks=new Set(boardSuit.map(cardRankValue));
    const heroRanks=new Set(heroSuit.map(cardRankValue));
    let nutRank=14;
    while(nutRank>=2&&boardRanks.has(nutRank))nutRank--;
    if(nutRank>=2&&!heroRanks.has(nutRank))nonNutFlushDraw=true;
  }
  const allRanks=new Set(cards.map(cardRankValue).filter(Boolean));
  if(allRanks.has(14))allRanks.add(1);
  const heroRanks=new Set(hero.map(cardRankValue));
  if(heroRanks.has(14))heroRanks.add(1);
  let madeStraight=false,straightDraw=false;
  for(let low=1;low<=10;low++){
    const window=[low,low+1,low+2,low+3,low+4];
    const present=window.filter(r=>allRanks.has(r));
    if(present.length===5)madeStraight=true;
    if(present.length===4&&present.some(r=>heroRanks.has(r)))straightDraw=true;
  }
  if(madeStraight)straightDraw=false;
  return {flushDraw,nonNutFlushDraw,straightDraw,anyDraw:flushDraw||straightDraw};
}
function spotFacesAggression(spot){
  const s=spot?.scenario||{};
  const hero=String(s.heroPosition||"").toUpperCase();
  const h=Array.isArray(s.actionHistory)?s.actionHistory:[];
  const last=h[h.length-1]||null;
  if(!last)return false;
  const actor=String(last.position||last.player||last.actor||"").toUpperCase();
  const kind=String(last.kind||last.action||"").toLowerCase();
  return actor!==hero&&/raise|bet|jam|all\s*-?\s*in/.test(kind);
}
function candidateMatchesItem(item,spot,hand){
  if(item?.section==="math_special"&&["implied_odds","reverse_implied_odds"].includes(item.id)){
    const street=normStreet(spot?.scenario?.street);
    if(!["FLOP","TURN"].includes(street))return false;
    const profile=drawProfile(spot,hand);
    if(!profile)return false;
    if(item.id==="implied_odds"&&!(spotFacesAggression(spot)&&profile.anyDraw))return false;
    if(item.id==="reverse_implied_odds"&&!profile.nonNutFlushDraw)return false;
  }
  if(solvedClassifier.isHandLevel(item?.section,item?.id)){
    return solvedClassifier.qualifies(item.section,item.id,spot,hand);
  }
  return true;
}
function candidateCount(spots,item=null){
  const unique=new Set();
  for(const spot of spots){
    for(const entry of spot?.strategy||[]){
      if(!entry?.hand||!Array.isArray(entry.actions)||!entry.actions.length)continue;
      if(!candidateMatchesItem(item,spot,entry.hand))continue;
      const verdict=solvedContract.validateSolvedDecision(spot,entry);
      if(verdict.ok){
        // Same canonical scenario + hand identity as build-solved-core-catalog.mjs.
        const scenarioHash=createHash("sha256").update(JSON.stringify(solvedContract.stable({contractVersion:solvedContract.VERSION,scenarioFingerprint:verdict.scenarioFingerprint}))).digest("hex");
        const decisionHash=createHash("sha256").update(JSON.stringify(solvedContract.stable({contractVersion:solvedContract.VERSION,scenarioHash,hand:String(entry.hand||"").trim()}))).digest("hex");
        unique.add(decisionHash);
      }
    }
  }
  return unique.size;
}
function normStreet(value){
  const s=String(value||"").toUpperCase().replace("PREFLOP","PRE-FLOP");
  return s;
}
function boardTags(board){
  const cards=(Array.isArray(board)?board:[]).map(String).filter(Boolean);
  if(cards.length<3)return [];
  const rv={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,"10":10,J:11,Q:12,K:13,A:14};
  const ranks=cards.map(c=>rv[c.slice(0,-1).toUpperCase()]||0);
  const suits=cards.map(c=>c.slice(-1).toLowerCase());
  const uniq=new Set(ranks), counts={};
  suits.forEach(s=>counts[s]=(counts[s]||0)+1);
  const out=[], max=Math.max(...ranks), min=Math.min(...ranks);
  if(uniq.size<ranks.length)out.push("board_paired");
  if(Math.max(...Object.values(counts))>=3)out.push("board_monotone");
  else if(Object.values(counts).some(n=>n===2))out.push("board_twotone");
  if(max>=12)out.push("board_high_card");
  if(max<=9)out.push("board_low");
  const sorted=[...uniq].sort((a,b)=>a-b);
  let span=99;
  for(let i=0;i<sorted.length;i++)for(let j=i+2;j<sorted.length;j++)span=Math.min(span,sorted[j]-sorted[i]);
  if(span<=4||(max-min<=5&&uniq.size>=3))out.push("board_connected","board_dynamic");
  else out.push("board_dry","board_static");
  return out;
}
function sizingPct(action){
  const label=String(action?.action||action?.label||"").toLowerCase();
  const direct=Number(action?.to??action?.size??action?.amount);
  if(Number.isFinite(direct))return direct<=3?direct*100:direct;
  let m=label.match(/(\d+(?:\.\d+)?)\s*%/);
  if(m)return Number(m[1]);
  m=label.match(/bet\s+(\d+)\s*\/\s*(\d+)/);
  if(m&&Number(m[2]))return Number(m[1])/Number(m[2])*100;
  m=label.match(/bet\s+(\d+(?:\.\d+)?)x/);
  if(m)return Number(m[1])*100;
  return null;
}
function tags(spot){
  const raw=spot?.tags||spot?.scenario?.tags||spot?.scenario?.special||[];
  const set=new Set();
  if(Array.isArray(raw))raw.forEach(x=>set.add(String(x)));
  else if(raw&&typeof raw==="object")Object.values(raw).flat().forEach(x=>set.add(String(x)));

  const s=spot?.scenario||{};
  const street=normStreet(s.street);
  const hero=String(s.heroPosition||"").toUpperCase();
  const villain=String(s.villainPosition||"").toUpperCase();
  const id=String(spot?.id||"").toLowerCase();
  const matchup=String(spot?.matchup||"");

  if(street==="PRE-FLOP"&&id.includes("rfi")){
    set.add("open_by_pos");
    if(hero==="SB")set.add("blind_war");
  }
  if(hero==="BB"){
    if(villain==="UTG")set.add("bb_ep");
    else if(["HJ","CO"].includes(villain))set.add("bb_mp");
    else if(["BTN","SB"].includes(villain))set.add("bb_lp");
  }
  if(hero==="SB"){
    if(villain==="UTG")set.add("sb_ep");
    else if(villain==="HJ")set.add("sb_mp");
    else if(["CO","BTN"].includes(villain))set.add("sb_cobtn");
  }
  if(/CO vs BTN/i.test(matchup))set.add("attack_cobtn");
  boardTags(s.board).forEach(x=>set.add(x));

  const actions=(spot?.strategy||[]).flatMap(h=>h?.actions||[]);
  const history=Array.isArray(s.actionHistory)?s.actionHistory:[];
  const last=history[history.length-1]||null;
  const lastKind=String(last?.kind||last?.action||"").toLowerCase();
  const facingAggression=last&&String(last?.position||last?.player||"").toUpperCase()!==hero&&/raise|bet|jam|all\s*-?\s*in/.test(lastKind);
  if(facingAggression){
    set.add("pot_odds");
    set.add("mdf");
    set.add("breakeven_call");
  }
  const currentBet=Number(s.currentBet||0);
  const hasOpenBet=(spot?.strategy||[]).some(h=>(h?.actions||[]).some(a=>/\bbet\b|\braise\b/.test(String(a?.action||a?.label||"").toLowerCase())));
  if((!Number.isFinite(currentBet)||currentBet<=0)&&hasOpenBet)set.add("breakeven_bluff");
  if(s.heroRange&&s.villainRange)set.add("combos");
  if(["FLOP","TURN"].includes(street)&&s.heroRange&&s.villainRange)set.add("equity_realization");
  const exactPostflop=street!=="PRE-FLOP"&&(spot?.strategy||[]).some(h=>isExactHand(h?.hand));
  if(exactPostflop)set.add("blockers");

  for(const a of actions){
    const label=String(a?.action||a?.label||"").toLowerCase();
    const n=sizingPct(a);
    if(/\ball\s*-?\s*in\b|\bjam\b|\bshove\b/.test(label))set.add("open_shove");
    if(label.includes("bet")||label.includes("raise")){
      if(Number.isFinite(n)){
        if(Math.abs(n-25)<2)set.add("bet_25");
        if(Math.abs(n-33)<3)set.add("bet_33");
        if(Math.abs(n-50)<3)set.add("bet_50");
        if(Math.abs(n-66)<3)set.add("bet_66");
        if(Math.abs(n-75)<3)set.add("bet_75");
        if(Math.abs(n-100)<4)set.add("pot_bet");
        if(Math.abs(n-125)<5)set.add("overbet_125");
        if(Math.abs(n-150)<5)set.add("overbet_150");
      }
    }
  }
  return set;
}
function matchAdjust(item,spot){
  const s=spot?.scenario||{};
  switch(item.section){
    case "mode": return item.id==="mtt"?String(s.gameType||"").toUpperCase()==="TOURNAMENT":item.id==="cash"?String(s.gameType||"").toUpperCase()==="CASH":false;
    case "seats": return Number(s.trainingTableSize??s.tableSize)===Number(item.tableSize);
    case "ttype": {
      const map={regular:"REGULAR",turbo:"TURBO",pko:"PKO",freeze:"FREEZEOUT",hroller:"HIGH_ROLLER",sng:"SNG"};
      return String(s.tournamentType||"").toUpperCase()===map[item.id];
    }
    case "extras": return Array.isArray(s.extras)&&s.extras.includes(item.id);
    case "fsize": return String(s.fieldSize||"")===item.id;
    case "fskill": return String(s.opponentProfile||"")===item.id;
    case "hands": return true;
    case "phase": {
      const map={early:"EARLY",middle:"MIDDLE",bubble:"BUBBLE",late:"LATE",ft:"FINAL_TABLE"};
      return String(s.phase||"").toUpperCase()===map[item.id];
    }
    case "pos": return String(s.heroPosition||"").toUpperCase()===item.id.toUpperCase();
    case "street": {
      const map={pre:"PRE-FLOP",flop:"FLOP",turn:"TURN",river:"RIVER"};
      return normStreet(s.street)===map[item.id];
    }
    case "stack": return Math.abs(Number(s.heroStack??s.effectiveStack)-Number(item.stackBb))<.01;
    default:return false;
  }
}
function matchAdvance(item,spot){
  const street=normStreet(spot?.scenario?.street);
  if(["pre_special","blind_special","short_special","icm_special","pko_special"].includes(item.section)&&street!=="PRE-FLOP")return false;
  if(item.section==="aggr_special"){
    if(item.id==="pot_4bet"){
      if(!["FLOP","TURN","RIVER"].includes(street))return false;
    }else if(street!=="PRE-FLOP")return false;
  }
  if(item.section==="river_special"&&street!=="RIVER")return false;
  if(["post_special","texture_special"].includes(item.section)&&!["FLOP","TURN","RIVER"].includes(street))return false;
  if(item.section==="math_special"&&["implied_odds","reverse_implied_odds"].includes(item.id)){
    return ["FLOP","TURN"].includes(street);
  }
  if(solvedClassifier.isHandLevel(item.section,item.id))return true;
  return tags(spot).has(item.id);
}

function baseSpotsFor(item){
  const direct=all.filter(spot=>item.section.endsWith("_special")?matchAdvance(item,spot):matchAdjust(item,spot));
  return direct;
}

const cards=[];
for(const item of catalog.ALL){
  const spots=baseSpotsFor(item);
  const available=candidateCount(spots,item);
  cards.push({
    section:item.section,
    id:item.id,
    label:item.label,
    source:item.source,
    validator:item.validator,
    minSpots:item.minSpots,
    baseSpots:spots.length,
    solvedSpots:available,
    validatedSolvedSpots:available,
    available,
    targetSpots:Number(solvedPolicy.currentGoal)||2000,
    longTermTargetSpots:Number(solvedPolicy.growth?.longTermTargetPerFilter)||20000,
    coveragePct:Number((((available)/(Number(solvedPolicy.currentGoal)||2000))*100).toFixed(2)),
    publishable:available>=item.minSpots
  });
}

const summary={
  generatedAt:new Date().toISOString(),
  mode:"STRICT_SOLVED_ONLY",
  countingUnit:solvedPolicy.countingUnit,
  minSpots:catalog.MIN_SPOTS,
  currentGoal:Number(solvedPolicy.currentGoal)||2000,
  longTermTarget:Number(solvedPolicy.growth?.longTermTargetPerFilter)||20000,
  milestones:solvedPolicy.milestones||[1500,2000,5000,10000,20000],
  rules:solvedPolicy.rules||{},
  counts:catalog.count(),
  publishable:cards.filter(x=>x.publishable).length,
  incomplete:cards.filter(x=>!x.publishable).length,
  atCurrentGoal:cards.filter(x=>x.validatedSolvedSpots>=(Number(solvedPolicy.currentGoal)||2000)).length,
  cards
};

await writeFile(join(SOLVER_DIR,"coverage.json"),JSON.stringify(summary,null,2)+"\n","utf8");
console.log(JSON.stringify({
  generatedAt:summary.generatedAt,
  counts:summary.counts,
  minSpots:summary.minSpots,
  currentGoal:summary.currentGoal,
  longTermTarget:summary.longTermTarget,
  publishable:summary.publishable,
  incomplete:summary.incomplete,
  atCurrentGoal:summary.atCurrentGoal
},null,2));
