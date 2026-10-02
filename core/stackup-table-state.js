/* StackUp Hold'em Grinder EVO — deterministic table state for solver-backed SPOTS.
   Keeps poker-state mutations separate from the visual layer so solver data can drive
   pot, stacks, folds, all-ins and action history without changing the existing design. */
(function(global){
  'use strict';

  function n(v,fallback=0){ const x=Number(v); return Number.isFinite(x)?x:fallback; }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function kindOf(action){
    if(global.StackUpSpotsEngine?.normalizeActionKind) return global.StackUpSpotsEngine.normalizeActionKind(action);
    const raw=String(action?.kind||action?.action||action?.label||action||'').toLowerCase().replace(/[ _-]+/g,'');
    if(raw.includes('fold'))return 'fold';
    if(raw.includes('check'))return 'check';
    if(raw.includes('call'))return 'call';
    if(raw.includes('allin')||raw.includes('jam')||raw.includes('shove'))return 'jam';
    if(raw.includes('raise')||raw.includes('bet'))return 'raise';
    return raw||'unknown';
  }
  function amountOf(action){
    if(!action||typeof action!=='object')return null;
    const direct=Number(action.to??action.amount??action.size);
    if(Number.isFinite(direct))return direct;
    const m=String(action.action||action.label||'').match(/(\d+(?:\.\d+)?)/);
    return m?Number(m[1]):null;
  }
  function actorOf(entry){
    return String(entry?.position||entry?.actor||entry?.player||entry?.seat||'').toUpperCase();
  }
  function initialPositions(view,scenario){
    const v=Array.isArray(view?.positions)?view.positions:[];
    const s=Array.isArray(scenario?.positions)?scenario.positions:[];
    return (v.length?v:s).map(String);
  }
  function makePlayer(position,view,scenario){
    const source=view?.stackForPosition||scenario?.playerStacks||scenario?.stacks||{};
    const stack=n(source?.[position],n(scenario?.effectiveStack,100));
    return {position,stack,committed:0,folded:false,allIn:false,acted:false,lastAction:null,isHero:position===view?.heroPosition};
  }
  function currentBet(state){
    return Math.max(0,...state.players.filter(p=>!p.folded).map(p=>n(p.committed)));
  }
  function byPos(state,position){
    return state.players.find(p=>String(p.position).toUpperCase()===String(position||'').toUpperCase())||null;
  }
  function contribute(state,p,delta,{mutateStack=true,mutatePot=true}={}){
    const wanted=Math.max(0,n(delta));
    const paid=mutateStack?Math.min(wanted,Math.max(0,p.stack)):wanted;
    if(mutateStack)p.stack=Math.max(0,p.stack-paid);
    p.committed+=paid;
    if(mutatePot)state.pot+=paid;
    if(mutateStack&&p.stack<=1e-9)p.allIn=true;
    return paid;
  }
  function apply(state,position,action,options){
    if(!state)return null;
    const p=byPos(state,position);
    if(!p)return snapshot(state);
    const opt=Object.assign({mutateStack:true,mutatePot:true,record:true},options||{});
    const kind=kindOf(action);
    const beforeBet=currentBet(state);
    let paid=0,target=null;

    if(kind==='fold'){
      p.folded=true;
    }else if(kind==='check'){
      // no chips
    }else if(kind==='call'){
      target=beforeBet;
      paid=contribute(state,p,Math.max(0,target-p.committed),opt);
    }else if(kind==='jam'){
      target=p.committed+p.stack;
      paid=contribute(state,p,p.stack,opt);
    }else if(kind==='raise'){
      const requested=amountOf(action);
      target=Number.isFinite(requested)?requested:Math.max(beforeBet*2,beforeBet+1);
      if(target<=beforeBet)target=Math.max(beforeBet+1,beforeBet*2);
      paid=contribute(state,p,Math.max(0,target-p.committed),opt);
    }
    p.acted=true;
    p.lastAction=kind;
    state.currentBet=currentBet(state);
    state.lastAction={position:p.position,kind,target,paid,at:Date.now()};
    if(opt.record)state.history.push({position:p.position,kind,target,paid});
    return snapshot(state);
  }
  function replayBaseline(state,history){
    for(const entry of history||[]){
      const position=actorOf(entry);
      if(!position)continue;
      // scenario.pot/stacks describe the decision point. Reconstruct only visual betting state;
      // do not subtract stacks or add the same chips to the pot a second time.
      apply(state,position,entry,{mutateStack:false,mutatePot:false,record:true});
    }
  }
  function historyForCurrentStreet(view,scenario){
    const raw=Array.isArray(view?.actionHistory)?view.actionHistory:(Array.isArray(scenario?.actionHistory)?scenario.actionHistory:[]);
    const street=String(view?.street||scenario?.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
    const tagged=raw.filter(x=>x&&x.street!=null);
    if(!tagged.length)return raw;
    return raw.filter(x=>String(x?.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP')===street);
  }
  function finalStreetCommitments(history){
    const out=new Map();
    for(const entry of history||[]){
      const position=actorOf(entry);
      if(!position)continue;
      const kind=kindOf(entry);
      if(kind==='fold'||kind==='check')continue;
      const direct=amountOf(entry);
      if(Number.isFinite(direct))out.set(position,Math.max(n(out.get(position)),direct));
    }
    return out;
  }
  function fromStreetStart(spot,view){
    if(!spot||!view)return null;
    const scenario=spot.scenario||{};
    const positions=initialPositions(view,scenario);
    const history=historyForCurrentStreet(view,scenario);
    const finalCommitted=finalStreetCommitments(history);
    const contributed=[...finalCommitted.values()].reduce((sum,v)=>sum+n(v),0);
    const decisionPot=n(view.pot,n(scenario.pot));
    const state={
      spotId:view.id||spot.id||null,
      solveId:view.solveId||spot.solveId||null,
      solver:view.solver||spot.solver||null,
      street:view.street||scenario.street||'PRE-FLOP',
      heroPosition:view.heroPosition||scenario.heroPosition||null,
      villainPosition:view.villainPosition||scenario.villainPosition||null,
      board:Array.isArray(view.board)?[...view.board]:[],
      heroCards:Array.isArray(view.heroCards)?[...view.heroCards]:[],
      pot:Math.max(0,decisionPot-contributed),
      sidePots:Array.isArray(view.sidePots)?[...view.sidePots]:[],
      positions:[...positions],
      players:positions.map(p=>makePlayer(p,view,scenario)),
      currentBet:0,
      history:[],
      lastAction:null
    };
    // scenario.playerStacks describe the decision point. Add this street's chips
    // back so the replay visibly starts at the beginning of the current street.
    state.players.forEach(p=>{
      const committed=n(finalCommitted.get(String(p.position).toUpperCase()));
      if(committed>0)p.stack+=committed;
      p.committed=0;
      p.folded=false;
      p.allIn=false;
      p.acted=false;
      p.lastAction=null;
    });
    return state;
  }

  function fromSpot(spot,view){
    if(!spot||!view)return null;
    const scenario=spot.scenario||{};
    const positions=initialPositions(view,scenario);
    const state={
      spotId:view.id||spot.id||null,
      solveId:view.solveId||spot.solveId||null,
      solver:view.solver||spot.solver||null,
      street:view.street||scenario.street||'PRE-FLOP',
      heroPosition:view.heroPosition||scenario.heroPosition||null,
      villainPosition:view.villainPosition||scenario.villainPosition||null,
      board:Array.isArray(view.board)?[...view.board]:[],
      heroCards:Array.isArray(view.heroCards)?[...view.heroCards]:[],
      pot:n(view.pot,n(scenario.pot)),
      sidePots:Array.isArray(view.sidePots)?[...view.sidePots]:[],
      positions:[...positions],
      players:positions.map(p=>makePlayer(p,view,scenario)),
      currentBet:0,
      history:[],
      lastAction:null
    };
    replayBaseline(state,Array.isArray(view.actionHistory)?view.actionHistory:scenario.actionHistory);
    state.currentBet=currentBet(state);
    return state;
  }
  function sizingFraction(action){
    const label=String(action?.action||action?.label||'').toLowerCase();
    let m=label.match(/(\d+(?:\.\d+)?)\s*%/);
    if(m)return Number(m[1])/100;
    m=label.match(/bet\s+(\d+)\s*\/\s*(\d+)/);
    if(m&&Number(m[2]))return Number(m[1])/Number(m[2]);
    m=label.match(/bet\s+(\d+(?:\.\d+)?)x/);
    if(m)return Number(m[1]);
    return null;
  }
  function minimumRaiseTarget(state,position){
    if(!state)return null;
    const p=byPos(state,position);
    if(!p)return null;
    const maxTarget=p.committed+Math.max(0,n(p.stack));
    const before=currentBet(state);
    const street=String(state.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP');

    // Stack/pot values are expressed in BB throughout the trainer.
    // Unopened pre-flop: minimum legal open is 2 BB total.
    // Unopened post-flop: minimum legal bet is 1 BB.
    if(before<=1e-9){
      const minOpen=street==='PRE-FLOP'?2:1;
      return Math.min(maxTarget,Math.max(p.committed,minOpen));
    }

    // Minimum re-raise = current wager + the size of the last full raise.
    // Pre-flop starts from the forced 1 BB level even when blind posting is
    // not represented as an explicit action in the scenario history.
    let previousLevel=street==='PRE-FLOP'?1:0;
    let lastFullIncrement=street==='PRE-FLOP'?1:Math.max(1,before);
    let sawAggression=false;
    for(const entry of state.history||[]){
      const kind=kindOf(entry);
      if(kind!=='raise'&&kind!=='jam')continue;
      const target=n(entry?.target,amountOf(entry));
      if(!Number.isFinite(target)||target<=previousLevel)continue;
      const increment=target-previousLevel;
      if(!sawAggression||increment+1e-9>=lastFullIncrement){
        lastFullIncrement=Math.max(.01,increment);
        sawAggression=true;
      }
      previousLevel=Math.max(previousLevel,target);
    }
    if(!sawAggression){
      lastFullIncrement=street==='PRE-FLOP'
        ?Math.max(1,before-1)
        :Math.max(1,before);
    }
    const target=before+lastFullIncrement;
    return Math.min(maxTarget,Math.max(before,target));
  }

  function resolveActionTarget(state,position,action){
    if(!state)return null;
    const p=byPos(state,position);
    if(!p)return null;
    const kind=kindOf(action);
    if(kind!=='raise'&&kind!=='jam')return null;
    if(kind==='jam')return p.committed+p.stack;
    const beforeBet=currentBet(state);
    const frac=sizingFraction(action);
    if(Number.isFinite(frac)){
      if(beforeBet<=p.committed){
        return Math.min(p.committed+p.stack,p.committed+Math.max(.01,frac*state.pot));
      }
      const toCall=Math.max(0,beforeBet-p.committed);
      const potAfterCall=state.pot+toCall;
      return Math.min(p.committed+p.stack,beforeBet+Math.max(.01,frac*potAfterCall));
    }
    const direct=amountOf(action);
    return Number.isFinite(direct)?Math.min(p.committed+p.stack,direct):null;
  }

  function applyHeroUiAction(state,result,uiAction,explicitTarget){
    if(!state)return null;
    const selected=result?.selected||{};
    let action={kind:selected.kind||uiAction,action:selected.action||uiAction};
    if(uiAction==='allin')action.kind='jam';
    if(uiAction==='raise'||uiAction==='raise1'||uiAction==='raise2')action.kind='raise';

    const requested=Number(explicitTarget);
    if(Number.isFinite(requested)&&action.kind==='raise'){
      action.to=Math.min(
        byPos(state,state.heroPosition)?.committed+n(byPos(state,state.heroPosition)?.stack),
        requested
      );
    }else{
      const target=resolveActionTarget(state,state.heroPosition,action);
      if(Number.isFinite(target))action.to=target;
      else if(Number.isFinite(Number(selected.to)))action.to=Number(selected.to);
    }
    return apply(state,state.heroPosition,action);
  }
  function snapshot(state){
    if(!state)return null;
    return Object.freeze(clone(state));
  }
  function player(state,position){ const p=byPos(state,position); return p?Object.freeze(clone(p)):null; }

  global.StackUpTableState=Object.freeze({
    fromSpot,
    fromStreetStart,
    historyForCurrentStreet,
    snapshot,
    player,
    currentBet,
    apply,
    applyHeroUiAction,
    resolveActionTarget,
    minimumRaiseTarget,
    normalizeActionKind:kindOf
  });
})(window);
