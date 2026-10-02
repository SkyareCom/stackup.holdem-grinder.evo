/* StackUp Solved Spot Classifier v1
   Portable hand-level classification on top of validated solver output.
   It never creates strategy; it only decides whether an already-solved
   scenario+hand belongs to a semantic training filter. */
(function(global){
  'use strict';

  const VALUE_4BET_CLASSES=new Set(['AA','KK','QQ','JJ','AKS','AKO','AQS']);

  function normStreet(value){
    return String(value||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
  }
  function isExactHand(hand){
    return /^(?:10|[2-9TJQKA])[cdhs](?:10|[2-9TJQKA])[cdhs]$/i.test(String(hand||''));
  }
  function exactCards(hand){
    const t=String(hand||'').replace(/10/g,'T');
    const m=t.match(/^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i);
    return m?[m[1].toUpperCase()+m[2].toLowerCase(),m[3].toUpperCase()+m[4].toLowerCase()]:[];
  }
  function cardRank(card){
    return ({2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14})[String(card||'').slice(0,-1).toUpperCase()]||0;
  }
  function actionKind(action){
    const raw=String(action?.kind||action?.action||action?.label||'').toLowerCase().replace(/[ _-]+/g,'');
    if(raw.includes('fold'))return 'fold';
    if(raw.includes('check'))return 'check';
    if(raw.includes('call'))return 'call';
    if(raw.includes('allin')||raw.includes('jam')||raw.includes('shove'))return 'jam';
    if(raw.includes('raise')||raw.includes('bet'))return 'raise';
    return raw||'unknown';
  }
  function sizingPct(action){
    const direct=Number(action?.sizingPct);
    if(Number.isFinite(direct))return direct;
    const label=String(action?.action||action?.label||'').toLowerCase();
    let m=label.match(/(\d+(?:\.\d+)?)\s*%/);
    if(m)return Number(m[1]);
    m=label.match(/(?:bet|raise)\s+(\d+)\s*\/\s*(\d+)/);
    if(m&&Number(m[2]))return Number(m[1])/Number(m[2])*100;
    m=label.match(/(?:bet|raise)\s+(\d+(?:\.\d+)?)x/);
    if(m)return Number(m[1])*100;
    return null;
  }
  function tags(spot){
    const raw=spot?.scenario?.tags||spot?.tags||[];
    return new Set(Array.isArray(raw)?raw.map(String):[]);
  }
  function strategyEntry(spot,entryOrHand){
    if(entryOrHand&&typeof entryOrHand==='object'&&!Array.isArray(entryOrHand))return entryOrHand;
    const target=String(entryOrHand||'').toUpperCase().replace(/10/g,'T');
    return (spot?.strategy||[]).find(x=>String(x?.hand||'').toUpperCase().replace(/10/g,'T')===target)||null;
  }
  function sumFrequency(entry,predicate){
    return (entry?.actions||[]).reduce((sum,a)=>sum+(predicate(a)?Math.max(0,Number(a.frequency)||0):0),0);
  }
  function preflopClass(hand){
    return String(hand||'').trim().toUpperCase().replace(/10/g,'T');
  }
  function madeHandCategory(hand,board){
    const hero=exactCards(hand);
    const b=(board||[]).map(x=>String(x).replace(/^10/i,'T'));
    if(hero.length!==2||b.length!==5)return -1;
    const cards=[...hero,...b];
    const ranks=cards.map(cardRank).filter(Boolean);
    const suits=cards.map(c=>String(c).slice(-1).toLowerCase());
    const counts=new Map();
    ranks.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
    const multiplicities=[...counts.values()].sort((a,b)=>b-a);
    const unique=[...new Set(ranks)].sort((a,b)=>a-b);
    if(unique.includes(14))unique.unshift(1);
    let straight=false;
    for(let i=0;i<=unique.length-5;i++){
      if(unique[i+4]-unique[i]===4)straight=true;
    }
    const suitCounts={};
    suits.forEach(s=>suitCounts[s]=(suitCounts[s]||0)+1);
    const flushSuit=Object.entries(suitCounts).find(([,n])=>n>=5)?.[0]||null;
    let straightFlush=false;
    if(flushSuit){
      const sr=cards.filter(c=>String(c).endsWith(flushSuit)).map(cardRank);
      const su=[...new Set(sr)].sort((a,b)=>a-b);
      if(su.includes(14))su.unshift(1);
      for(let i=0;i<=su.length-5;i++)if(su[i+4]-su[i]===4)straightFlush=true;
    }
    if(straightFlush)return 8;
    if(multiplicities[0]>=4)return 7;
    if(multiplicities[0]>=3&&multiplicities[1]>=2)return 6;
    if(flushSuit)return 5;
    if(straight)return 4;
    if(multiplicities[0]>=3)return 3;
    if(multiplicities[0]>=2&&multiplicities[1]>=2)return 2;
    if(multiplicities[0]>=2)return 1;
    return 0;
  }
  function fourBetQualifier(id,spot,entry){
    const t=tags(spot);
    if(!t.has('raise_vs_3bet')&&!t.has('cold_call_4bet'))return false;
    const aggressive=sumFrequency(entry,a=>['raise','jam'].includes(actionKind(a)));
    if(aggressive<1)return false;
    const cls=preflopClass(entry?.hand);
    if(id==='4bet_value')return VALUE_4BET_CLASSES.has(cls);
    if(id==='4bet_bluff')return !VALUE_4BET_CLASSES.has(cls);
    return false;
  }
  function riverValueQualifier(id,spot,entry){
    if(normStreet(spot?.scenario?.street)!=='RIVER'||!isExactHand(entry?.hand))return false;
    const category=madeHandCategory(entry.hand,spot?.scenario?.board||[]);
    if(category<1)return false;
    const betFreq=sumFrequency(entry,a=>['raise','jam'].includes(actionKind(a)));
    if(betFreq<1)return false;
    if(id==='value_river')return true;
    if(id==='thin_value'){
      const small=sumFrequency(entry,a=>{
        if(actionKind(a)!=='raise')return false;
        const pct=sizingPct(a);
        return Number.isFinite(pct)&&pct>=15&&pct<=50;
      });
      return category<=2&&small>=1;
    }
    return false;
  }

  const HAND_LEVEL_FILTERS=Object.freeze({
    aggr_special:Object.freeze(['4bet_bluff','4bet_value']),
    river_special:Object.freeze(['thin_value','value_river'])
  });

  function isHandLevel(section,id){
    return !!HAND_LEVEL_FILTERS[section]?.includes(String(id));
  }

  function qualifies(section,id,spot,entryOrHand){
    const entry=strategyEntry(spot,entryOrHand);
    if(!entry)return false;
    if(section==='aggr_special'&&['4bet_bluff','4bet_value'].includes(String(id))){
      return fourBetQualifier(String(id),spot,entry);
    }
    if(section==='river_special'&&['thin_value','value_river'].includes(String(id))){
      return riverValueQualifier(String(id),spot,entry);
    }
    return true;
  }

  global.StackUpSolvedSpotClassifier=Object.freeze({
    VERSION:'1.0.0',
    HAND_LEVEL_FILTERS,
    isHandLevel,
    qualifies,
    madeHandCategory,
    actionKind,
    sizingPct
  });
})(typeof window!=='undefined'?window:globalThis);
