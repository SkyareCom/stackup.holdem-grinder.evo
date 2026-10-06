/* StackUp Hold'em Grinder EVO — filter compatibility engine.
   Defines which AJUSTES / ADVANCE filters are exclusive, cumulative (OR within group),
   conjunctive across dimensions, or incompatible. Keeps impossible combinations away
   from the solver while preserving the user's most recent explicit choice. */
(function(global){
  'use strict';

  const ADV_SECTIONS=[
    'pre_special','blind_special','aggr_special','short_special','icm_special',
    'pko_special','post_special','river_special','texture_special','math_special'
  ];
  const PRE_ADV=new Set(['pre_special','blind_special','short_special','icm_special','pko_special']);
  const POST_ADV=new Set(['post_special','texture_special']);
  const ALL_STREETS=['pre','flop','turn','river'];
  const POST_STREETS=['flop','turn','river'];
  const POSITIONS=['SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO','BTN'];

  const SEAT_POSITIONS={
    s2:['SB','BB'],
    s6:['SB','BB','UTG','HJ','CO','BTN'],
    s8:['SB','BB','UTG','UTG+1','LJ','HJ','CO','BTN'],
    s9:['SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO','BTN'],
    s10:[...POSITIONS]
  };

  const OPTION_STREETS={
    // Post-flop actions with a narrower natural street.
    delayed_cbet:['turn'], probe_bet:['turn'], double_barrel:['turn'],
    turn_check_raise:['turn'], triple_barrel:['river'],
    river_bluff_catch:['river'], vs_overbet:['river'], block_bet_20_25:['river'],
    river_check_raise:['river'], bet_fold:['river'], thin_value:['river'], value_river:['river'],
    board_dynamic:['turn','river'], board_static:['flop','turn','river'],
    implied_odds:['flop','turn'], reverse_implied_odds:['flop','turn']
  };

  const OPTION_POSITIONS={
    bb_ep:['BB'],bb_mp:['BB'],bb_lp:['BB'],
    sb_ep:['SB'],sb_mp:['SB'],sb_cobtn:['SB'],
    attack_cobtn:['SB','BB'],
    cobtn_vs_raise:['CO','BTN'],cobtn:['CO','BTN'],
    blind_war:['SB','BB'],bb_limpers:['BB'],
    sb_limp_call:['SB'],sb_limp_raise:['SB'],
    heads_up_2max:['SB','BB']
  };

  const OPTION_STACKS={
    icm_5_8:[5],
    icm_9_12:[10],
    icm_13_18:[15,18],
    icm_19_25:[20,25],
    open_shove:[5,10,15,18,20,25],
    call_shove:[5,10,15,18,20,25],
    reshove:[5,10,15,18,20,25],
    multi_shove:[5,10,15,18,20,25],
    push_fold:[5,10,15]
  };

  const OPTION_PHASES={
    icm_bubble:['bubble'],
    icm_final_table:['ft'],
    icm_3handed:['ft'],
    icm_pay_jump:['late','ft']
  };

  function uniq(values){
    return [...new Set((values||[]).filter(v=>v!==null&&v!==undefined&&v!==''))];
  }
  function stateClone(input){
    const out={};
    Object.entries(input||{}).forEach(([k,v])=>out[k]=uniq(Array.isArray(v)?v:[v]));
    return out;
  }
  function concrete(state,id){
    return uniq(state[id]||[]).filter(v=>v!=='all'&&v!=='random');
  }
  function hasConcrete(state,id){return concrete(state,id).length>0;}
  function setOne(state,id,value){state[id]=[value];}
  function setMany(state,id,values,fallback){
    const v=uniq(values);
    state[id]=v.length?v:[fallback||'all'];
  }
  function resetAdvance(state,id){state[id]=['all'];}
  function activeAdvance(state){
    return ADV_SECTIONS.filter(id=>hasConcrete(state,id));
  }
  function intersection(a,b){
    const B=new Set(b);return a.filter(x=>B.has(x));
  }
  function union(list){return uniq(list.flat());}

  function sectionStreetDomain(section,values){
    const selected=values||[];
    if(!selected.length)return [...ALL_STREETS];
    if(PRE_ADV.has(section))return ['pre'];
    if(section==='aggr_special'){
      return union(selected.map(id=>id==='pot_4bet'?POST_STREETS:['pre']));
    }
    if(section==='river_special')return ['river'];
    if(POST_ADV.has(section))return [...POST_STREETS];
    if(section==='math_special'){
      const domains=selected.map(id=>OPTION_STREETS[id]||ALL_STREETS);
      return union(domains);
    }
    return [...ALL_STREETS];
  }

  function optionStreetDomain(section,option){
    if(PRE_ADV.has(section))return ['pre'];
    if(section==='aggr_special')return option==='pot_4bet'?[...POST_STREETS]:['pre'];
    if(section==='river_special')return ['river'];
    if(OPTION_STREETS[option])return OPTION_STREETS[option];
    const c=contractFor(section,option);
    if(c?.street){
      const s=String(c.street).toLowerCase().replace('pre-flop','pre').replace('preflop','pre');
      if(ALL_STREETS.includes(s))return [s];
    }
    if(POST_ADV.has(section))return [...POST_STREETS];
    if(section==='math_special')return [...ALL_STREETS];
    return [...ALL_STREETS];
  }

  function selectedStreetDomain(state,ignoreSection){
    let domain=[...ALL_STREETS];
    for(const section of ADV_SECTIONS){
      if(section===ignoreSection)continue;
      const values=concrete(state,section);
      if(!values.length)continue;
      domain=intersection(domain,sectionStreetDomain(section,values));
      if(!domain.length)break;
    }
    return domain;
  }

  function selectedPositionDomain(state,ignoreSection){
    let domain=[...POSITIONS];
    const seats=concrete(state,'seats')[0];
    if(seats&&SEAT_POSITIONS[seats])domain=intersection(domain,SEAT_POSITIONS[seats]);
    for(const section of ADV_SECTIONS){
      if(section===ignoreSection)continue;
      const values=concrete(state,section);
      if(!values.length)continue;
      const optionDomains=values.map(id=>OPTION_POSITIONS[id]||POSITIONS);
      const sectionDomain=union(optionDomains);
      domain=intersection(domain,sectionDomain);
      if(!domain.length)break;
    }
    return domain;
  }

  function contractFor(section,id){
    try{return global.StackUpScenarioCatalog?.get?.(section,id)||null;}catch(_){return null;}
  }

  function optionPositionDomain(section,option){
    if(OPTION_POSITIONS[option])return OPTION_POSITIONS[option];
    const c=contractFor(section,option);
    if(c?.hero)return [String(c.hero).toUpperCase()];
    if(Number(c?.tableSize)===2)return ['SB','BB'];
    return [...POSITIONS];
  }

  function optionStackDomain(section,option){
    if(OPTION_STACKS[option])return OPTION_STACKS[option];
    const c=contractFor(section,option);
    if(Number.isFinite(Number(c?.stackBb)))return [Number(c.stackBb)];
    if(c?.icmKind==='stack_5_8')return [5];
    if(c?.icmKind==='stack_9_12')return [10];
    if(c?.icmKind==='stack_13_18')return [15,18];
    if(c?.icmKind==='stack_19_25')return [20,25];
    return null;
  }

  function optionPhaseDomain(section,option){
    if(OPTION_PHASES[option])return OPTION_PHASES[option];
    const c=contractFor(section,option);
    if(c?.icmKind==='bubble')return ['bubble'];
    if(c?.icmKind==='final_table'||c?.icmKind==='three_handed')return ['ft'];
    if(c?.icmKind==='pay_jump')return ['late','ft'];
    return null;
  }

  function optionSeatDomain(section,option){
    const c=contractFor(section,option);
    if(Number(c?.tableSize)===2)return ['s2'];
    if(c?.icmKind==='three_handed')return ['s6','s8','s9','s10'];
    return null;
  }

  function tournamentContextReason(state,group,option){
    const mode=concrete(state,'mode')[0];
    const ttype=concrete(state,'ttype')[0];
    const tournamentOnly=group==='ttype'||group==='extras'||group==='fsize'||group==='fskill'||
      group==='phase'||group==='stack'||ADV_SECTIONS.includes(group);
    if(mode==='cash'&&tournamentOnly)return 'Disponível apenas em torneios';
    if(group==='pko_special'&&ttype&&ttype!=='pko'&&ttype!=='random')return 'Treino PKO requer torneio PKO';
    if(group==='icm_special'&&ttype==='freeze'&&option==='all')return null;
    return null;
  }

  function clearTournamentAdvance(state){
    ADV_SECTIONS.forEach(id=>resetAdvance(state,id));
    setOne(state,'ttype','random');
    setOne(state,'fskill','all');
    state.extras=[];
    setOne(state,'phase','all');
    setOne(state,'stack','all');
  }

  function opponentProfileActive(state){
    return concrete(state,'fskill').length>0;
  }
  function clearOpponentProfile(state){
    setOne(state,'fskill','all');
  }
  function normalizeOpponentProfileContext(state){
    // Current solved opponent-profile bank is explicit, not projected:
    // TOURNAMENT · FIELD 500 · REGULAR · MIDDLE · 6-max · PRE-FLOP.
    setOne(state,'mode','mtt');
    setOne(state,'fsize','500');
    setOne(state,'ttype','regular');
    setOne(state,'phase','middle');
    setOne(state,'seats','s6');
    setOne(state,'street','pre');
    state.extras=[];

    const pos=concrete(state,'pos');
    if(pos.length)setMany(state,'pos',intersection(pos,['SB','BB']),'all');

    const stack=concrete(state,'stack');
    if(stack.length){
      const supported=stack.filter(v=>{
        const n=Number(String(v).replace(/bb$/i,''));
        return Number.isInteger(n)&&n>=2&&n<=15;
      });
      setMany(state,'stack',supported,'all');
    }

    // A later explicit ADVANCE choice may replace the profile context, but a
    // profile selection itself must never inherit an unrelated special filter.
    ADV_SECTIONS.forEach(id=>resetAdvance(state,id));
  }

  function pruneAdvanceByStreet(state,streetValues){
    if(!streetValues.length)return;
    for(const section of ADV_SECTIONS){
      const values=concrete(state,section);
      if(!values.length)continue;
      const keep=values.filter(id=>intersection(optionStreetDomain(section,id),streetValues).length);
      setMany(state,section,keep,'all');
    }
  }

  function pruneAdvanceByPosition(state,positions){
    if(!positions.length)return;
    for(const section of ADV_SECTIONS){
      const values=concrete(state,section);
      if(!values.length)continue;
      const keep=values.filter(id=>intersection(optionPositionDomain(section,id),positions).length);
      setMany(state,section,keep,'all');
    }
  }

  function pruneAdvanceByStack(state,stacks){
    if(!stacks.length)return;
    const values=concrete(state,'icm_special');
    if(values.length){
      const keep=values.filter(id=>{
        const d=optionStackDomain('icm_special',id);
        return !d||intersection(d,stacks).length;
      });
      setMany(state,'icm_special',keep,'all');
    }
    const shorts=concrete(state,'short_special');
    if(shorts.length){
      const keep=shorts.filter(id=>{
        const d=optionStackDomain('short_special',id);
        return !d||intersection(d,stacks).length;
      });
      setMany(state,'short_special',keep,'all');
    }
  }

  function pruneAdvanceByPhase(state,phases){
    if(!phases.length)return;
    const values=concrete(state,'icm_special');
    if(!values.length)return;
    const keep=values.filter(id=>{
      const d=optionPhaseDomain('icm_special',id);
      return !d||intersection(d,phases).length;
    });
    setMany(state,'icm_special',keep,'all');
  }

  function normalize(input,trigger){
    const state=stateClone(input);
    const before=JSON.stringify(state);
    const t=trigger||{};
    const group=String(t.group||'');
    const option=String(t.option||'');
    const source=String(t.source||'');
    const isAdvance=ADV_SECTIONS.includes(group);

    // RANDOM and CASH are authoritative mode choices. CASH cannot carry tournament-only ADVANCE.
    if(group==='mode'&&(option==='cash'||option==='random')){
      clearTournamentAdvance(state);
    }

    // Any explicit tournament context or ADVANCE card makes the mode tournament.
    const tournamentTrigger=
      isAdvance&&option!=='all' ||
      group==='ttype'&&option!=='random' ||
      group==='extras' ||
      group==='fsize'||group==='fskill' ||
      group==='phase'&&option!=='all' ||
      group==='stack'&&option!=='all';
    if(tournamentTrigger)setOne(state,'mode','mtt');

    // PERFIL DO FIELD is solver-backed only in its native solved context.
    // Latest explicit choice wins: selecting the profile constrains the other
    // dimensions; selecting an incompatible dimension later clears the profile.
    if(group==='fskill'&&option!=='all'&&option!=='random'){
      normalizeOpponentProfileContext(state);
    }else if(opponentProfileActive(state)){
      const concreteOption=option!=='all'&&option!=='random';
      const incompatible=
        (group==='mode'&&option!=='mtt') ||
        (group==='fsize'&&option!=='500') ||
        (group==='ttype'&&option!=='regular') ||
        (group==='phase'&&option!=='middle') ||
        (group==='seats'&&option!=='s6') ||
        (group==='street'&&option!=='pre') ||
        (group==='pos'&&concreteOption&&!['SB','BB'].includes(option)) ||
        (group==='stack'&&concreteOption&&(()=>{
          const n=Number(String(option).replace(/bb$/i,''));
          return !Number.isInteger(n)||n<2||n>15;
        })()) ||
        (isAdvance&&concreteOption);
      if(incompatible)clearOpponentProfile(state);
    }

    // Freezeout is exclusive with rebuy/add-on.
    if(concrete(state,'ttype')[0]==='freeze')state.extras=[];

    // PKO ADVANCE requires a PKO tournament. A later non-PKO tournament choice wins.
    if(hasConcrete(state,'pko_special'))setOne(state,'ttype','pko');
    if(group==='ttype'&&option!=='pko'&&option!=='random')resetAdvance(state,'pko_special');

    // Heads-up ADVANCE is a true 2-max contract.
    if(concrete(state,'blind_special').includes('heads_up_2max')){
      setOne(state,'seats','s2');
      const p=concrete(state,'pos');
      if(p.length)setMany(state,'pos',intersection(p,['SB','BB']),'all');
    }
    if(group==='seats'&&option!=='s2'){
      const blind=concrete(state,'blind_special').filter(x=>x!=='heads_up_2max');
      setMany(state,'blind_special',blind,'all');
    }

    // Seat count constrains positions.
    const seat=concrete(state,'seats')[0];
    if(seat&&SEAT_POSITIONS[seat]){
      const p=concrete(state,'pos');
      if(p.length)setMany(state,'pos',intersection(p,SEAT_POSITIONS[seat]),'all');
    }

    // Latest explicit street choice wins over incompatible ADVANCE cards.
    const explicitStreets=concrete(state,'street');
    if(group==='street'&&option!=='all')pruneAdvanceByStreet(state,explicitStreets);

    // Selecting an ADVANCE card makes its street family authoritative and removes
    // incompatible ADVANCE families selected earlier.
    if(isAdvance&&option!=='all'){
      const triggerDomain=optionStreetDomain(group,option);
      for(const section of ADV_SECTIONS){
        if(section===group)continue;
        const values=concrete(state,section);
        if(!values.length)continue;
        const keep=values.filter(id=>intersection(optionStreetDomain(section,id),triggerDomain).length);
        setMany(state,section,keep,'all');
      }
      const street=concrete(state,'street');
      if(street.length){
        const keep=intersection(street,triggerDomain);
        setMany(state,'street',keep.length?keep:triggerDomain,'all');
      }
    }

    // Position: explicit AJUSTES choice prunes position-locked ADVANCE cards.
    const explicitPositions=concrete(state,'pos');
    if(group==='pos'&&option!=='all')pruneAdvanceByPosition(state,explicitPositions);

    // ADVANCE hero-position contracts constrain the AJUSTES position filter.
    if(isAdvance&&option!=='all'){
      const allowed=selectedPositionDomain(state);
      const p=concrete(state,'pos');
      if(p.length&&allowed.length)setMany(state,'pos',intersection(p,allowed).length?intersection(p,allowed):allowed,'all');
    }

    // Stack e fase explícitos em AJUSTES têm precedência e removem apenas
    // cards ADVANCE incompatíveis. Se estiverem em RANDOM, o próprio card
    // ADVANCE define o domínio sem reescrever visualmente AJUSTES.
    const explicitStacks=concrete(state,'stack').map(v=>Number(String(v).replace(/bb$/i,''))).filter(Number.isFinite);
    if(group==='stack'&&option!=='all')pruneAdvanceByStack(state,explicitStacks);

    const explicitPhases=concrete(state,'phase');
    if(group==='phase'&&option!=='all')pruneAdvanceByPhase(state,explicitPhases);

    // Defensive pass: no active ADVANCE combination may have an empty street domain.
    let domain=[...ALL_STREETS];
    for(const section of activeAdvance(state)){
      domain=intersection(domain,sectionStreetDomain(section,concrete(state,section)));
    }
    if(!domain.length){
      if(isAdvance&&option!=='all'){
        for(const section of ADV_SECTIONS){
          if(section===group)continue;
          if(hasConcrete(state,section)&&!intersection(sectionStreetDomain(section,concrete(state,section)),optionStreetDomain(group,option)).length){
            resetAdvance(state,section);
          }
        }
      }else{
        ADV_SECTIONS.forEach(id=>resetAdvance(state,id));
      }
    }

    // CASH never sends stale tournament state to the solver.
    if(concrete(state,'mode')[0]==='cash')clearTournamentAdvance(state);

    return {
      state,
      changed:before!==JSON.stringify(state),
      source,
      trigger:{group,option}
    };
  }

  function directReason(state,group,option){
    group=String(group||'');option=String(option||'');
    if(option==='all'||option==='random')return null;

    const mode=concrete(state,'mode')[0];
    const tournamentReason=tournamentContextReason(state,group,option);
    if(tournamentReason)return tournamentReason;
    if(group==='extras'&&concrete(state,'ttype')[0]==='freeze')return 'Freezeout não aceita rebuy/add-on';

    if(group==='pos'){
      const seat=concrete(state,'seats')[0];
      if(seat&&SEAT_POSITIONS[seat]&&!SEAT_POSITIONS[seat].includes(option))return 'Posição incompatível com o número de jogadores';
    }

    if(ADV_SECTIONS.includes(group)){
      const street=concrete(state,'street');
      if(street.length&&!intersection(optionStreetDomain(group,option),street).length)return 'Incompatível com o street selecionado';

      const otherStreetDomain=selectedStreetDomain(state,group);
      if(otherStreetDomain.length&&!intersection(optionStreetDomain(group,option),otherStreetDomain).length)return 'Incompatível com outro treino ADVANCE ativo';

      const pos=concrete(state,'pos');
      const pDomain=optionPositionDomain(group,option);
      if(pos.length&&!intersection(pos,pDomain).length)return 'Incompatível com a posição selecionada';

      const seat=concrete(state,'seats')[0];
      const seatDomain=optionSeatDomain(group,option);
      if(seat&&seatDomain&&!seatDomain.includes(seat))return 'Incompatível com o número de jogadores';
      if(option==='heads_up_2max'&&seat&&seat!=='s2')return 'Requer Heads-Up / 2 jogadores';

      const stack=concrete(state,'stack').map(v=>Number(String(v).replace(/bb$/i,''))).filter(Number.isFinite);
      const sd=optionStackDomain(group,option);
      if(stack.length&&sd&&!intersection(stack,sd).length)return 'Incompatível com o stack selecionado';

      const phase=concrete(state,'phase');
      const pd=optionPhaseDomain(group,option);
      if(phase.length&&pd&&!intersection(phase,pd).length)return 'Incompatível com a fase selecionada';
    }
    return null;
  }

  function candidateState(input,group,option){
    const state=stateClone(input);
    const current=state[group]||[];
    const semantics=policy().groupSemantics[group]||'exclusive';
    if(semantics==='cumulative-or'||semantics==='cumulative-and'){
      const next=concrete(state,group);
      if(option==='all'||option==='random')state[group]=[option];
      else if(!next.includes(option))state[group]=uniq([...next,option]);
    }else{
      state[group]=[option];
    }
    return state;
  }

  function disabled(input,group,option){
    const state=stateClone(input);
    group=String(group||'');option=String(option||'');
    if(option==='all'||option==='random')return null;

    const immediate=directReason(state,group,option);
    if(immediate)return immediate;

    // Prospective guard: evaluate the exact state that would exist after the click.
    // We do not call normalize() here because normalization may silently rewrite a
    // different dimension ("last choice wins"). A candidate is enabled only when
    // it can coexist with the current explicit selections as-is.
    const candidate=candidateState(state,group,option);

    const mode=concrete(candidate,'mode')[0];
    if(mode==='cash'){
      if(group!=='mode'&&(
        (group==='ttype'&&option!=='random')||group==='extras'||group==='fsize'||
        group==='fskill'||group==='phase'||group==='stack'||ADV_SECTIONS.includes(group)
      ))return 'Incompatível com CASH';
      if(hasConcrete(candidate,'icm_special'))return 'ICM não existe em CASH';
      if(hasConcrete(candidate,'pko_special'))return 'PKO não existe em CASH';
    }

    const seat=concrete(candidate,'seats')[0];
    const positions=concrete(candidate,'pos');
    if(seat&&SEAT_POSITIONS[seat]&&positions.some(p=>!SEAT_POSITIONS[seat].includes(p))){
      return 'A seleção contém posição inexistente nesta mesa';
    }

    // Every active ADVANCE family must share at least one legal street.
    let streets=[...ALL_STREETS];
    for(const section of activeAdvance(candidate)){
      streets=intersection(streets,sectionStreetDomain(section,concrete(candidate,section)));
      if(!streets.length)return 'Sem street possível com os filtros ativos';
    }
    const explicitStreet=concrete(candidate,'street');
    if(explicitStreet.length&&!intersection(streets,explicitStreet).length){
      return 'Sem street possível com a seleção atual';
    }

    // Position-locked cards and table size must retain at least one common seat.
    let posDomain=selectedPositionDomain(candidate);
    if(!posDomain.length)return 'Sem posição possível com os filtros ativos';
    if(positions.length&&!intersection(posDomain,positions).length){
      return 'Sem posição possível com a seleção atual';
    }

    // Table-size contracts are strict too. A 2-max contract cannot survive on a
    // larger table, and 3-handed ICM requires a tournament table capable of
    // reaching three players (not a native heads-up table).
    const candidateSeat=concrete(candidate,'seats')[0];
    for(const section of activeAdvance(candidate)){
      for(const id of concrete(candidate,section)){
        const seatDomain=optionSeatDomain(section,id);
        if(candidateSeat&&seatDomain&&!seatDomain.includes(candidateSeat)){
          return 'Sem número de jogadores possível com os filtros ativos';
        }
      }
    }

    // Tournament-type contracts are strict: do not rewrite the user's type.
    const ttype=concrete(candidate,'ttype')[0];
    if(hasConcrete(candidate,'pko_special')&&ttype&&ttype!=='pko'){
      return 'Treino PKO requer torneio PKO';
    }
    if(ttype==='freeze'&&concrete(candidate,'extras').length){
      return 'Freezeout não aceita rebuy/add-on';
    }

    // Explicit stack/phase choices must intersect every constrained active card.
    const stacks=concrete(candidate,'stack').map(v=>Number(String(v).replace(/bb$/i,''))).filter(Number.isFinite);
    const phases=concrete(candidate,'phase');
    for(const section of activeAdvance(candidate)){
      for(const id of concrete(candidate,section)){
        const sd=optionStackDomain(section,id);
        if(stacks.length&&sd&&!intersection(stacks,sd).length)return 'Sem stack possível com os filtros ativos';
        const pd=optionPhaseDomain(section,id);
        if(phases.length&&pd&&!intersection(phases,pd).length)return 'Sem fase possível com os filtros ativos';
      }
    }
    return null;
  }

  function policy(){
    return {
      groupSemantics:{
        mode:'exclusive',seats:'exclusive',ttype:'exclusive',extras:'cumulative-and',
        fsize:'exclusive',fskill:'exclusive',hands:'exclusive',
        phase:'cumulative-or',pos:'cumulative-or',street:'cumulative-or',stack:'cumulative-or',
        pre_special:'cumulative-or',blind_special:'cumulative-or',aggr_special:'cumulative-or',
        short_special:'cumulative-or',icm_special:'cumulative-or',pko_special:'cumulative-or',
        post_special:'cumulative-or',river_special:'cumulative-or',
        texture_special:'cumulative-or',math_special:'cumulative-or'
      },
      crossGroupSemantics:'AND after compatibility normalization',
      tournamentOnly:['ttype','extras','fsize','fskill','phase','stack',...ADV_SECTIONS],
      advanceSections:[...ADV_SECTIONS]
    };
  }

  global.StackUpFilterCompatibility=Object.freeze({
    normalize,disabled,policy,
    ADV_SECTIONS:Object.freeze([...ADV_SECTIONS])
  });
})(window);
