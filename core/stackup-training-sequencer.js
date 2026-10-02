/* StackUp Hold'em Grinder EVO — Training Sequencer V3 STRICT SOLVED.
   One candidate == one validated solver decision for one scenario + hand.
   No combo, suit, board, context or position expansion may increase coverage. */
(function(global){
  'use strict';

  const STORAGE_KEY='solver_training_seen_v2';
  const MAX_PERSISTED_SEEN=12000;
  const MAX_RECENT_FAMILIES=8;
  const MAX_RECENT_POSITIONS=4;
  const bags=new Map();
  // Six suit-isomorphic presentations per exact postflop combo. These are
  // strategically identical transformations, not fabricated solver outputs.
  const SUIT_PERMS=[
    {s:'s',h:'h',d:'d',c:'c'},
    {s:'h',h:'s',d:'c',c:'d'},
    {s:'d',h:'c',d:'s',c:'h'},
    {s:'c',h:'d',d:'h',c:'s'},
    {s:'h',h:'d',d:'c',c:'s'},
    {s:'d',h:'c',d:'h',c:'s'}
  ];

  function clone(value){
    if(global.structuredClone){
      try{return global.structuredClone(value);}catch(_){}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function transformCard(card,perm){
    const text=String(card||'');
    const m=text.match(/^(10|[2-9TJQKA])([cdhs])$/i);
    if(!m)return text;
    return m[1].toUpperCase().replace('10','T')+(perm[m[2].toLowerCase()]||m[2].toLowerCase());
  }

  function transformExactHand(hand,perm){
    const text=String(hand||'');
    const m=text.match(/^(10|[2-9TJQKA])([cdhs])(10|[2-9TJQKA])([cdhs])$/i);
    if(!m)return text;
    const a=transformCard(m[1]+m[2],perm);
    const b=transformCard(m[3]+m[4],perm);
    return a+b;
  }

  function isExactHand(hand){
    return /^(?:10|[2-9TJQKA])[cdhs](?:10|[2-9TJQKA])[cdhs]$/i.test(String(hand||''));
  }

  const RANKS='AKQJT98765432';
  const SUITS=['c','d','h','s'];

  function allHandClasses(){
    const out=[];
    for(let i=0;i<RANKS.length;i++){
      for(let j=0;j<RANKS.length;j++){
        const a=RANKS[i],b=RANKS[j];
        if(i===j)out.push(a+a);
        else if(i<j)out.push(a+b+'s');
        else out.push(b+a+'o');
      }
    }
    return out;
  }

  function handClassCombos(hand){
    const t=String(hand||'').trim().toUpperCase().replace(/10/g,'T');
    const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?$/);
    if(!m)return [];
    const a=m[1],b=m[2],kind=m[3]||'';
    const out=[];
    if(a===b){
      for(let i=0;i<SUITS.length;i++)for(let j=i+1;j<SUITS.length;j++)out.push([a+SUITS[i],b+SUITS[j]]);
      return out;
    }
    for(const s1 of SUITS)for(const s2 of SUITS){
      if(kind==='S'&&s1!==s2)continue;
      if(kind==='O'&&s1===s2)continue;
      out.push([a+s1,b+s2]);
    }
    return out;
  }

  function pushfoldSpots(bank){
    const pf=bank?.pushfold;
    if(!pf?.charts)return [];
    const expl=Number(pf.final_exploitability_bb_per_100);
    if(!Number.isFinite(expl)||expl>=0.05)return [];
    const classes=allHandClasses();
    const depths=(pf.stack_depths_bb||[]).map(Number).filter(v=>Number.isInteger(v)&&v>=2&&v<=15);
    const out=[];
    for(const stack of depths){
      const jam=pf.charts?.sb_jam?.[String(stack)]||{};
      const call=pf.charts?.bb_call_vs_jam?.[String(stack)]||{};
      const jamStrategy=classes.map(hand=>{
        const aggressive=Math.max(0,Math.min(1,Number(jam[hand])||0));
        return {hand,actions:[
          {action:'FOLD',kind:'fold',frequency:(1-aggressive)*100,ev:null},
          {action:'ALL IN',kind:'jam',frequency:aggressive*100,ev:null}
        ]};
      });
      const callStrategy=classes.map(hand=>{
        const aggressive=Math.max(0,Math.min(1,Number(call[hand])||0));
        return {hand,actions:[
          {action:'FOLD',kind:'fold',frequency:(1-aggressive)*100,ev:null},
          {action:'CALL',kind:'call',frequency:aggressive*100,ev:null}
        ]};
      });
      out.push({
        id:'pushfold-hu-sb-'+stack+'bb',
        solver:'POKER_SOLVER_PUSHFOLD',
        version:String(pf.version||'v1'),
        solveId:'pushfold-hu-sb-'+stack,
        convergence:{exploitabilityBbPer100:expl,iterations:Number(pf.iterations_per_solve)||0},
        scenario:{
          gameType:'TOURNAMENT',street:'PRE-FLOP',tableSize:2,trainingTableSize:2,
          heroPosition:'SB',villainPosition:'BB',effectiveStack:stack,pot:1.5,board:[],
          positions:['SB','BB'],playerStacks:{SB:stack,BB:stack},actionHistory:[],
          tags:['open_shove','push_fold','heads_up_2max','blind_war'],
          provenance:{strategySource:'POKER_SOLVER_PUSHFOLD',license:'MIT',upstream:'amaster97/poker_solver'}
        },
        strategy:jamStrategy
      });
      out.push({
        id:'pushfold-hu-bb-'+stack+'bb',
        solver:'POKER_SOLVER_PUSHFOLD',
        version:String(pf.version||'v1'),
        solveId:'pushfold-hu-bb-'+stack,
        convergence:{exploitabilityBbPer100:expl,iterations:Number(pf.iterations_per_solve)||0},
        scenario:{
          gameType:'TOURNAMENT',street:'PRE-FLOP',tableSize:2,trainingTableSize:2,
          heroPosition:'BB',villainPosition:'SB',effectiveStack:stack,pot:stack+1,board:[],
          positions:['SB','BB'],playerStacks:{SB:stack,BB:stack},
          actionHistory:[{position:'SB',action:'ALL IN',kind:'jam',to:stack}],
          tags:['call_shove','push_fold','heads_up_2max','blind_war'],
          provenance:{strategySource:'POKER_SOLVER_PUSHFOLD',license:'MIT',upstream:'amaster97/poker_solver'}
        },
        strategy:callStrategy
      });
    }
    return out;
  }

  function applySuitVariant(spot,variant){
    const index=Math.max(0,Math.min(SUIT_PERMS.length-1,Number(variant)||0));
    if(index===0)return spot;
    const perm=SUIT_PERMS[index];
    if(Array.isArray(spot?.scenario?.board)){
      spot.scenario.board=spot.scenario.board.map(card=>transformCard(card,perm));
    }
    if(isExactHand(spot?.hand))spot.hand=transformExactHand(spot.hand,perm);
    if(Array.isArray(spot?.heroCards))spot.heroCards=spot.heroCards.map(card=>transformCard(card,perm));
    if(Array.isArray(spot?.strategy)){
      spot.strategy=spot.strategy.map(entry=>({
        ...entry,
        hand:isExactHand(entry?.hand)?transformExactHand(entry.hand,perm):entry?.hand
      }));
    }
    spot.suitVariant=index;
    return spot;
  }

  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object'){
      return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
    }
    return value;
  }

  function hash(text){
    let h1=0x811c9dc5,h2=0x9e3779b9;
    const s=String(text||'');
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      h1=Math.imul(h1^c,0x01000193);
      h2=Math.imul(h2^c,0x85ebca6b);
    }
    return ((h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0'));
  }

  function randomInt(max){
    if(max<=1)return 0;
    try{
      if(global.crypto?.getRandomValues){
        const a=new Uint32Array(1);
        global.crypto.getRandomValues(a);
        return Math.floor((a[0]/4294967296)*max);
      }
    }catch(_){}
    return Math.floor(Math.random()*max);
  }

  function shuffle(array){
    const out=[...array];
    for(let i=out.length-1;i>0;i--){
      const j=randomInt(i+1);
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  }

  function normStreet(value){
    const s=String(value||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
    return ['PRE-FLOP','FLOP','TURN','RIVER'].includes(s)?s:null;
  }

  function normPosition(value){
    const p=String(value||'').toUpperCase();
    return p||null;
  }

  function normPhase(value){
    const raw=String(value||'').trim().toLowerCase();
    const map={
      early:'EARLY',
      middle:'MIDDLE',
      bubble:'BUBBLE',
      late:'LATE',
      ft:'FINAL_TABLE',
      final_table:'FINAL_TABLE',
      'final table':'FINAL_TABLE'
    };
    return map[raw]||String(value||'').toUpperCase()||null;
  }

  function normTournamentType(value){
    const raw=String(value||'').trim().toLowerCase();
    const map={
      regular:'REGULAR',
      turbo:'TURBO',
      pko:'PKO',
      freeze:'FREEZEOUT',
      freezeout:'FREEZEOUT',
      hroller:'HIGH_ROLLER',
      high_roller:'HIGH_ROLLER',
      'high roller':'HIGH_ROLLER',
      sng:'SNG'
    };
    return map[raw]||String(value||'').toUpperCase()||null;
  }

  function parseSpecial(value){
    if(!value)return {};
    if(typeof value==='object'&&!Array.isArray(value))return value;
    try{
      const parsed=JSON.parse(String(value));
      return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
    }catch(_){
      return {};
    }
  }

  function values(value,map){
    const raw=Array.isArray(value)?value:(value===undefined||value===null||value===''?[]:[value]);
    return [...new Set(raw.map(map||String).filter(v=>v!==null&&v!==undefined&&v!==''))];
  }

  function normalizedFilters(filters){
    const f=filters||{};
    const streets=values(f.streets??f.street,normStreet);
    const heroPositions=values(f.heroPositions??f.heroPosition,normPosition);
    const effectiveStacks=values(f.effectiveStacks??f.effectiveStack,v=>{
      const n=Number(v);return Number.isFinite(n)&&n>0?n:null;
    });
    const phases=values(f.phases??f.phase,normPhase);
    return {
      gameType:f.gameType?String(f.gameType).toUpperCase():null,
      street:streets.length===1?streets[0]:null,
      streets,
      heroPosition:heroPositions.length===1?heroPositions[0]:null,
      heroPositions,
      effectiveStack:effectiveStacks.length===1?effectiveStacks[0]:null,
      effectiveStacks,
      phase:phases.length===1?phases[0]:null,
      phases,
      tableSize:Number.isFinite(Number(f.tableSize))?Number(f.tableSize):null,
      tournamentType:f.tournamentType?normTournamentType(f.tournamentType):null,
      fieldSize:f.fieldSize?String(f.fieldSize):null,
      opponentProfile:f.opponentProfile?String(f.opponentProfile):null,
      seats:f.seats?String(f.seats):null,
      sampleSize:Number.isFinite(Number(f.sampleSize))?Number(f.sampleSize):null,
      extras:Array.isArray(f.extras)?[...f.extras]:[],
      special:parseSpecial(f.special)
    };
  }

  function filterKey(filters){
    return hash(JSON.stringify(stable(normalizedFilters(filters))));
  }

  function actionLine(scenario){
    return (scenario?.actionHistory||[]).map(a=>[
      String(a.position||a.player||a.actor||''),
      String(a.kind||a.action||a.label||''),
      Number(a.to??a.amount??a.size??0)||0
    ]);
  }

  function exactSignature(spot,hand){
    const s=spot?.scenario||{};
    return hash(JSON.stringify(stable({
      street:normStreet(s.street),
      gameType:s.gameType||null,
      tableSize:s.tableSize??null,
      heroPosition:s.heroPosition||null,
      villainPosition:s.villainPosition||null,
      effectiveStack:Number(s.effectiveStack)||0,
      heroStack:Number(s.heroStack??s.effectiveStack)||0,
      phase:s.phase||null,
      tournamentType:s.tournamentType||null,
      fieldSize:s.fieldSize||null,
      opponentProfile:s.opponentProfile||null,
      pot:Number(s.pot)||0,
      board:s.board||[],
      actionLine:actionLine(s),
      hand:String(hand||spot?.hand||''),
      solver:spot?.solver||null,
      solveId:spot?.solveId||null
    })));
  }

  function variantSignature(spot,hand,variant){
    const s=spot?.scenario||{};
    const perm=SUIT_PERMS[Math.max(0,Math.min(SUIT_PERMS.length-1,Number(variant)||0))];
    const transformedHand=isExactHand(hand)?transformExactHand(hand,perm):String(hand||'');
    const transformedBoard=(s.board||[]).map(card=>transformCard(card,perm));
    return hash(JSON.stringify(stable({
      street:normStreet(s.street),
      gameType:s.gameType||null,
      tableSize:s.tableSize??null,
      heroPosition:s.heroPosition||null,
      villainPosition:s.villainPosition||null,
      effectiveStack:Number(s.effectiveStack)||0,
      pot:Number(s.pot)||0,
      board:transformedBoard,
      actionLine:actionLine(s),
      hand:transformedHand,
      solver:spot?.solver||null,
      solveId:spot?.solveId||null
    })));
  }

  function presentationSignature(spot,hand,heroCards,suitVariant){
    if(Array.isArray(heroCards)&&heroCards.length===2){
      const s=spot?.scenario||{};
      return hash(JSON.stringify(stable({
        street:normStreet(s.street),gameType:s.gameType||null,tableSize:s.tableSize??null,
        heroPosition:s.heroPosition||null,villainPosition:s.villainPosition||null,
        effectiveStack:Number(s.effectiveStack)||0,pot:Number(s.pot)||0,
        board:s.board||[],actionLine:actionLine(s),hand:String(hand||''),
        heroCards:[...heroCards],solver:spot?.solver||null,solveId:spot?.solveId||null
      })));
    }
    return variantSignature(spot,hand,suitVariant||0);
  }

  function familySignature(spot){
    const s=spot?.scenario||{};
    return hash(JSON.stringify(stable({
      street:normStreet(s.street),
      heroPosition:s.heroPosition||null,
      villainPosition:s.villainPosition||null,
      effectiveStack:Number(s.effectiveStack)||0,
      heroStack:Number(s.heroStack??s.effectiveStack)||0,
      phase:s.phase||null,
      tournamentType:s.tournamentType||null,
      fieldSize:s.fieldSize||null,
      board:s.board||[],
      actionLine:actionLine(s),
      matchup:spot?.matchup||null
    })));
  }

  function storage(){
    return global.StackUpGrinder?.storage||null;
  }

  function loadSeen(){
    try{
      const raw=storage()?.get?.(STORAGE_KEY,[]);
      return Array.isArray(raw)?raw.filter(x=>typeof x==='string').slice(-MAX_PERSISTED_SEEN):[];
    }catch(_){
      return [];
    }
  }

  let seenOrder=loadSeen();
  let seen=new Set(seenOrder);
  const recentFamilies=[];
  const recentPositions=[];

  function persistSeen(){
    try{storage()?.set?.(STORAGE_KEY,seenOrder.slice(-MAX_PERSISTED_SEEN));}catch(_){}
  }

  function markSeen(signature){
    if(seen.has(signature))return;
    seen.add(signature);
    seenOrder.push(signature);
    if(seenOrder.length>MAX_PERSISTED_SEEN){
      const drop=seenOrder.splice(0,seenOrder.length-MAX_PERSISTED_SEEN);
      drop.forEach(x=>seen.delete(x));
    }
    persistSeen();
  }

  function pushRecent(list,value,max){
    if(!value)return;
    list.push(value);
    while(list.length>max)list.shift();
  }

  function boardTags(board){
    const cards=(Array.isArray(board)?board:[]).map(String).filter(Boolean);
    if(cards.length<3)return [];
    const rankValue={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,'10':10,J:11,Q:12,K:13,A:14};
    const ranks=cards.map(c=>c.slice(0,-1).toUpperCase()).map(r=>rankValue[r]||0);
    const suits=cards.map(c=>c.slice(-1).toLowerCase());
    const uniqueRanks=new Set(ranks);
    const suitCounts={};
    suits.forEach(s=>suitCounts[s]=(suitCounts[s]||0)+1);
    const tags=[];
    const max=Math.max(...ranks),min=Math.min(...ranks);
    if(uniqueRanks.size<ranks.length)tags.push('board_paired');
    if(Math.max(...Object.values(suitCounts))>=3)tags.push('board_monotone');
    else if(Object.values(suitCounts).some(n=>n===2))tags.push('board_twotone');
    if(max>=12)tags.push('board_high_card');
    if(max<=9)tags.push('board_low');
    const sorted=[...new Set(ranks)].sort((a,b)=>a-b);
    let minSpan=99;
    for(let i=0;i<sorted.length;i++)for(let j=i+2;j<sorted.length;j++)minSpan=Math.min(minSpan,sorted[j]-sorted[i]);
    const connected=minSpan<=4||(max-min<=5&&uniqueRanks.size>=3);
    if(connected)tags.push('board_connected','board_dynamic');
    else tags.push('board_dry','board_static');
    return tags;
  }

  function spotTags(spot){
    const raw=spot?.tags||spot?.scenario?.tags||spot?.scenario?.special||[];
    const tags=new Set();
    if(Array.isArray(raw))raw.forEach(x=>tags.add(String(x)));
    else if(raw&&typeof raw==='object')Object.values(raw).flat().forEach(x=>tags.add(String(x)));

    const scenario=spot?.scenario||{};
    const street=normStreet(scenario.street);
    const hero=normPosition(scenario.heroPosition);
    const villain=normPosition(scenario.villainPosition);
    const id=String(spot?.id||'').toLowerCase();
    const matchup=String(spot?.matchup||'');

    if(street==='PRE-FLOP'&&id.includes('rfi')){
      tags.add('open_by_pos');
      if(hero==='SB')tags.add('blind_war');
    }
    if(hero==='BB'){
      if(villain==='UTG')tags.add('bb_ep');
      else if(['HJ','CO'].includes(villain))tags.add('bb_mp');
      else if(['BTN','SB'].includes(villain))tags.add('bb_lp');
    }
    if(hero==='SB'){
      if(villain==='UTG')tags.add('sb_ep');
      else if(['HJ'].includes(villain))tags.add('sb_mp');
      else if(['CO','BTN'].includes(villain))tags.add('sb_cobtn');
    }
    if(/CO vs BTN/i.test(matchup))tags.add('attack_cobtn');
    boardTags(scenario.board).forEach(x=>tags.add(x));

    function sizingPct(action){
      const label=String(action?.action||action?.label||'').toLowerCase();
      const direct=Number(action?.to??action?.size??action?.amount);
      if(Number.isFinite(direct)){
        if(direct<=3)return direct*100;
        return direct;
      }
      let m=label.match(/(\d+(?:\.\d+)?)\s*%/);
      if(m)return Number(m[1]);
      m=label.match(/bet\s+(\d+)\s*\/\s*(\d+)/);
      if(m&&Number(m[2]))return Number(m[1])/Number(m[2])*100;
      m=label.match(/bet\s+(\d+(?:\.\d+)?)x/);
      if(m)return Number(m[1])*100;
      return null;
    }
    const actions=(spot?.strategy||[]).flatMap(h=>h?.actions||[]);
    const history=Array.isArray(scenario.actionHistory)?scenario.actionHistory:[];
    const last=history[history.length-1]||null;
    const lastKind=String(last?.kind||last?.action||'').toLowerCase();
    const facingAggression=last&&
      String(last?.position||last?.player||'').toUpperCase()!==hero&&
      (/raise|bet|jam|all\s*-?\s*in/.test(lastKind));
    if(facingAggression){
      tags.add('pot_odds');
      tags.add('mdf');
      tags.add('breakeven_call');
    }

    const currentBet=Number(scenario.currentBet||0);
    const hasOpenBet=(spot?.strategy||[]).some(h=>(h?.actions||[]).some(a=>{
      const label=String(a?.action||a?.label||'').toLowerCase();
      return /\bbet\b|\braise\b/.test(label);
    }));
    if((!Number.isFinite(currentBet)||currentBet<=0)&&hasOpenBet)tags.add('breakeven_bluff');

    if(scenario.heroRange&&scenario.villainRange)tags.add('combos');
    if(['FLOP','TURN'].includes(street)&&scenario.heroRange&&scenario.villainRange){
      tags.add('equity_realization');
    }
    const exactPostflop=street!=='PRE-FLOP'&&(spot?.strategy||[]).some(h=>isExactHand(h?.hand));
    if(exactPostflop)tags.add('blockers');

    for(const a of actions){
      const label=String(a?.action||a?.label||'').toLowerCase();
      const n=sizingPct(a);
      if(/\ball\s*-?\s*in\b|\bjam\b|\bshove\b/.test(label))tags.add('open_shove');
      if(label.includes('bet')||label.includes('raise')){
        if(Number.isFinite(n)){
          if(Math.abs(n-25)<2)tags.add('bet_25');
          if(Math.abs(n-33)<3)tags.add('bet_33');
          if(Math.abs(n-50)<3)tags.add('bet_50');
          if(Math.abs(n-66)<3)tags.add('bet_66');
          if(Math.abs(n-75)<3)tags.add('bet_75');
          if(Math.abs(n-100)<4)tags.add('pot_bet');
          if(Math.abs(n-125)<5)tags.add('overbet_125');
          if(Math.abs(n-150)<5)tags.add('overbet_150');
        }
      }
    }
    return tags;
  }

  function exactCardsFromHand(hand){
    const text=String(hand||'').replace(/10/g,'T');
    const m=text.match(/^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i);
    return m?[m[1].toUpperCase()+m[2].toLowerCase(),m[3].toUpperCase()+m[4].toLowerCase()]:[];
  }

  function cardRankValue(card){
    const r=String(card||'').slice(0,-1).toUpperCase();
    return ({2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14})[r]||0;
  }

  function drawProfile(spot,hand){
    const hero=exactCardsFromHand(hand);
    const board=(spot?.scenario?.board||[]).map(x=>String(x).replace(/^10/i,'T'));
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

    return Object.freeze({
      flushDraw,
      nonNutFlushDraw,
      straightDraw,
      anyDraw:flushDraw||straightDraw
    });
  }

  function spotFacesAggression(spot){
    const s=spot?.scenario||{};
    const hero=normPosition(s.heroPosition);
    const h=Array.isArray(s.actionHistory)?s.actionHistory:[];
    const last=h[h.length-1]||null;
    if(!last)return false;
    const actor=normPosition(last.position||last.player||last.actor);
    const kind=String(last.kind||last.action||'').toLowerCase();
    return actor!==hero&&/raise|bet|jam|all\s*-?\s*in/.test(kind);
  }

  const HAND_LEVEL_MATH=new Set(['implied_odds','reverse_implied_odds']);

  function candidateMathCompatible(spot,hand,special){
    const requested=(special?.math_special||[]).map(String);
    if(requested.length){
      // MATH stays OR across selected alternatives, including hand-level odds
      // and scenario-level tags.
      const tags=spotTags(spot);
      const street=normStreet(spot?.scenario?.street);
      let profile=null;
      const mathOk=requested.some(id=>{
        if(id==='implied_odds'||id==='reverse_implied_odds'){
          if(!['FLOP','TURN'].includes(street))return false;
          profile=profile||drawProfile(spot,hand);
          if(!profile)return false;
          if(id==='implied_odds')return spotFacesAggression(spot)&&profile.anyDraw;
          return profile.nonNutFlushDraw;
        }
        return tags.has(id);
      });
      if(!mathOk)return false;
    }

    // Hand-level solved classifiers only classify decisions that are already
    // solver-resolved. They never create strategy or coverage.
    const classifier=global.StackUpSolvedSpotClassifier;
    if(classifier?.isHandLevel&&classifier?.qualifies){
      const tags=spotTags(spot);
      for(const [section,values] of Object.entries(special||{})){
        if(section==='math_special')continue;
        const selected=(Array.isArray(values)?values:[]).map(String);
        const handLevel=selected.filter(id=>classifier.isHandLevel(section,id));
        if(!handLevel.length)continue;
        const spotLevel=selected.filter(id=>!classifier.isHandLevel(section,id));
        if(spotLevel.some(id=>tags.has(id)))continue;
        if(!handLevel.some(id=>classifier.qualifies(section,id,spot,hand)))return false;
      }
    }
    return true;
  }

  function specialStreetCompatible(spot,special){
    const street=normStreet(spot?.scenario?.street);
    for(const [section,values] of Object.entries(special||{})){
      if(!Array.isArray(values)||!values.length)continue;
      if(['pre_special','blind_special','short_special','icm_special','pko_special'].includes(section)){
        if(street!=='PRE-FLOP')return false;
      }else if(section==='aggr_special'){
        const domains=values.flatMap(id=>String(id)==='pot_4bet'?['FLOP','TURN','RIVER']:['PRE-FLOP']);
        if(!domains.includes(street))return false;
      }else if(section==='river_special'){
        if(street!=='RIVER')return false;
      }else if(['post_special','texture_special'].includes(section)){
        if(!['FLOP','TURN','RIVER'].includes(street))return false;
      }
    }
    return true;
  }

  function hasRequestedSpecial(spot,special){
    const groups=Object.entries(special||{}).filter(([,v])=>Array.isArray(v)&&v.length);
    if(!groups.length)return true;
    if(!specialStreetCompatible(spot,special))return false;
    const tags=spotTags(spot);
    const classifier=global.StackUpSolvedSpotClassifier;
    return groups.every(([section,values])=>{
      // MATH is evaluated per hand in candidateMathCompatible to preserve OR.
      if(section==='math_special')return true;
      const selected=values.map(String);
      const handLevel=selected.filter(x=>classifier?.isHandLevel?.(section,x));
      const spotLevel=selected.filter(x=>!classifier?.isHandLevel?.(section,x));
      if(spotLevel.some(x=>tags.has(x)))return true;
      if(handLevel.length)return true;
      return !spotLevel.length;
    });
  }

  function compatible(spot,filters){
    const s=spot?.scenario||{};
    const street=normStreet(s.street);
    const heroPosition=normPosition(s.heroPosition);
    if(filters.streets.length&&!filters.streets.includes(street))return false;
    if(filters.heroPositions.length&&!filters.heroPositions.includes(heroPosition))return false;
    if(filters.gameType){
      if(!s.gameType||String(s.gameType).toUpperCase()!==filters.gameType)return false;
    }
    if(filters.effectiveStacks.length){
      const stack=Number(s.heroStack??s.effectiveStack);
      if(!Number.isFinite(stack)||!filters.effectiveStacks.some(v=>Math.abs(stack-v)<.01))return false;
    }
    if(filters.phases.length){
      const phase=String(s.phase||'');
      if(!phase||!filters.phases.includes(phase))return false;
    }
    if(filters.tournamentType){
      const t=normTournamentType(s.tournamentType);
      if(!t||t!==filters.tournamentType)return false;
    }
    if(filters.fieldSize){
      const field=String(s.fieldSize||'');
      if(!field||field!==String(filters.fieldSize))return false;
    }
    if(filters.opponentProfile){
      const profile=String(s.opponentProfile||'');
      if(!profile||profile!==String(filters.opponentProfile))return false;
    }
    if(filters.extras.length){
      const extras=Array.isArray(s.extras)?s.extras.map(String):[];
      if(!filters.extras.every(x=>extras.includes(String(x))))return false;
    }
    const actualTableSize=Number(s.trainingTableSize??s.tableSize);
    if(filters.tableSize){
      if(!Number.isFinite(actualTableSize)||actualTableSize!==filters.tableSize)return false;
    }else if(actualTableSize===2){
      // RANDOM / no MESA filter must not silently collapse the trainer into heads-up.
      // Heads-up remains available only when the user explicitly selects HEADS UP.
      return false;
    }
    if(!hasRequestedSpecial(spot,filters.special))return false;
    return true;
  }

  function expand(bank,filters){
    // Runtime candidate universe must mirror the strict coverage auditor.
    // Every counted solved bank is loaded here; STRICT_SOLVED_ONLY validation
    // below remains the final gate for every scenario + hand decision.
    const all=[
      ...(bank?.preflop||[]),
      ...(bank?.postflop||[]),
      ...pushfoldSpots(bank),
      ...((bank?.tournament?.spots)||[]),
      ...((bank?.reentry?.spots)||[]),
      ...((bank?.opponentProfile?.spots)||[]),
      ...((bank?.multiwayTournament?.spots)||[]),
      ...((bank?.multiwayPostflop?.spots)||[]),
      ...((bank?.preflopDecisions?.spots)||[]),
      ...((bank?.preflop9max?.spots)||[]),
      ...((bank?.preflopMultistack?.spots)||[]),
      ...((bank?.preflopHu?.spots)||[]),
      ...((bank?.textureSizing?.spots)||[]),
      ...((bank?.lineBank?.spots)||[])
    ];
    const candidates=[];
    const contract=global.StackUpSolvedSpotContract;
    for(let spotIndex=0;spotIndex<all.length;spotIndex++){
      const spot=all[spotIndex];
      if(!compatible(spot,filters))continue;
      const hands=(spot.strategy||[]).filter(h=>h?.hand&&Array.isArray(h.actions)&&h.actions.length);
      for(let handIndex=0;handIndex<hands.length;handIndex++){
        const entry=hands[handIndex];
        const hand=String(entry.hand);
        if(!candidateMathCompatible(spot,hand,filters.special))continue;
        const verdict=contract?.validateSolvedDecision
          ?contract.validateSolvedDecision(spot,entry)
          :{ok:true,id:exactSignature(spot,hand)};
        if(!verdict?.ok)continue;
        const exact=verdict.id||exactSignature(spot,hand);
        candidates.push({
          spotIndex,spot,hand,suitVariant:0,exact,
          solvedDecisionId:exact,
          family:familySignature(spot),
          position:normPosition(spot?.scenario?.heroPosition),
          street:normStreet(spot?.scenario?.street)
        });
      }
    }
    return candidates;
  }

  function coverageFloor(filters){
    const f=normalizedFilters(filters);
    const catalogFloor=Number(global.StackUpScenarioCatalog?.MIN_SPOTS)||1500;
    return Math.max(catalogFloor,Number(f.sampleSize)||0);
  }

  function bagFor(bank,filters){
    const key=filterKey(filters);
    let bag=bags.get(key);
    if(!bag||!bag.remaining.length){
      const normalized=normalizedFilters(filters);
      const candidates=expand(bank,normalized);
      const required=coverageFloor(normalized);
      bag={
        key,
        candidates,
        required,
        publishable:candidates.length>=required,
        remaining:candidates.length>=required?shuffle(candidates.map((_,i)=>i)):[],
        cycle:(bag?.cycle||0)+1
      };
      bags.set(key,bag);
    }
    return bag;
  }

  function chooseFromBag(bag){
    if(!bag?.remaining?.length)return null;
    let fallback=null;
    let fallbackAt=-1;
    const scan=Math.min(bag.remaining.length,Math.max(32,MAX_RECENT_FAMILIES*8));
    for(let offset=0;offset<scan;offset++){
      const ri=bag.remaining.length-1-offset;
      const candidate=bag.candidates[bag.remaining[ri]];
      if(!candidate)continue;
      if(!fallback){fallback=candidate;fallbackAt=ri;}
      if(seen.has(candidate.exact))continue;
      const familyHot=recentFamilies.includes(candidate.family);
      const posHot=recentPositions.length>=2&&recentPositions.slice(-2).every(x=>x===candidate.position);
      if(!familyHot&&!posHot){
        bag.remaining.splice(ri,1);
        return candidate;
      }
    }
    // Relax structural spacing before allowing an exact repeat.
    for(let ri=bag.remaining.length-1;ri>=0;ri--){
      const candidate=bag.candidates[bag.remaining[ri]];
      if(candidate&&!seen.has(candidate.exact)){
        bag.remaining.splice(ri,1);
        return candidate;
      }
    }
    if(fallback){
      bag.remaining.splice(fallbackAt,1);
      return fallback;
    }
    return null;
  }

  function pick(bank,filters){
    let bag=bagFor(bank,filters);
    if(!bag.candidates.length||!bag.publishable)return null;

    let candidate=chooseFromBag(bag);
    if(!candidate&&bag.remaining.length===0){
      bags.delete(bag.key);
      bag=bagFor(bank,filters);
      candidate=chooseFromBag(bag);
    }
    if(!candidate)return null;

    const spot=clone(candidate.spot);
    spot.hand=candidate.hand;
    spot.solvedSpotId=candidate.solvedDecisionId||candidate.exact;
    spot.validationMode='STRICT_SOLVED_ONLY';
    spot.trainingSignature=candidate.exact;
    spot.trainingFamily=candidate.family;
    spot.trainingCycle=bag.cycle;
    spot.id=String(spot.id||spot.solveId||'solver-spot')+'-'+candidate.hand+'-'+candidate.exact.slice(0,8);

    markSeen(candidate.exact);
    pushRecent(recentFamilies,candidate.family,MAX_RECENT_FAMILIES);
    pushRecent(recentPositions,candidate.position,MAX_RECENT_POSITIONS);
    return spot;
  }

  function resetSession(){
    bags.clear();
    recentFamilies.length=0;
    recentPositions.length=0;
  }

  function clearSeen(){
    seenOrder=[];
    seen=new Set();
    try{storage()?.set?.(STORAGE_KEY,[]);}catch(_){}
    resetSession();
  }

  function stats(bank,filters){
    const candidates=expand(bank,normalizedFilters(filters));
    const unique=new Set(candidates.map(x=>x.exact));
    const unseen=candidates.reduce((n,x)=>n+(seen.has(x.exact)?0:1),0);
    const required=coverageFloor(filters);
    return Object.freeze({
      candidates:candidates.length,
      unique:unique.size,
      unseen,
      seen:candidates.length-unseen,
      required,
      publishable:candidates.length>=required,
      shortfall:Math.max(0,required-candidates.length),
      filterKey:filterKey(filters)
    });
  }

  global.StackUpTrainingSequencer=Object.freeze({
    normalizedFilters,
    filterKey,
    exactSignature,
    familySignature,
    handClassCombos,
    drawProfile,
    candidateMathCompatible,
    coverageFloor,
    pick,
    stats,
    resetSession,
    clearSeen
  });
})(window);
