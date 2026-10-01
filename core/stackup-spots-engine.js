/* StackUp Hold'em Grinder EVO — browser-safe solver spot engine.
   Ported from the legacy solver-backed architecture without Node/process dependencies.
   This file is intentionally UI-agnostic: it only validates, normalizes and maps solver data. */
(function(global){
  'use strict';

  const SOLVER_IDS=Object.freeze({
    DCFR:'DCFR_SOLVER',
    CFR_POKER:'CFR_POKER_SOLVER',
    PREFLOP_RANGE:'PREFLOP_RANGE_SOLVER',
    GTOPEN:'GTOPEN',
    TEXAS:'TEXAS_SOLVER',
    PUSHFOLD:'POKER_SOLVER_PUSHFOLD',
    ICM:'STACKUP_ICM'
  });

  const SOLVER_CAPABILITIES=Object.freeze({
    [SOLVER_IDS.DCFR]:Object.freeze({preflop:true,postflop:true,multiwayPreflop:true}),
    [SOLVER_IDS.CFR_POKER]:Object.freeze({preflop:true,postflop:true,multiwayPreflop:false}),
    [SOLVER_IDS.PREFLOP_RANGE]:Object.freeze({preflop:true,postflop:false,multiwayPreflop:false}),
    [SOLVER_IDS.GTOPEN]:Object.freeze({preflop:true,postflop:true,multiwayPreflop:true}),
    [SOLVER_IDS.TEXAS]:Object.freeze({preflop:false,postflop:true,multiwayPreflop:false}),
    [SOLVER_IDS.PUSHFOLD]:Object.freeze({preflop:true,postflop:false,multiwayPreflop:false}),
    [SOLVER_IDS.ICM]:Object.freeze({preflop:true,postflop:false,multiwayPreflop:true})
  });

  const REQUIRED_SCENARIO=['gameType','street','heroPosition','effectiveStack','pot','actionHistory'];
  const RANK_VALUE=Object.freeze({2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14});
  const SUITS=['s','h','d','c'];

  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object'){
      return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
    }
    return value;
  }

  function canonicalScenarioSignature(scenario){
    validateScenario(scenario);
    return JSON.stringify(stable({
      gameType:scenario.gameType,
      street:scenario.street,
      tableSize:scenario.tableSize??null,
      heroPosition:scenario.heroPosition,
      villainPosition:scenario.villainPosition??null,
      effectiveStack:scenario.effectiveStack,
      pot:scenario.pot,
      board:scenario.board??[],
      heroRange:scenario.heroRange??null,
      villainRange:scenario.villainRange??null,
      actionHistory:scenario.actionHistory,
      legalActions:scenario.legalActions??[],
      sizings:scenario.sizings??[],
      ante:scenario.ante??null,
      icm:scenario.icm??null,
      bounty:scenario.bounty??null,
      positions:scenario.positions??null,
      posts:scenario.posts??null
    }));
  }

  function validateScenario(scenario){
    if(!scenario||typeof scenario!=='object')throw new TypeError('scenario required');
    const missing=REQUIRED_SCENARIO.filter(k=>scenario[k]===undefined||scenario[k]===null);
    if(missing.length)throw new Error('incomplete solver scenario: '+missing.join(', '));
    if(!Array.isArray(scenario.actionHistory))throw new Error('actionHistory must be an array');
    const street=String(scenario.street||'').toUpperCase();
    if(!['PRE-FLOP','PREFLOP','FLOP','TURN','RIVER'].includes(street))throw new Error('invalid street');
    if(!Number.isFinite(Number(scenario.effectiveStack)))throw new Error('effectiveStack must be numeric');
    if(!Number.isFinite(Number(scenario.pot)))throw new Error('pot must be numeric');
    return scenario;
  }

  function validateSolverSpot(spot){
    if(!spot||typeof spot!=='object')throw new TypeError('solver spot required');
    validateScenario(spot.scenario);
    if(!Array.isArray(spot.strategy)||!spot.strategy.length)throw new Error('solver strategy required');
    for(const hand of spot.strategy){
      if(!hand||!hand.hand||!Array.isArray(hand.actions)||!hand.actions.length)throw new Error('invalid hand strategy');
      const total=hand.actions.reduce((sum,a)=>sum+Number(a.frequency||0),0);
      if(total>0&&Math.abs(total-100)>1.25)throw new Error('action frequencies must total approximately 100');
    }
    if(spot.solver&&SOLVER_CAPABILITIES[spot.solver]){
      const street=String(spot.scenario.street).toUpperCase().replace('PREFLOP','PRE-FLOP');
      if(street==='PRE-FLOP'&&!SOLVER_CAPABILITIES[spot.solver].preflop)throw new Error('solver cannot solve preflop');
      if(street!=='PRE-FLOP'&&!SOLVER_CAPABILITIES[spot.solver].postflop)throw new Error('solver cannot solve postflop');
    }
    return spot;
  }

  function normalizeCard(card){
    const m=String(card||'').trim().match(/^(10|[2-9TJQKA])([cdhs])$/i);
    if(!m)return null;
    return (m[1]==='10'?'T':m[1].toUpperCase())+m[2].toLowerCase();
  }

  function displayCard(card){
    const c=normalizeCard(card);
    if(!c)return null;
    return (c[0]==='T'?'10':c[0])+c[1];
  }

  function handClassFromCards(cards){
    if(!Array.isArray(cards)||cards.length<2)return null;
    const a=normalizeCard(cards[0]),b=normalizeCard(cards[1]);
    if(!a||!b)return null;
    let r1=a[0],r2=b[0],s1=a[1],s2=b[1];
    if(RANK_VALUE[r2]>RANK_VALUE[r1]){
      [r1,r2]=[r2,r1];[s1,s2]=[s2,s1];
    }
    if(r1===r2)return r1+r2;
    return r1+r2+(s1===s2?'s':'o');
  }

  function exactComboCards(hand){
    const text=String(hand||'').trim();
    const m=text.match(/^(10|[2-9TJQKA])([cdhs])(10|[2-9TJQKA])([cdhs])$/i);
    if(!m)return null;
    return [displayCard(m[1]+m[2]),displayCard(m[3]+m[4])];
  }

  function cardsForHand(hand,board){
    const exact=exactComboCards(hand);
    if(exact)return exact;
    const t=String(hand||'').trim().toUpperCase().replace(/10/g,'T');
    const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?$/);
    if(!m)return [];
    const used=new Set((board||[]).map(normalizeCard).filter(Boolean));
    const r1=m[1],r2=m[2],kind=m[3]||'';
    const candidates=[];
    for(const s1 of SUITS)for(const s2 of SUITS){
      if(r1===r2&&s1===s2)continue;
      if(kind==='S'&&s1!==s2)continue;
      if(kind==='O'&&s1===s2)continue;
      const c1=r1+s1,c2=r2+s2;
      if(used.has(c1)||used.has(c2)||c1===c2)continue;
      candidates.push([displayCard(c1),displayCard(c2)]);
    }
    return candidates[0]||[];
  }

  function normalizeActionKind(action){
    const raw=String(action?.kind||action?.action||action?.label||'').trim().toLowerCase();
    const compact=raw.replace(/[ _-]+/g,'');
    if(compact==='allin'||compact==='jam'||compact==='shove')return 'jam';
    if(compact.includes('fold'))return 'fold';
    if(compact.includes('check'))return 'check';
    if(compact.includes('call'))return 'call';
    if(compact.includes('raise')||compact.includes('bet'))return 'raise';
    return compact||'unknown';
  }

  function actionAmount(action){
    const direct=Number(action?.to??action?.amount??action?.size);
    if(Number.isFinite(direct))return direct;
    const label=String(action?.action||action?.label||'');
    const m=label.match(/(?:to|raise|bet)?\s*(\d+(?:\.\d+)?)/i);
    return m?Number(m[1]):Number.POSITIVE_INFINITY;
  }

  function mapUiActions(actions){
    const out={check:null,call:null,fold:null,raise:null,raise1:null,raise2:null,allin:null};
    const raises=[];
    for(const action of actions||[]){
      const kind=normalizeActionKind(action);
      if(kind==='check'&&!out.check)out.check=action;
      else if(kind==='call'&&!out.call)out.call=action;
      else if(kind==='fold'&&!out.fold)out.fold=action;
      else if(kind==='jam'&&!out.allin)out.allin=action;
      else if(kind==='raise')raises.push(action);
    }
    // RAISE 1 / RAISE 2 are the first two actual sizing branches exposed
    // by the solver tree, ordered from smaller to larger. The generic
    // RAISE button uses the highest-frequency raise for the current combo.
    raises.sort((a,b)=>actionAmount(a)-actionAmount(b));
    if(raises.length){
      out.raise=[...raises].sort((a,b)=>(Number(b.frequency)||0)-(Number(a.frequency)||0))[0]||raises[0];
      out.raise1=raises[0]||null;
      out.raise2=raises[1]||null;
    }
    return out;
  }

  function strategyForHand(spot,handKey){
    const target=String(handKey||'').trim().toUpperCase().replace(/10/g,'T');
    if(!target)return null;
    let found=spot.strategy.find(x=>String(x.hand||'').trim().toUpperCase().replace(/10/g,'T')===target);
    if(found)return found;
    const cards=exactComboCards(target);
    const cls=cards?handClassFromCards(cards):null;
    if(cls){
      found=spot.strategy.find(x=>String(x.hand||'').trim().toUpperCase().replace(/10/g,'T')===cls);
      if(found)return found;
    }
    return null;
  }

  function chooseTrainingHand(spot){
    const explicit=spot.hand||spot.trainingHand||spot.scenario?.hand||spot.scenario?.heroHand;
    if(explicit)return String(explicit);
    return String(spot.strategy?.[0]?.hand||'');
  }

  function normalizeBoard(board){
    return (Array.isArray(board)?board:[]).map(displayCard).filter(Boolean);
  }

  function stacksByPosition(scenario,positions,fallbackStacks){
    const out={};
    const source=scenario.playerStacks||scenario.stacks||null;
    if(source&&typeof source==='object'&&!Array.isArray(source)){
      for(const p of positions){
        const v=Number(source[p]);
        if(Number.isFinite(v))out[p]=v;
      }
    }else if(Array.isArray(source)){
      positions.forEach((p,i)=>{const v=Number(source[i]);if(Number.isFinite(v))out[p]=v;});
    }
    positions.forEach((p,i)=>{
      if(!Number.isFinite(out[p])){
        const v=Number(fallbackStacks?.[i%Math.max(1,fallbackStacks.length)]);
        out[p]=Number.isFinite(v)?v:Number(scenario.effectiveStack)||100;
      }
    });
    if(positions.includes(scenario.heroPosition)){
      const hv=Number(scenario.heroStack??scenario.effectiveStack);
      if(Number.isFinite(hv))out[scenario.heroPosition]=hv;
    }
    return out;
  }

  function toViewModel(spot,options){
    validateSolverSpot(spot);
    const opt=options||{};
    const scenario=spot.scenario;
    const positions=Array.isArray(opt.positions)&&opt.positions.length?[...opt.positions]:
      (Array.isArray(scenario.positions)&&scenario.positions.length?[...scenario.positions]:[]);
    const board=normalizeBoard(scenario.board);
    const handKey=chooseTrainingHand(spot);
    const heroCards=(Array.isArray(spot.heroCards)&&spot.heroCards.length>=2?spot.heroCards:
      Array.isArray(scenario.heroCards)&&scenario.heroCards.length>=2?scenario.heroCards:
      cardsForHand(handKey,board)).map(displayCard).filter(Boolean);
    const exactTrainingHand=exactComboCards(handKey);
    const inferredHand=exactTrainingHand?handKey:(handClassFromCards(heroCards)||handKey);
    const stackForPosition=stacksByPosition(scenario,positions,opt.fallbackStacks||[]);
    const sidePots=(Array.isArray(scenario.sidePots)?scenario.sidePots:[])
      .map(Number).filter(v=>Number.isFinite(v)&&v>0);
    return Object.freeze({
      id:spot.id||canonicalScenarioSignature(scenario),
      solver:spot.solver||null,
      solveId:spot.solveId||null,
      convergence:spot.convergence||null,
      street:String(scenario.street).toUpperCase().replace('PREFLOP','PRE-FLOP'),
      heroPosition:scenario.heroPosition,
      villainPosition:scenario.villainPosition||null,
      positions,
      board,
      heroCards,
      handKey:inferredHand,
      pot:Number(scenario.pot)||0,
      sidePots,
      stackForPosition,
      actionHistory:Array.isArray(scenario.actionHistory)?scenario.actionHistory:[],
      tableSize:Number(scenario.tableSize)||positions.length||null
    });
  }

  function evaluate(spot,handKey,uiAction){
    validateSolverSpot(spot);
    const strategy=strategyForHand(spot,handKey);
    if(!strategy)return Object.freeze({ok:false,reason:'hand_not_in_strategy',frequency:0,strategy:[]});
    const mapping=mapUiActions(strategy.actions);
    const selected=mapping[uiAction]||null;
    const normalized=strategy.actions.map(a=>({
      action:a.action||a.label||a.kind,
      kind:normalizeActionKind(a),
      to:Number.isFinite(Number(a.to))?Number(a.to):null,
      frequency:Number(a.frequency)||0,
      ev:Number.isFinite(Number(a.ev??a.expectedValue??a.expected_value))?Number(a.ev??a.expectedValue??a.expected_value):null
    }));
    const best=[...normalized].sort((a,b)=>b.frequency-a.frequency)[0]||null;
    const handEv=Number.isFinite(Number(strategy.ev))?Number(strategy.ev):null;
    return Object.freeze({
      ok:!!selected,
      frequency:selected?Number(selected.frequency)||0:0,
      handEv,
      selected:selected?{
        action:selected.action||selected.label||selected.kind,
        kind:normalizeActionKind(selected),
        to:Number.isFinite(Number(selected.to))?Number(selected.to):null,
        ev:Number.isFinite(Number(selected.ev??selected.expectedValue??selected.expected_value))?Number(selected.ev??selected.expectedValue??selected.expected_value):null
      }:null,
      best,
      strategy:normalized
    });
  }

  function legalUiActions(spot,handKey){
    const strategy=strategyForHand(spot,handKey);
    if(!strategy)return [];
    const map=mapUiActions(strategy.actions);
    return Object.keys(map).filter(k=>!!map[k]);
  }

  global.StackUpSpotsEngine=Object.freeze({
    SOLVER_IDS,
    SOLVER_CAPABILITIES,
    canonicalScenarioSignature,
    validateScenario,
    validateSolverSpot,
    normalizeActionKind,
    handClassFromCards,
    cardsForHand,
    strategyForHand,
    mapUiActions,
    legalUiActions,
    toViewModel,
    evaluate
  });
})(window);
