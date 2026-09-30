/* StackUp Hold'em Grinder EVO — Training Sequencer V2.
   Expands solver scenarios into hand-level training candidates, shuffles them,
   and prevents exact/structural repetition without changing solver strategy. */
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
    const phases=values(f.phases??f.phase,v=>String(v));
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
      tournamentType:f.tournamentType?String(f.tournamentType):null,
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

  function familySignature(spot){
    const s=spot?.scenario||{};
    return hash(JSON.stringify(stable({
      street:normStreet(s.street),
      heroPosition:s.heroPosition||null,
      villainPosition:s.villainPosition||null,
      effectiveStack:Number(s.effectiveStack)||0,
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

    const actions=(spot?.strategy||[]).flatMap(h=>h?.actions||[]);
    for(const a of actions){
      const label=String(a?.action||a?.label||'').toLowerCase();
      const n=Number(a?.to??a?.size??a?.amount);
      if(label.includes('all')||label.includes('jam'))tags.add('open_shove');
      if(label.includes('bet')||label.includes('raise')){
        if(Number.isFinite(n)){
          if(Math.abs(n-25)<2)tags.add('bet_25');
          if(Math.abs(n-33)<3)tags.add('bet_33');
          if(Math.abs(n-50)<3)tags.add('bet_50');
          if(Math.abs(n-66)<3)tags.add('bet_66');
          if(Math.abs(n-75)<3)tags.add('bet_75');
        }
      }
    }
    return tags;
  }

  function hasRequestedSpecial(spot,special){
    const groups=Object.entries(special||{}).filter(([,v])=>Array.isArray(v)&&v.length);
    if(!groups.length)return true;
    const tags=spotTags(spot);
    return groups.every(([,values])=>values.some(x=>tags.has(String(x))));
  }

  function compatible(spot,filters){
    const s=spot?.scenario||{};
    const street=normStreet(s.street);
    const heroPosition=normPosition(s.heroPosition);
    if(filters.streets.length&&!filters.streets.includes(street))return false;
    if(filters.heroPositions.length&&!filters.heroPositions.includes(heroPosition))return false;
    if(filters.gameType&&s.gameType&&String(s.gameType).toUpperCase()!==filters.gameType)return false;
    if(filters.effectiveStacks.length){
      const stack=Number(s.effectiveStack);
      if(Number.isFinite(stack)&&!filters.effectiveStacks.some(v=>Math.abs(stack-v)<.01))return false;
    }
    if(filters.phases.length&&s.phase&&!filters.phases.includes(String(s.phase)))return false;
    if(filters.tableSize&&Number(s.tableSize)&&Number(s.tableSize)!==filters.tableSize){
      // Current static bank is 6-max solver data rendered on a 10-seat training table.
      // Enforce tableSize only when scenario explicitly opts into trainingTableSize semantics.
      if(s.trainingTableSize!==undefined&&Number(s.trainingTableSize)!==filters.tableSize)return false;
    }
    if(!hasRequestedSpecial(spot,filters.special))return false;
    return true;
  }

  function expand(bank,filters){
    const all=[...(bank?.preflop||[]),...(bank?.postflop||[])];
    const candidates=[];
    for(let spotIndex=0;spotIndex<all.length;spotIndex++){
      const spot=all[spotIndex];
      if(!compatible(spot,filters))continue;
      const hands=(spot.strategy||[]).filter(h=>h?.hand&&Array.isArray(h.actions)&&h.actions.length);
      for(let handIndex=0;handIndex<hands.length;handIndex++){
        const hand=String(hands[handIndex].hand);
        const variants=isExactHand(hand)?SUIT_PERMS.length:1;
        const signatures=new Set();
        for(let suitVariant=0;suitVariant<variants;suitVariant++){
          const exact=variantSignature(spot,hand,suitVariant);
          if(signatures.has(exact))continue;
          signatures.add(exact);
          candidates.push({
            spotIndex,
            spot,
            hand,
            suitVariant,
            exact,
            family:familySignature(spot),
            position:normPosition(spot?.scenario?.heroPosition),
            street:normStreet(spot?.scenario?.street)
          });
        }
      }
    }
    return candidates;
  }

  function bagFor(bank,filters){
    const key=filterKey(filters);
    let bag=bags.get(key);
    if(!bag||!bag.remaining.length){
      const candidates=expand(bank,normalizedFilters(filters));
      bag={
        key,
        candidates,
        remaining:shuffle(candidates.map((_,i)=>i)),
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
    if(!bag.candidates.length)return null;

    let candidate=chooseFromBag(bag);
    if(!candidate&&bag.remaining.length===0){
      bags.delete(bag.key);
      bag=bagFor(bank,filters);
      candidate=chooseFromBag(bag);
    }
    if(!candidate)return null;

    const spot=clone(candidate.spot);
    spot.hand=candidate.hand;
    applySuitVariant(spot,candidate.suitVariant||0);
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
    return Object.freeze({
      candidates:candidates.length,
      unique:unique.size,
      unseen,
      seen:candidates.length-unseen,
      filterKey:filterKey(filters)
    });
  }

  global.StackUpTrainingSequencer=Object.freeze({
    normalizedFilters,
    filterKey,
    exactSignature,
    familySignature,
    pick,
    stats,
    resetSession,
    clearSeen
  });
})(window);
