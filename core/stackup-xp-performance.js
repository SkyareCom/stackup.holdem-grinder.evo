/* StackUp Grinder — XP / PERFORMANCE engine.
   XP is awarded only for correct decisions. Difficulty is scenario-based:
   REC 10 XP, REG 20 XP, PRO 35 XP. */
(function(global){
  'use strict';

  const KEY='stackup.grinder.xp-performance.v1';
  const MIGRATION='stackup.grinder.xp-performance.backfill.v1';
  const WEIGHTS=Object.freeze({REC:10,REG:20,PRO:35});
  const RANKS=Object.freeze([
    {name:'REC',min:0,next:2500},
    {name:'REG',min:2500,next:7500},
    {name:'PRO',min:7500,next:null}
  ]);

  const PRO_OPTIONS=new Set([
    'facing_4bet','4bet_bluff','4bet_value','call_4bet',
    'icm_bubble','icm_pay_jump','icm_final_table','icm_3handed',
    'big_stack_pressure','mid_stack_pressure','short_stack_survival',
    'pko_math','bounty_call','bounty_shove','bounty_iso','covering_stack','covered_stack',
    'triple_barrel','river_bluff_catch','vs_overbet','block_bet_20_25','river_check_raise','thin_value','value_river',
    'overbet_125','overbet_150','mdf','breakeven_bluff','breakeven_call','equity_realization','blockers'
  ]);
  const PRO_SECTIONS=new Set(['icm_special','pko_special','river_special','math_special']);
  const REG_SECTIONS=new Set(['pre_special','blind_special','aggr_special','short_special','post_special','texture_special']);

  function read(){
    try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}
  }
  function write(v){try{localStorage.setItem(KEY,JSON.stringify((v||[]).slice(-25000)));return true;}catch(_){return false;}}
  function uniq(v){return [...new Set((Array.isArray(v)?v:[]).filter(Boolean).map(String))];}
  function normStreet(v){
    const x=String(v||'').toUpperCase().replace('_','-');
    if(x==='PRE'||x==='PREFLOP'||x==='PRE-FLOP')return 'PRE-FLOP';
    return x;
  }
  function specialEntries(filters){
    let special=filters?.special||{};
    if(typeof special==='string'){try{special=JSON.parse(special);}catch(_){special={};}}
    const out=[];
    Object.entries(special||{}).forEach(([section,values])=>{
      (Array.isArray(values)?values:[values]).filter(v=>v&&v!=='all'&&v!=='random').forEach(value=>out.push({section:String(section),value:String(value)}));
    });
    return out;
  }
  function explicitDifficulty(input){
    const raw=String(input?.difficulty||input?.level||input?.scenario?.difficulty||input?.filters?.difficulty||input?.filters?.level||'').toLowerCase();
    if(['pro','professional'].includes(raw))return 'PRO';
    if(['reg','regular','advanced','adv','intermediate','int'].includes(raw))return 'REG';
    if(['rec','recreational','beginner','beg'].includes(raw))return 'REC';
    return null;
  }
  function classify(input){
    const explicit=explicitDifficulty(input);if(explicit)return explicit;
    const filters=input?.filters||{},scenario=input?.scenario||{};
    const special=specialEntries(filters);
    if(special.some(x=>PRO_SECTIONS.has(x.section)||PRO_OPTIONS.has(x.value)))return 'PRO';

    const street=normStreet(input?.street||scenario?.street||filters?.street||(Array.isArray(filters?.streets)&&filters.streets.length===1?filters.streets[0]:''));
    const phase=String(filters?.phase||(Array.isArray(filters?.phases)&&filters.phases.length===1?filters.phases[0]:'')).toLowerCase();
    const stack=Number(scenario?.effectiveStack??filters?.effectiveStack??(Array.isArray(filters?.effectiveStacks)&&filters.effectiveStacks.length===1?filters.effectiveStacks[0]:NaN));
    const table=Number(scenario?.tableSize??filters?.tableSize??NaN);
    const tournament=String(filters?.tournamentType||'').toLowerCase();

    if((phase==='ft'||phase==='bubble')&&Number.isFinite(stack)&&stack<=25)return 'PRO';
    if(['pko','hroller'].includes(tournament))return 'PRO';
    if(special.some(x=>REG_SECTIONS.has(x.section)))return 'REG';
    if(['TURN','RIVER'].includes(street))return 'REG';
    if(['bubble','late','ft'].includes(phase))return 'REG';
    if(Number.isFinite(stack)&&stack<=25)return 'REG';
    if(Number.isFinite(table)&&table<=6)return 'REG';
    return 'REC';
  }
  function sections(input){
    const base=uniq(input?.sections);
    if(base.length)return base;
    const special=specialEntries(input?.filters||{});
    if(special.length)return uniq(special.map(x=>x.value));
    const street=normStreet(input?.street||input?.scenario?.street);
    return [street||'GERAL'];
  }
  function eventKey(input){
    return String(input?.eventKey||[
      input?.sessionId||'session',
      input?.spotId||'spot',
      input?.answeredAt||'time',
      input?.hand||''
    ].join('|'));
  }
  function evaluate(input){
    const difficulty=classify(input),weight=WEIGHTS[difficulty]||WEIGHTS.REC,status=String(input?.status||'unknown');
    const correct=status==='correct';
    return {
      difficulty,weight,
      xpEarned:correct?weight:0,
      villainPotential:correct?0:weight,
      sections:sections(input),
      status
    };
  }
  function record(input){
    const key=eventKey(input),items=read();
    const old=items.find(x=>x.key===key);
    if(old)return {...old,awarded:false};
    const ev=evaluate(input);
    const entry={
      key,
      sessionId:String(input?.sessionId||''),
      spotId:String(input?.spotId||''),
      answeredAt:String(input?.answeredAt||new Date().toISOString()),
      training:String(input?.training||''),
      sections:ev.sections,
      street:String(input?.street||input?.scenario?.street||''),
      heroPosition:String(input?.heroPosition||input?.scenario?.heroPosition||''),
      difficulty:ev.difficulty,
      weight:ev.weight,
      status:ev.status,
      xpEarned:ev.xpEarned,
      villainPotential:ev.villainPotential,
      prescriptionId:input?.prescriptionId?String(input.prescriptionId):null
    };
    items.push(entry);write(items);
    return {...entry,awarded:true};
  }
  function backfill(records){
    let added=0;
    (records||[]).forEach(r=>{const e=record(r);if(e.awarded)added++;});
    try{localStorage.setItem(MIGRATION,new Date().toISOString());}catch(_){}
    return added;
  }
  function events(){return read();}
  function rank(totalXP){
    const xp=Math.max(0,Number(totalXP)||0);
    const r=RANKS.slice().reverse().find(x=>xp>=x.min)||RANKS[0];
    const next=r.next;
    const progress=next==null?100:Math.max(0,Math.min(100,(xp-r.min)/(next-r.min)*100));
    return {
      name:r.name,xp,min:r.min,next,
      progress,
      remaining:next==null?0:Math.max(0,next-xp)
    };
  }
  function summary(){
    const all=events(),heroXP=all.reduce((n,x)=>n+Number(x.xpEarned||0),0),villainXP=all.reduce((n,x)=>n+Number(x.villainPotential||0),0);
    const correct=all.filter(x=>x.status==='correct').length,adjustable=all.filter(x=>x.status==='adjustable').length,incorrect=all.filter(x=>x.status==='incorrect').length;
    const total=all.length,opportunity=heroXP+villainXP;
    const byDifficulty=['REC','REG','PRO'].map(name=>{
      const items=all.filter(x=>x.difficulty===name);
      return {
        name,weight:WEIGHTS[name],spots:items.length,
        correct:items.filter(x=>x.status==='correct').length,
        xp:items.reduce((n,x)=>n+Number(x.xpEarned||0),0),
        lost:items.reduce((n,x)=>n+Number(x.villainPotential||0),0)
      };
    });
    const map=new Map();
    all.forEach(ev=>ev.sections.forEach(section=>{
      if(!map.has(section))map.set(section,{name:section,xp:0,lost:0,spots:0,correct:0});
      const x=map.get(section);x.xp+=Number(ev.xpEarned||0);x.lost+=Number(ev.villainPotential||0);x.spots++;if(ev.status==='correct')x.correct++;
    }));
    const bySection=[...map.values()].sort((a,b)=>b.xp-a.xp||b.correct-a.correct||a.name.localeCompare(b.name));
    const ordered=[...all].sort((a,b)=>String(a.answeredAt).localeCompare(String(b.answeredAt)));
    let streak=0,best=0;
    ordered.forEach(x=>{if(x.status==='correct'){streak++;best=Math.max(best,streak);}else streak=0;});
    let current=0;
    for(let i=ordered.length-1;i>=0;i--){if(ordered[i].status==='correct')current++;else break;}
    return {
      total,correct,adjustable,incorrect,
      heroXP,villainXP,opportunity,
      heroShare:opportunity?heroXP/opportunity*100:0,
      villainShare:opportunity?villainXP/opportunity*100:0,
      rank:rank(heroXP),
      byDifficulty,bySection,
      currentStreak:current,bestStreak:best,
      recent:[...all].sort((a,b)=>String(b.answeredAt).localeCompare(String(a.answeredAt))).slice(0,20)
    };
  }

  global.StackUpXPPerformance=Object.freeze({
    WEIGHTS,RANKS,classify,evaluate,record,backfill,events,summary,rank
  });
})(window);
