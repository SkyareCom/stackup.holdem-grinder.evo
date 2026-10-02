/* StackUp Solved Spot Core v1
   Portable contract for Grinder EVO and other StackUp training apps.
   One counted spot == one solver-resolved decision for one concrete scenario + hand.
   Presentation permutations, suit permutations and projected contexts never increase coverage. */
(function(global){
  'use strict';

  const DEFAULT_POLICY=Object.freeze({
    schemaVersion:1,
    mode:'STRICT_SOLVED_ONLY',
    countingUnit:'ONE_VALIDATED_SOLVER_DECISION_PER_SCENARIO_AND_HAND',
    publishFloor:1500,
    currentGoal:2000,
    milestones:Object.freeze([1500,2000,5000,10000,20000])
  });

  const REQUIRED_SCENARIO=Object.freeze(['gameType','street','heroPosition','effectiveStack','pot','actionHistory']);

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
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }

  function normStreet(value){
    return String(value||'').trim().toUpperCase().replace('PREFLOP','PRE-FLOP');
  }

  function isExactHand(hand){
    return /^(?:10|[2-9TJQKA])[cdhs](?:10|[2-9TJQKA])[cdhs]$/i.test(String(hand||''));
  }

  function isHandClass(hand){
    return /^([2-9TJQKA])([2-9TJQKA])([so])?$/i.test(String(hand||'').replace(/10/g,'T'));
  }

  function projectionReason(spot){
    const p=spot?.scenario?.provenance||spot?.provenance||{};
    if(p.contextProjection)return 'context_projection';
    if(p.positionProjection)return 'position_projection';
    const solveId=String(spot?.solveId||'');
    if(/\|context\|/i.test(solveId))return 'context_projection';
    if(/position-equivalence/i.test(solveId))return 'position_projection';
    return null;
  }

  function scenarioErrors(scenario){
    const errors=[];
    if(!scenario||typeof scenario!=='object')return ['scenario_missing'];
    for(const key of REQUIRED_SCENARIO){
      if(scenario[key]===undefined||scenario[key]===null)errors.push('scenario_'+key+'_missing');
    }
    if(!Array.isArray(scenario.actionHistory))errors.push('action_history_invalid');
    const street=normStreet(scenario.street);
    if(!['PRE-FLOP','FLOP','TURN','RIVER'].includes(street))errors.push('street_invalid');
    if(!Number.isFinite(Number(scenario.effectiveStack)))errors.push('effective_stack_invalid');
    if(!Number.isFinite(Number(scenario.pot)))errors.push('pot_invalid');
    const board=Array.isArray(scenario.board)?scenario.board:[];
    if(street==='PRE-FLOP'&&board.length!==0)errors.push('preflop_board_not_empty');
    if(street==='FLOP'&&board.length!==3)errors.push('flop_board_incomplete');
    if(street==='TURN'&&board.length!==4)errors.push('turn_board_incomplete');
    if(street==='RIVER'&&board.length!==5)errors.push('river_board_incomplete');
    return errors;
  }

  function strategyEntry(spot,handOrEntry){
    if(handOrEntry&&typeof handOrEntry==='object'&&!Array.isArray(handOrEntry))return handOrEntry;
    const target=String(handOrEntry||'').trim().toUpperCase().replace(/10/g,'T');
    return (spot?.strategy||[]).find(x=>String(x?.hand||'').trim().toUpperCase().replace(/10/g,'T')===target)||null;
  }

  function actionErrors(entry){
    const errors=[];
    if(!entry||!entry.hand)errors.push('hand_missing');
    if(!Array.isArray(entry?.actions)||!entry.actions.length)return [...errors,'actions_missing'];
    let total=0,positive=0;
    for(const action of entry.actions){
      const frequency=Number(action?.frequency);
      if(!Number.isFinite(frequency)||frequency<0||frequency>100){
        errors.push('frequency_invalid');
        continue;
      }
      total+=frequency;
      if(frequency>0)positive++;
      if(!String(action?.kind||action?.action||action?.label||'').trim())errors.push('action_kind_missing');
    }
    if(!positive)errors.push('no_positive_action');
    if(Math.abs(total-100)>1.25)errors.push('frequency_total_invalid');
    return [...new Set(errors)];
  }

  function scenarioFingerprint(scenario){
    return hash(JSON.stringify(stable({
      gameType:scenario?.gameType??null,
      street:normStreet(scenario?.street),
      tableSize:scenario?.trainingTableSize??scenario?.tableSize??null,
      heroPosition:scenario?.heroPosition??null,
      villainPosition:scenario?.villainPosition??null,
      effectiveStack:Number(scenario?.effectiveStack),
      heroStack:Number(scenario?.heroStack??scenario?.effectiveStack),
      pot:Number(scenario?.pot),
      currentBet:Number(scenario?.currentBet||0),
      board:scenario?.board||[],
      heroRange:scenario?.heroRange??null,
      villainRange:scenario?.villainRange??null,
      actionHistory:scenario?.actionHistory||[],
      legalActions:scenario?.legalActions||[],
      sizings:scenario?.sizings||[],
      ante:scenario?.ante??null,
      phase:scenario?.phase??null,
      tournamentType:scenario?.tournamentType??null,
      fieldSize:scenario?.fieldSize??null,
      opponentProfile:scenario?.opponentProfile??null,
      extras:scenario?.extras||[],
      icm:scenario?.icm??null,
      bounty:scenario?.bounty??null
    })));
  }

  function solvedDecisionId(spot,handOrEntry){
    const entry=strategyEntry(spot,handOrEntry);
    if(!entry)return null;
    return 'ss1_'+hash(JSON.stringify(stable({
      scenario:scenarioFingerprint(spot?.scenario||{}),
      hand:String(entry.hand||'').trim(),
      solver:spot?.solver||null,
      solveId:spot?.solveId||null,
      nodeId:spot?.nodeId||spot?.id||null
    })));
  }

  function validateSolvedDecision(spot,handOrEntry){
    const errors=[];
    if(!spot||typeof spot!=='object')return Object.freeze({ok:false,id:null,errors:['spot_missing']});
    if(!String(spot.solver||'').trim())errors.push('solver_missing');
    if(!String(spot.solveId||'').trim())errors.push('solve_id_missing');
    const provenance=spot?.scenario?.provenance||spot?.provenance;
    if(!provenance||typeof provenance!=='object'||Array.isArray(provenance)||!Object.keys(provenance).length){
      errors.push('provenance_missing');
    }else if(!String(provenance.strategySource||'').trim()){
      errors.push('provenance_strategy_source_missing');
    }
    const projected=projectionReason(spot);
    if(projected)errors.push(projected);
    errors.push(...scenarioErrors(spot.scenario));
    const entry=strategyEntry(spot,handOrEntry);
    if(!entry)errors.push('strategy_entry_missing');
    else{
      errors.push(...actionErrors(entry));
      const street=normStreet(spot?.scenario?.street);
      const hand=String(entry.hand||'').replace(/10/g,'T');
      if(street==='PRE-FLOP'){
        if(!isHandClass(hand)&&!isExactHand(hand))errors.push('preflop_hand_invalid');
      }else if(!isExactHand(hand)){
        errors.push('postflop_hand_not_exact');
      }
    }
    const unique=[...new Set(errors)];
    return Object.freeze({
      ok:unique.length===0,
      id:unique.length?null:solvedDecisionId(spot,entry),
      errors:unique,
      hand:entry?.hand||null,
      solver:spot?.solver||null,
      solveId:spot?.solveId||null,
      scenarioFingerprint:spot?.scenario?scenarioFingerprint(spot.scenario):null
    });
  }

  function enumerateSolvedDecisions(spots){
    const out=[];
    const seen=new Set();
    for(const spot of Array.isArray(spots)?spots:[]){
      for(const entry of Array.isArray(spot?.strategy)?spot.strategy:[]){
        const verdict=validateSolvedDecision(spot,entry);
        if(!verdict.ok||seen.has(verdict.id))continue;
        seen.add(verdict.id);
        out.push(Object.freeze({id:verdict.id,spot,entry,hand:entry.hand}));
      }
    }
    return out;
  }

  function auditSpots(spots){
    let rawEntries=0,validEntries=0,projectedRejected=0,invalidEntries=0;
    const unique=new Set();
    const reasons={};
    for(const spot of Array.isArray(spots)?spots:[]){
      const entries=Array.isArray(spot?.strategy)?spot.strategy:[];
      rawEntries+=entries.length;
      for(const entry of entries){
        const v=validateSolvedDecision(spot,entry);
        if(v.ok){
          validEntries++;
          unique.add(v.id);
        }else{
          invalidEntries++;
          if(v.errors.includes('context_projection')||v.errors.includes('position_projection'))projectedRejected++;
          for(const reason of v.errors)reasons[reason]=(reasons[reason]||0)+1;
        }
      }
    }
    return Object.freeze({
      rawEntries,
      validEntries,
      uniqueSolvedSpots:unique.size,
      invalidEntries,
      projectedRejected,
      rejectionReasons:Object.freeze({...reasons})
    });
  }

  global.StackUpSolvedSpotContract=Object.freeze({
    VERSION:'1.0.0',
    POLICY:DEFAULT_POLICY,
    REQUIRED_SCENARIO,
    stable,
    hash,
    normStreet,
    isExactHand,
    isHandClass,
    projectionReason,
    scenarioErrors,
    actionErrors,
    scenarioFingerprint,
    solvedDecisionId,
    validateSolvedDecision,
    enumerateSolvedDecisions,
    auditSpots
  });
})(typeof window!=='undefined'?window:globalThis);
