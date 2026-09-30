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
  function applyHeroUiAction(state,result,uiAction){
    if(!state)return null;
    const selected=result?.selected||{};
    let action={kind:selected.kind||uiAction,action:selected.action||uiAction};
    if(Number.isFinite(Number(selected.to)))action.to=Number(selected.to);
    if(uiAction==='allin')action.kind='jam';
    return apply(state,state.heroPosition,action);
  }
  function snapshot(state){
    if(!state)return null;
    return Object.freeze(clone(state));
  }
  function player(state,position){ const p=byPos(state,position); return p?Object.freeze(clone(p)):null; }

  global.StackUpTableState=Object.freeze({
    fromSpot,
    snapshot,
    player,
    currentBet,
    apply,
    applyHeroUiAction,
    normalizeActionKind:kindOf
  });
})(window);
