/* STACKUP HOLD'EM — AI Scenario Planner V1
   AI is allowed to propose realistic scenario context ONLY.
   It is explicitly forbidden from certifying strategy, EV, frequencies or the correct action.
   Every proposal must pass this module + the scenario contract before a solver/math engine sees it. */
(function(global){
  'use strict';

  const POSITIONS=['SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO','BTN'];
  const STREETS=['PRE-FLOP','FLOP','TURN','RIVER'];
  const POT_TYPES=['UNOPENED','LIMPED','SRP','3BET','4BET','MULTIWAY'];
  const TEXTURES=['DRY','CONNECTED','PAIRED','MONOTONE','TWOTONE','HIGH_CARD','LOW','DYNAMIC','STATIC'];
  const PHASES=['EARLY','MIDDLE','BUBBLE','LATE','FINAL_TABLE'];
  const TOURNAMENT_TYPES=['REGULAR','TURBO','PKO','FREEZEOUT','HIGH_ROLLER','SNG'];
  const ACTIONS=['FOLD','CHECK','CALL','LIMP','BET','RAISE','3BET','4BET','ALL_IN'];

  function unique(arr){return [...new Set((arr||[]).filter(Boolean))];}
  function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function parseSpecial(filters){
    const raw=filters?.special;
    if(!raw)return {};
    if(typeof raw==='object'&&!Array.isArray(raw))return raw;
    try{
      const v=JSON.parse(String(raw));
      return v&&typeof v==='object'&&!Array.isArray(v)?v:{};
    }catch{return {};}
  }

  function activeCard(filters){
    const catalog=global.StackUpScenarioCatalog;
    if(!catalog)return null;
    const special=parseSpecial(filters);
    for(const [section,values] of Object.entries(special)){
      for(const id of Array.isArray(values)?values:[]){
        const item=catalog.get(section,String(id));
        if(item)return item;
      }
    }
    const checks=[
      ['stack',(filters?.effectiveStacks||[]).map(v=>String(Number(v))+'bb')],
      ['phase',filters?.phases||[]],
      ['pos',filters?.heroPositions||[]],
      ['street',(filters?.streets||[]).map(v=>String(v).toLowerCase()==='pre-flop'?'pre':String(v).toLowerCase())],
      ['seats',filters?.seats?[filters.seats]:[]],
      ['ttype',filters?.tournamentType?[filters.tournamentType]:[]],
      ['fsize',filters?.fieldSize?[filters.fieldSize]:[]],
      ['fskill',filters?.opponentProfile?[filters.opponentProfile]:[]]
    ];
    for(const [section,ids] of checks){
      for(const id of ids){
        const item=catalog.get(section,String(id));
        if(item)return item;
      }
    }
    return null;
  }

  function domainFor(contract,filters={}){
    if(!contract)return null;
    let positions=unique(filters.heroPositions?.length?filters.heroPositions:POSITIONS);
    let streets=unique(filters.streets?.length?filters.streets:STREETS);
    let stacks=unique((filters.effectiveStacks||[]).map(Number).filter(Number.isFinite));
    if(!stacks.length)stacks=[5,8,10,12,15,18,20,25,30,40,50,75,100];

    if(contract.hero)positions=[contract.hero];
    if(contract.tableSize===2)positions=['SB','BB'];
    if(contract.street)streets=[contract.street];
    if(contract.section==='pre_special'||contract.section==='blind_special'||contract.section==='aggr_special'||contract.section==='short_special'||contract.section==='icm_special'||contract.section==='pko_special'){
      streets=['PRE-FLOP'];
    }
    if(contract.section==='river_special')streets=['RIVER'];
    if(contract.stackBb)stacks=[contract.stackBb];
    if(contract.icmKind==='stack_5_8')stacks=[5,6,7,8];
    if(contract.icmKind==='stack_9_12')stacks=[9,10,11,12];
    if(contract.icmKind==='stack_13_18')stacks=[13,14,15,16,17,18];
    if(contract.icmKind==='stack_19_25')stacks=[19,20,21,22,23,24,25];

    const phases=contract.section==='icm_special'
      ? contract.icmKind==='bubble'?['BUBBLE']
        :contract.icmKind==='final_table'?['FINAL_TABLE']
        :contract.icmKind==='three_handed'?['FINAL_TABLE']
        :['MIDDLE','BUBBLE','LATE','FINAL_TABLE']
      :unique(filters.phases?.length?filters.phases:PHASES);

    return Object.freeze({
      card:{section:contract.section,id:contract.id,label:contract.label,validator:contract.validator,source:contract.source},
      positions,
      streets,
      stacks,
      potTypes:POT_TYPES,
      boardTextures:TEXTURES,
      phases,
      tournamentTypes:TOURNAMENT_TYPES,
      actions:ACTIONS,
      tableSize:contract.tableSize||filters.tableSize||null,
      minSpots:contract.minSpots||1500
    });
  }

  function buildPrompt(contract,filters={},recent=[]){
    const d=domainFor(contract,filters);
    if(!d)return null;
    const recentText=(recent||[]).slice(-12).map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' | ');
    return [
      'Você é o arquiteto de cenários do STACKUP HOLD\'EM GRINDER.',
      'Analise APENAS o card de treino informado e proponha UM contexto de poker realista e internamente coerente.',
      'Sua tarefa é criar contexto, NÃO resolver a mão.',
      'É PROIBIDO retornar ação correta, recomendação, EV, equity final, frequências GTO ou estratégia.',
      'Outro motor (DCFR/ICM/PKO/matemática) validará e resolverá a decisão.',
      'Escolha somente valores permitidos no DOMÍNIO. Evite estruturas recentes e varie posições, stacks, linhas e texturas quando o card permitir.',
      'CARD='+JSON.stringify(d.card),
      'DOMÍNIO='+JSON.stringify({
        positions:d.positions,streets:d.streets,stacks:d.stacks,potTypes:d.potTypes,
        boardTextures:d.boardTextures,phases:d.phases,tournamentTypes:d.tournamentTypes,
        tableSize:d.tableSize
      }),
      recentText?'RECENTES_A_EVITAR='+recentText:'',
      'Responda SOMENTE JSON estrito com este formato:',
      JSON.stringify({
        heroPosition:'BTN',
        villainPositions:['BB'],
        street:'PRE-FLOP',
        effectiveStack:20,
        potType:'SRP',
        boardTexture:null,
        phase:'LATE',
        tournamentType:'REGULAR',
        fieldSize:'500',
        opponentProfile:'opp60',
        actionHistory:[{position:'CO',action:'RAISE',sizeBb:2.2}],
        targetSizingPct:null,
        scenarioTags:['exemplo_semantico']
      })
    ].filter(Boolean).join('\n');
  }

  function validateProposal(raw,contract,filters={}){
    const d=domainFor(contract,filters);
    if(!d||!raw||typeof raw!=='object'||Array.isArray(raw))return null;

    // These fields are forbidden even if a model tries to include them.
    const forbidden=['correctAction','bestAction','recommendedAction','strategy','frequencies','frequency','ev','EV','equity','solverAnswer'];
    if(forbidden.some(k=>Object.prototype.hasOwnProperty.call(raw,k)))return null;

    const hero=String(raw.heroPosition||'').toUpperCase();
    if(!d.positions.includes(hero))return null;

    const villains=unique((raw.villainPositions||[]).map(x=>String(x).toUpperCase()));
    if(!villains.length||villains.some(v=>!POSITIONS.includes(v)||v===hero))return null;
    if(villains.length>3)return null;

    const street=String(raw.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
    if(!d.streets.includes(street))return null;

    const stack=num(raw.effectiveStack);
    if(stack===null||!d.stacks.some(v=>Math.abs(Number(v)-stack)<0.001))return null;

    const potType=String(raw.potType||'').toUpperCase();
    if(!d.potTypes.includes(potType))return null;

    const phase=String(raw.phase||'').toUpperCase();
    if(phase&&!d.phases.includes(phase))return null;

    const tournamentType=String(raw.tournamentType||'').toUpperCase();
    if(tournamentType&&!d.tournamentTypes.includes(tournamentType))return null;

    let boardTexture=raw.boardTexture==null?null:String(raw.boardTexture).toUpperCase();
    if(street==='PRE-FLOP')boardTexture=null;
    else if(!boardTexture||!d.boardTextures.includes(boardTexture))return null;

    const history=[];
    for(const e of Array.isArray(raw.actionHistory)?raw.actionHistory:[]){
      const position=String(e?.position||'').toUpperCase();
      const action=String(e?.action||'').toUpperCase().replace(/[- ]+/g,'_');
      if(!POSITIONS.includes(position)||!ACTIONS.includes(action.replace('_',''))) {
        // allow standard compact spellings below
        const normalized=action.replaceAll('_','');
        if(!['FOLD','CHECK','CALL','LIMP','BET','RAISE','3BET','4BET','ALLIN'].includes(normalized))return null;
      }
      const sizeBb=e?.sizeBb==null?null:num(e.sizeBb);
      if(sizeBb!==null&&(sizeBb<0||sizeBb>stack))return null;
      history.push({position,action:action.replaceAll('_',''),sizeBb});
    }
    if(history.length>12)return null;

    const targetSizingPct=raw.targetSizingPct==null?null:num(raw.targetSizingPct);
    if(targetSizingPct!==null&&(targetSizingPct<10||targetSizingPct>300))return null;

    return Object.freeze({
      cardKey:contract.section+':'+contract.id,
      heroPosition:hero,
      villainPositions:villains,
      street,
      effectiveStack:stack,
      potType,
      boardTexture,
      phase:phase||null,
      tournamentType:tournamentType||null,
      fieldSize:raw.fieldSize==null?null:String(raw.fieldSize),
      opponentProfile:raw.opponentProfile==null?null:String(raw.opponentProfile),
      actionHistory:history,
      targetSizingPct,
      scenarioTags:unique((raw.scenarioTags||[]).map(String)).slice(0,12),
      provenance:'AI_CONTEXT_PROPOSAL'
    });
  }

  global.StackUpAIScenarioPlanner=Object.freeze({
    POSITIONS,STREETS,POT_TYPES,TEXTURES,PHASES,TOURNAMENT_TYPES,ACTIONS,
    activeCard,domainFor,buildPrompt,validateProposal
  });
})(window);
