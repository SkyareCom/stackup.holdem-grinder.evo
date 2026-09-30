/* StackUp Hold'em Grinder EVO — solver-grounded didactic coach.
   The coach explains the solver result; it never fabricates unavailable statistics.
   It evaluates 35 poker indicators, marks unavailable/non-applicable inputs explicitly,
   and keeps the solver strategy/frequencies as the decision source of truth. */
(function(global){
  'use strict';

  const I18N={
    pt:{
      status:{correct:'JOGADA CORRETA',adjustable:'JOGADA AJUSTÁVEL',incorrect:'JOGADA INCORRETA',unknown:'ANÁLISE INDISPONÍVEL'},
      positive:'AÇÃO +EV',indicated:'AÇÃO INDICADA',solver:'SOLVER',frequency:'FREQUÊNCIA',notAvailable:'não disponível neste nó',notApplicable:'não se aplica neste spot',
      intro:'Leitura do spot',strategy:'Estratégia do solver',math:'Matemática da decisão',ranges:'Guerra de ranges',diagnosis:'Síntese didática',
      noRange:'o solver deste nó não expõe o range completo',mix:'A estratégia é mista: mais de uma ação aparece com frequência material.',
      pure:'A estratégia é concentrada: a ação principal domina a frequência do combo.',
      chosen:'A ação do herói',best:'A ação de maior frequência',pot:'pote',stack:'stack efetivo',spr:'SPR',board:'board',hand:'mão',
      rangeHero:'Range do herói',rangeVillain:'Range do adversário',source:'Fonte',indicators:'35 INDICADORES CONSIDERADOS'
    },
    en:{
      status:{correct:'CORRECT PLAY',adjustable:'ADJUSTABLE PLAY',incorrect:'INCORRECT PLAY',unknown:'ANALYSIS UNAVAILABLE'},
      positive:'+EV ACTION',indicated:'INDICATED ACTION',solver:'SOLVER',frequency:'FREQUENCY',notAvailable:'not available in this node',notApplicable:'not applicable to this spot',
      intro:'Spot reading',strategy:'Solver strategy',math:'Decision math',ranges:'Range war',diagnosis:'Didactic summary',
      noRange:'this solver node does not expose the complete range',mix:'The strategy is mixed: more than one action has material frequency.',
      pure:'The strategy is concentrated: the main action dominates this combo.',
      chosen:'Hero action',best:'Highest-frequency action',pot:'pot',stack:'effective stack',spr:'SPR',board:'board',hand:'hand',
      rangeHero:'Hero range',rangeVillain:'Opponent range',source:'Source',indicators:'35 INDICATORS CONSIDERED'
    },
    es:{
      status:{correct:'JUGADA CORRECTA',adjustable:'JUGADA AJUSTABLE',incorrect:'JUGADA INCORRECTA',unknown:'ANÁLISIS NO DISPONIBLE'},
      positive:'ACCIÓN +EV',indicated:'ACCIÓN INDICADA',solver:'SOLVER',frequency:'FRECUENCIA',notAvailable:'no disponible en este nodo',notApplicable:'no se aplica en este spot',
      intro:'Lectura del spot',strategy:'Estrategia del solver',math:'Matemática de la decisión',ranges:'Guerra de rangos',diagnosis:'Síntesis didáctica',
      noRange:'este nodo del solver no expone el rango completo',mix:'La estrategia es mixta: más de una acción tiene frecuencia material.',
      pure:'La estrategia está concentrada: la acción principal domina la frecuencia del combo.',
      chosen:'Acción del héroe',best:'Acción de mayor frecuencia',pot:'bote',stack:'stack efectivo',spr:'SPR',board:'board',hand:'mano',
      rangeHero:'Rango del héroe',rangeVillain:'Rango del rival',source:'Fuente',indicators:'35 INDICADORES CONSIDERADOS'
    }
  };

  const INDICATOR_NAMES={
    pt:[
      'Stack efetivo','Posição relativa','PFR / iniciativa pré-flop','Formato do pote','Contagem de jogadores / multiway',
      'Matriz de abertura GTO (RFI)','Índice de 3-bet / 4-bet','Fold to 3-bet','Frequência de limp','Pot odds',
      'Implied odds','Stack-to-pot ratio (SPR)','Textura do board','Nut advantage','Range advantage',
      'Donk bet','Frequência de c-bet','Índice de delayed c-bet','Sizing da aposta','Realização de equity',
      'Contagem de outs','Regra dos 2 e 4','Card removal / variação de board','Fold equity','Double / triple barrel',
      'Aggression factor','Classificação absoluta da mão','Blockers','Alpha do blefe (break-even fold)','Minimum Defense Frequency (MDF)',
      'Frequência de check-raise','WTSD (Went to Showdown)','W$SD (Won at Showdown)','EV (valor esperado)','Exploit vs. GTO'
    ],
    en:[
      'Effective stack','Relative position','PFR / preflop initiative','Pot format','Player count / multiway',
      'GTO opening matrix (RFI)','3-bet / 4-bet index','Fold to 3-bet','Limp frequency','Pot odds',
      'Implied odds','Stack-to-pot ratio (SPR)','Board texture','Nut advantage','Range advantage',
      'Donk bet','C-bet frequency','Delayed c-bet index','Bet sizing','Equity realization',
      'Out count','Rule of 2 and 4','Card removal / board variation','Fold equity','Double / triple barrel',
      'Aggression factor','Absolute hand class','Blockers','Bluff alpha (break-even fold)','Minimum Defense Frequency (MDF)',
      'Check-raise frequency','WTSD (Went to Showdown)','W$SD (Won at Showdown)','EV (expected value)','Exploit vs. GTO'
    ],
    es:[
      'Stack efectivo','Posición relativa','PFR / iniciativa preflop','Formato del bote','Conteo de jugadores / multiway',
      'Matriz de apertura GTO (RFI)','Índice de 3-bet / 4-bet','Fold to 3-bet','Frecuencia de limp','Pot odds',
      'Implied odds','Stack-to-pot ratio (SPR)','Textura del board','Nut advantage','Range advantage',
      'Donk bet','Frecuencia de c-bet','Índice de delayed c-bet','Sizing de apuesta','Realización de equity',
      'Conteo de outs','Regla del 2 y 4','Card removal / variación de board','Fold equity','Double / triple barrel',
      'Aggression factor','Clasificación absoluta de la mano','Blockers','Alpha del bluff (break-even fold)','Minimum Defense Frequency (MDF)',
      'Frecuencia de check-raise','WTSD (Went to Showdown)','W$SD (Won at Showdown)','EV (valor esperado)','Exploit vs. GTO'
    ]
  };

  const RANK_VALUE={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14};
  const POS_ORDER=['SB','BB','UTG','UTG+1','UTG+2','MP','LJ','HJ','CO','BTN'];

  function lang(value){ return I18N[value]?value:'pt'; }
  function t(value){ return I18N[lang(value)]; }
  function n(value,fallback=null){ if(value===null||value===undefined||value==='')return fallback; const x=Number(value); return Number.isFinite(x)?x:fallback; }
  function pct(value,d=1){ return Number.isFinite(Number(value))?Number(value).toFixed(d).replace('.',',')+'%':'—'; }
  function bb(value,d=1){ return Number.isFinite(Number(value))?Number(value).toFixed(d).replace('.',',')+' BB':'—'; }
  function esc(value){ return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function normalizeCard(card){
    const m=String(card||'').trim().match(/^(10|[2-9TJQKA])([cdhs])$/i);
    if(!m)return null;
    return {rank:(m[1].toUpperCase()==='10'?'T':m[1].toUpperCase()),suit:m[2].toLowerCase(),raw:String(card)};
  }
  function actionKind(action){
    if(global.StackUpSpotsEngine?.normalizeActionKind)return global.StackUpSpotsEngine.normalizeActionKind(action);
    const s=String(action?.kind||action?.action||action||'').toLowerCase().replace(/[ _-]+/g,'');
    if(/fold/.test(s))return 'fold'; if(/check/.test(s))return 'check'; if(/call/.test(s))return 'call';
    if(/allin|jam|shove/.test(s))return 'jam'; if(/raise|bet/.test(s))return 'raise'; return s||'unknown';
  }
  function actionLabel(action){
    if(!action)return '—';
    const raw=String(action.action||action.label||action.kind||action||'').trim();
    const kind=actionKind(action);
    const to=n(action.to??action.amount??action.size);
    if(kind==='jam')return 'ALL IN';
    if(kind==='fold')return 'FOLD';
    if(kind==='check')return 'CHECK';
    if(kind==='call')return 'CALL'+(to!==null?' '+to:'');
    if(kind==='raise'){
      if(raw&&raw.toLowerCase()!=='raise')return raw.toUpperCase();
      return 'RAISE'+(to!==null?' '+to:'');
    }
    return raw.toUpperCase()||'—';
  }
  function uiActionLabel(uiAction,result){
    if(result?.selected)return actionLabel(result.selected);
    return ({check:'CHECK',call:'CALL',fold:'FOLD',raise:'RAISE',raise1:'RAISE 1',raise2:'RAISE 2',allin:'ALL IN'})[uiAction]||String(uiAction||'—').toUpperCase();
  }
  function strategyForHand(spot,hand){
    try{return global.StackUpSpotsEngine?.strategyForHand?.(spot,hand)||null;}catch(_){return null;}
  }
  function rangeEntries(raw){
    if(!raw||typeof raw!=='string'||raw==='solver-blueprint')return [];
    return raw.split(',').map(x=>{
      const [hand,w]=x.split(':');
      const weight=n(w,1);
      return hand?{hand:hand.trim(),weight:weight===null?1:weight}:null;
    }).filter(Boolean);
  }
  function summarizeRange(raw,spot,which){
    const parsed=rangeEntries(raw);
    if(parsed.length){
      const avg=parsed.reduce((s,x)=>s+x.weight,0);
      const top=[...parsed].sort((a,b)=>b.weight-a.weight).slice(0,14).map(x=>x.hand+(x.weight<.995?' '+pct(x.weight*100,0):'')).join(', ');
      return {explicit:true,count:parsed.length,weight:avg,text:top};
    }
    if(which==='hero'&&Array.isArray(spot?.strategy)){
      const active=spot.strategy.map(h=>{
        const aggressive=(h.actions||[]).filter(a=>['raise','jam'].includes(actionKind(a))).reduce((sum,a)=>sum+(n(a.frequency,0)||0),0);
        return aggressive>=2?String(h.hand):null;
      }).filter(Boolean);
      if(active.length)return {explicit:false,count:active.length,weight:null,text:active.slice(0,18).join(', ')+(active.length>18?'…':'')};
    }
    return {explicit:false,count:0,weight:null,text:null};
  }
  function boardTags(board){
    const cards=(board||[]).map(normalizeCard).filter(Boolean);
    if(cards.length<3)return [];
    const ranks=cards.map(c=>RANK_VALUE[c.rank]);
    const suits=cards.map(c=>c.suit);
    const tags=[];
    const uniq=new Set(ranks);
    const counts={}; suits.forEach(s=>counts[s]=(counts[s]||0)+1);
    if(uniq.size<ranks.length)tags.push('paired');
    if(Math.max(...Object.values(counts))>=3)tags.push('monotone');
    else if(Object.values(counts).some(v=>v===2))tags.push('two-tone');
    const sorted=[...uniq].sort((a,b)=>a-b);
    let minSpan=99;
    for(let i=0;i<sorted.length;i++)for(let j=i+2;j<sorted.length;j++)minSpan=Math.min(minSpan,sorted[j]-sorted[i]);
    if(minSpan<=4||(Math.max(...ranks)-Math.min(...ranks)<=5&&uniq.size>=3))tags.push('connected');
    else tags.push('dry');
    if(Math.max(...ranks)>=12)tags.push('high-card');
    if(Math.max(...ranks)<=9)tags.push('low');
    return tags;
  }
  function preflopClass(cards){
    const c=(cards||[]).map(normalizeCard).filter(Boolean);
    if(c.length<2)return '—';
    const a=c[0],b=c[1],v1=RANK_VALUE[a.rank],v2=RANK_VALUE[b.rank];
    if(a.rank===b.rank)return 'pocket pair '+a.rank+a.rank;
    const suited=a.suit===b.suit;
    const hi=Math.max(v1,v2),lo=Math.min(v1,v2),gap=hi-lo;
    const broad=hi>=10&&lo>=10;
    if(broad)return (suited?'broadway suited':'broadway offsuit');
    if(gap===1&&suited)return 'suited connector';
    if(gap<=2&&suited)return 'suited gapper';
    if(hi===14)return suited?'ace-x suited':'ace-x offsuit';
    return suited?'suited hand':'offsuit hand';
  }
  function postflopClass(cards){
    const cs=(cards||[]).map(normalizeCard).filter(Boolean);
    if(cs.length<5)return preflopClass(cs.slice(0,2));
    const ranks=cs.map(c=>RANK_VALUE[c.rank]);
    const freq={}; ranks.forEach(v=>freq[v]=(freq[v]||0)+1);
    const counts=Object.values(freq).sort((a,b)=>b-a);
    const suits={}; cs.forEach(c=>suits[c.suit]=(suits[c.suit]||0)+1);
    const flush=Math.max(...Object.values(suits))>=5;
    const uniq=[...new Set(ranks)].sort((a,b)=>a-b);
    if(uniq.includes(14))uniq.unshift(1);
    let run=1,straight=false; for(let i=1;i<uniq.length;i++){run=uniq[i]===uniq[i-1]+1?run+1:1;if(run>=5)straight=true;}
    if(counts[0]===4)return 'quadra';
    if(counts[0]===3&&counts[1]>=2)return 'full house';
    if(flush)return 'flush';
    if(straight)return 'sequência';
    if(counts[0]===3)return 'trinca';
    if(counts[0]===2&&counts[1]===2)return 'dois pares';
    if(counts[0]===2)return 'um par';
    return 'carta alta';
  }
  function inferPotType(scenario){
    if(scenario?.potType)return String(scenario.potType).toUpperCase();
    const raises=(scenario?.actionHistory||[]).filter(a=>['raise','jam'].includes(actionKind(a))).length;
    if(raises>=3)return '4-BET+';
    if(raises===2)return '3-BET';
    if(raises===1)return 'SRP';
    return String(scenario?.street||'').toUpperCase().includes('PRE')?'UNOPENED / RFI':'SRP / NÃO INFORMADO';
  }
  function initiative(scenario){
    const raises=(scenario?.actionHistory||[]).filter(a=>['raise','jam'].includes(actionKind(a)));
    if(!raises.length)return null;
    const last=raises[raises.length-1];
    return String(last.position||last.actor||last.player||'').toUpperCase()||null;
  }
  function heroPlayer(tableState,heroPosition){
    return tableState?.players?.find(p=>String(p.position).toUpperCase()===String(heroPosition||'').toUpperCase())||null;
  }
  function mathSnapshot(spot,view,result,tableState){
    const scenario=spot?.scenario||{};
    const pot=n(tableState?.pot,n(view?.pot,n(scenario.pot,0)))||0;
    const eff=n(scenario.effectiveStack,0)||0;
    const spr=pot>0?eff/pot:null;
    const hero=heroPlayer(tableState,view?.heroPosition||scenario.heroPosition);
    const currentBet=n(tableState?.currentBet,0)||0;
    const committed=n(hero?.committed,0)||0;
    const callCost=Math.max(0,currentBet-committed);
    const hasCall=(result?.strategy||[]).some(a=>actionKind(a)==='call');
    const potOdds=hasCall&&callCost>0?(callCost/(pot+callCost))*100:null;
    const sel=result?.selected||null;
    const kind=actionKind(sel||{kind:result?.uiAction});
    const target=n(sel?.to);
    let risk=null;
    if(kind==='raise'&&target!==null)risk=Math.max(0,target-committed);
    if(kind==='jam')risk=Math.max(0,n(hero?.stack,eff)||eff);
    const street=String(view?.street||scenario.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
    const postflop=street!=='PRE-FLOP';
    const sizingPct=postflop&&risk!==null&&pot>0?(risk/pot)*100:null;
    const alpha=postflop&&risk!==null&&risk>0&&pot>=0?(risk/(pot+risk))*100:null;
    const mdf=alpha!==null?100-alpha:null;
    return {pot,eff,spr,currentBet,committed,callCost,potOdds,target,risk,sizingPct,alpha,mdf};
  }
  function rangeBlockers(villainRange,heroCards){
    const entries=rangeEntries(villainRange);
    const cards=(heroCards||[]).map(normalizeCard).filter(Boolean);
    const ranks=[...new Set(cards.map(c=>c.rank))];
    if(!entries.length||!ranks.length)return null;
    const affected=entries.filter(x=>ranks.some(r=>String(x.hand).toUpperCase().includes(r))).length;
    return {affected,total:entries.length,ranks};
  }
  function classify(result){
    const chosen=n(result?.frequency,0)||0;
    const best=n(result?.best?.frequency,0)||0;
    if(!result||!result.ok||chosen<2)return 'incorrect';
    if(chosen>=20&&chosen>=best*.65)return 'correct';
    return 'adjustable';
  }
  const INDICATOR_IMPACT={
    pt:[
      'Define a profundidade da árvore e quanto espaço existe para decisões nas streets seguintes.',
      'IP/OOP altera realização de equity, frequência de check e capacidade de pressionar o range adversário.',
      'A iniciativa determina quem representa melhor as mãos fortes e quem tende a carregar mais checks.',
      'SRP, 3-bet e 4-bet mudam drasticamente a largura dos ranges e os sizings eficientes.',
      'Quanto mais jogadores ativos, menor tende a ser a frequência de blefes e maior a exigência de força/equity.',
      'A matriz de abertura delimita quais combos chegam legitimamente ao nó pré-flop.',
      '3-bets e 4-bets comprimem os ranges e aumentam o valor de blockers e mãos robustas.',
      'A propensão de fold diante de 3-bet define o quanto a pressão pré-flop pode ser ampliada.',
      'Limps alteram a composição dos ranges e a relação entre mãos fortes, médias e especulativas.',
      'Pot odds definem a equity mínima necessária para um call ser imediatamente justificável.',
      'Implied odds adicionam valor quando ainda há fichas que podem ser ganhas em streets futuras.',
      'SPR mostra o quanto do stack resta em relação ao pote e orienta compromisso, pressão e sizings.',
      'A textura do board determina conectividade, draws, distribuição de nuts e frequência de apostas.',
      'Nut advantage permite sustentar sizings grandes porque um range contém mais combinações muito fortes.',
      'Range advantage influencia a frequência com que um jogador pode apostar pequenas frações do range.',
      'Donk bet altera a ordem estratégica padrão e só é valorizado quando a árvore do spot o suporta.',
      'A frequência de c-bet mostra quanto o agressor pode continuar pressionando naquele flop.',
      'Delayed c-bet mede a pressão transferida para turn depois de o flop passar em check.',
      'O sizing altera diretamente risco, recompensa, alpha do blefe e MDF do adversário.',
      'Realização de equity mede quanto da equity teórica realmente pode ser convertida em valor.',
      'Outs indicam quantas cartas futuras melhoram a mão para uma classe relevante de showdown.',
      'A regra dos 2 e 4 é uma aproximação rápida da chance de completar draws no turn/river.',
      'Card removal muda a quantidade de combinações fortes, draws e bluff-catchers disponíveis.',
      'Fold equity é a parcela do EV agressivo que vem de o adversário abandonar imediatamente.',
      'Double/triple barrel avalia se a história de agressão permanece coerente em streets futuras.',
      'Aggression factor contextualiza tendências populacionais; sem amostra, não deve ser inventado.',
      'A força absoluta da mão separa value, showdown value, bluff-catcher e blefes/draws.',
      'Blockers ajudam a escolher combos de aposta/blefe que removem continuações fortes do adversário.',
      'Alpha mostra o percentual mínimo de folds necessário para um blefe puro empatar no sizing usado.',
      'MDF oferece uma referência teórica da fração mínima do range que deve continuar contra a aposta.',
      'Check-raise combina proteção de range, value e blefes; sua frequência depende da textura e do range.',
      'WTSD ajuda a estimar propensão de levar mãos ao showdown, mas exige histórico populacional.',
      'W$SD ajuda a medir qualidade média das mãos que chegam ao showdown, também exigindo amostra.',
      'EV é o critério final do solver: entre linhas comparáveis, a estratégia maximiza valor esperado.',
      'Exploit só deve desviar do baseline GTO quando houver evidência confiável do comportamento adversário.'
    ],
    en:[
      'Defines tree depth and how much decision space remains on later streets.',
      'IP/OOP changes equity realization, checking frequency and the ability to pressure the opponent range.',
      'Initiative shapes which player can represent strong hands more naturally and who carries more checks.',
      'SRP, 3-bet and 4-bet pots materially change range width and efficient sizing.',
      'More active players usually reduce bluffing frequency and demand stronger value/equity.',
      'The opening matrix defines which combinations legitimately reach the preflop node.',
      '3-bets and 4-bets compress ranges and increase the importance of blockers and robust hands.',
      'Fold-to-3-bet tendency determines how much preflop pressure can be applied.',
      'Limping changes range composition and the balance of strong, medium and speculative hands.',
      'Pot odds define the minimum equity needed for an immediate call.',
      'Implied odds add value when future streets can still win additional chips.',
      'SPR shows remaining stack relative to the pot and guides commitment, pressure and sizing.',
      'Board texture determines connectivity, draws, nut distribution and betting frequency.',
      'Nut advantage supports larger sizing because one range contains more very strong combinations.',
      'Range advantage influences how often a player can bet a broad portion of the range.',
      'Donk betting changes the normal strategic order and matters only when the spot tree supports it.',
      'C-bet frequency shows how often the aggressor can keep applying pressure on that flop.',
      'Delayed c-bet measures pressure moved to the turn after checking the flop.',
      'Sizing directly changes risk, reward, bluff alpha and the opponent MDF.',
      'Equity realization measures how much theoretical equity can actually be converted into value.',
      'Outs count future cards that improve the hand into a relevant showdown class.',
      'The rule of 2 and 4 is a quick approximation for completing draws by turn/river.',
      'Card removal changes the number of strong hands, draws and bluff-catchers available.',
      'Fold equity is the part of aggressive EV created by immediate folds.',
      'Double/triple barrels test whether continued aggression stays coherent across later streets.',
      'Aggression factor is a population statistic and should not be fabricated without a sample.',
      'Absolute hand class separates value, showdown value, bluff-catchers and bluffs/draws.',
      'Blockers help choose betting/bluffing combos that remove strong opponent continuations.',
      'Alpha is the minimum fold percentage required for a pure bluff to break even at that sizing.',
      'MDF is a theoretical reference for the minimum portion of range that should continue.',
      'Check-raise frequency balances protection, value and bluffs according to board and ranges.',
      'WTSD estimates showdown tendency but requires historical population data.',
      'W$SD estimates the quality of hands reaching showdown and also requires a sample.',
      'EV is the solver objective: among comparable lines, strategy maximizes expected value.',
      'Exploit should depart from the GTO baseline only when reliable opponent evidence exists.'
    ],
    es:[
      'Define la profundidad del árbol y cuánto espacio de decisión queda en las siguientes calles.',
      'IP/OOP cambia la realización de equity, la frecuencia de check y la capacidad de presionar el rango rival.',
      'La iniciativa define quién representa mejor manos fuertes y quién carga más checks.',
      'SRP, 3-bet y 4-bet cambian de forma importante el ancho de rangos y los sizings eficientes.',
      'Más jugadores activos suele reducir los bluffs y exigir más fuerza/equity.',
      'La matriz de apertura delimita qué combos llegan legítimamente al nodo preflop.',
      '3-bets y 4-bets comprimen rangos y aumentan el valor de blockers y manos robustas.',
      'Fold to 3-bet define cuánto puede ampliarse la presión preflop.',
      'Los limps cambian la composición de rangos y el balance entre manos fuertes, medias y especulativas.',
      'Pot odds definen la equity mínima necesaria para que un call sea justificable de inmediato.',
      'Implied odds agregan valor cuando aún se pueden ganar fichas en calles futuras.',
      'SPR muestra el stack restante respecto al bote y guía compromiso, presión y sizings.',
      'La textura del board determina conectividad, draws, distribución de nuts y frecuencia de apuesta.',
      'Nut advantage permite sizings grandes porque un rango contiene más combinaciones muy fuertes.',
      'Range advantage influye en cuánto puede apostarse una parte amplia del rango.',
      'Donk bet cambia el orden estratégico normal y sólo pesa cuando el árbol del spot lo soporta.',
      'La frecuencia de c-bet indica cuánto puede seguir presionando el agresor en ese flop.',
      'Delayed c-bet mide la presión trasladada al turn después de checkear el flop.',
      'El sizing cambia directamente riesgo, recompensa, alpha del bluff y MDF del rival.',
      'Realización de equity mide cuánta equity teórica puede convertirse realmente en valor.',
      'Outs cuentan cartas futuras que mejoran la mano a una clase relevante de showdown.',
      'La regla del 2 y 4 aproxima rápidamente la probabilidad de completar draws.',
      'Card removal cambia la cantidad de manos fuertes, draws y bluff-catchers disponibles.',
      'Fold equity es la parte del EV agresivo generada por folds inmediatos.',
      'Double/triple barrel comprueba si la agresión sigue siendo coherente en calles futuras.',
      'Aggression factor es una estadística poblacional y no debe inventarse sin muestra.',
      'La fuerza absoluta separa value, showdown value, bluff-catchers y bluffs/draws.',
      'Blockers ayudan a elegir combos que eliminan continuaciones fuertes del rival.',
      'Alpha es el porcentaje mínimo de folds necesario para que un bluff puro quede break-even.',
      'MDF es una referencia teórica de la fracción mínima del rango que debería continuar.',
      'Check-raise equilibra protección, value y bluffs según textura y rangos.',
      'WTSD estima tendencia a llegar al showdown, pero exige datos históricos.',
      'W$SD estima la calidad de las manos que llegan al showdown y también exige muestra.',
      'EV es el objetivo del solver: entre líneas comparables, maximiza el valor esperado.',
      'Exploit sólo debe apartarse del baseline GTO cuando exista evidencia fiable del rival.'
    ]
  };

  function indicator(index,name,value,note,source,applicable=true){
    return {index,name,value:value??'—',note:note||'',calculation:note||'',source:source||'spot',applicable};
  }
  function makeIndicators(ctx){
    const {spot,view,result,uiAction,tableState,language}=ctx;
    const names=INDICATOR_NAMES[lang(language)];
    const T=t(language),s=spot?.scenario||{},street=String(view?.street||s.street||'').toUpperCase().replace('PREFLOP','PRE-FLOP');
    const m=mathSnapshot(spot,view,result,tableState);
    const tags=boardTags(view?.board||s.board||[]);
    const heroRange=summarizeRange(s.heroRange,spot,'hero');
    const villainRange=summarizeRange(s.villainRange,spot,'villain');
    const blockers=rangeBlockers(s.villainRange,view?.heroCards||[]);
    const init=initiative(s);
    const tableCount=Number(view?.tableSize||s.tableSize||s.positions?.length||0)||null;
    const active=tableState?.players?.filter(p=>!p.folded).length||tableCount;
    const handClass=street==='PRE-FLOP'?preflopClass(view?.heroCards||[]):postflopClass([...(view?.heroCards||[]),...(view?.board||[])]);
    const strategy=strategyForHand(spot,view?.handKey);
    const raiseFreq=strategy?.actions?.filter(a=>actionKind(a)==='raise'||actionKind(a)==='jam').reduce((x,a)=>x+(n(a.frequency,0)||0),0);
    const calls=strategy?.actions?.filter(a=>actionKind(a)==='call').reduce((x,a)=>x+(n(a.frequency,0)||0),0);
    const folds=strategy?.actions?.filter(a=>actionKind(a)==='fold').reduce((x,a)=>x+(n(a.frequency,0)||0),0);
    const checks=strategy?.actions?.filter(a=>actionKind(a)==='check').reduce((x,a)=>x+(n(a.frequency,0)||0),0);
    const handEv=n(strategy?.ev);
    const selectedEv=n(result?.selected?.ev);
    const exploitProfile=s.trainingContext?.opponentProfile||null;
    const rangeNote=(r,label)=>r.text?(label+': '+r.text):(label+': '+T.noRange);
    const na=T.notAvailable, nap=T.notApplicable;
    const arr=[];
    arr.push(indicator(1,names[0],bb(s.effectiveStack),m.eff?('pote '+bb(m.pot)+' · SPR '+(m.spr?.toFixed(2)??'—')):'', 'scenario'));
    const hi=POS_ORDER.indexOf(String(view?.heroPosition||s.heroPosition||'').toUpperCase()),vi=POS_ORDER.indexOf(String(view?.villainPosition||s.villainPosition||'').toUpperCase());
    const relNote=hi>=0&&vi>=0?(street==='PRE-FLOP'?'ordem pré-flop depende da posição e blinds':(hi>vi?'herói tende a agir depois pós-flop (IP)':'herói tende a agir antes pós-flop (OOP)')):'';
    arr.push(indicator(2,names[1],(view?.heroPosition||s.heroPosition||'—')+' vs '+(view?.villainPosition||s.villainPosition||'—'),relNote,'scenario'));
    arr.push(indicator(3,names[2],init?('iniciativa: '+init):(street==='PRE-FLOP'?'nó sem ação agressiva anterior':nap),'', 'actionHistory',street==='PRE-FLOP'||!!init));
    arr.push(indicator(4,names[3],inferPotType(s),'','scenario'));
    arr.push(indicator(5,names[4],active?String(active)+' ativos / '+String(tableCount||active)+' lugares':na,active&&active>2?'potencial multiway':'heads-up / não multiway','tableState'));
    arr.push(indicator(6,names[5],street==='PRE-FLOP'&&raiseFreq!==undefined?pct(raiseFreq):nap,street==='PRE-FLOP'?rangeNote(heroRange,T.rangeHero):'', 'solver',street==='PRE-FLOP'));
    arr.push(indicator(7,names[6],street==='PRE-FLOP'?(inferPotType(s)):nap,'índice populacional não é inferido sem amostra externa','actionHistory',street==='PRE-FLOP'));
    arr.push(indicator(8,names[7],street==='PRE-FLOP'&&folds!==undefined?pct(folds):nap,'frequência deste combo/nó, não estatística populacional','solver',street==='PRE-FLOP'));
    arr.push(indicator(9,names[8],street==='PRE-FLOP'?na:nap,'o solver não fornece taxa populacional de limp neste nó','solver',street==='PRE-FLOP'));
    arr.push(indicator(10,names[9],m.potOdds!==null?pct(m.potOdds):nap,m.callCost>0?('custo '+bb(m.callCost)+' para pote '+bb(m.pot)):'' ,'calculated',m.potOdds!==null));
    arr.push(indicator(11,names[10],na,'exige árvore futura/equity por runout não exposta neste nó','solver',false));
    arr.push(indicator(12,names[11],m.spr!==null?m.spr.toFixed(2):na,'stack efetivo / pote','calculated',m.spr!==null));
    arr.push(indicator(13,names[12],street==='PRE-FLOP'?nap:(tags.length?tags.join(' · '):na),'','calculated',street!=='PRE-FLOP'));
    arr.push(indicator(14,names[13],street==='PRE-FLOP'?nap:na,'não inferido sem distribuição de equity por range','solver',street!=='PRE-FLOP'));
    arr.push(indicator(15,names[14],street==='PRE-FLOP'?nap:na,rangeNote(heroRange,T.rangeHero)+' · '+rangeNote(villainRange,T.rangeVillain),'solver',street!=='PRE-FLOP'));
    arr.push(indicator(16,names[15],street==='PRE-FLOP'?nap:na,'requer histórico de iniciativa e ação fora do padrão','actionHistory',street!=='PRE-FLOP'));
    arr.push(indicator(17,names[16],street==='FLOP'&&raiseFreq!==undefined?pct(raiseFreq):nap,'frequência agressiva deste combo no nó atual','solver',street==='FLOP'));
    arr.push(indicator(18,names[17],['TURN','RIVER'].includes(street)?na:nap,'depende de check-back anterior explícito','actionHistory',['TURN','RIVER'].includes(street)));
    arr.push(indicator(19,names[18],m.sizingPct!==null?pct(m.sizingPct):nap,m.target!==null?('alvo '+m.target+' · risco incremental '+bb(m.risk)):'' ,'calculated',m.sizingPct!==null));
    arr.push(indicator(20,names[19],na,'equity realization precisa de equity/range por runout','solver',false));
    arr.push(indicator(21,names[20],street==='PRE-FLOP'?nap:na,'outs não são estimados sem equity engine para evitar falsa precisão','solver',street!=='PRE-FLOP'));
    arr.push(indicator(22,names[21],street==='FLOP'||street==='TURN'?na:nap,'não aplicado sem contagem confiável de outs','calculated',street==='FLOP'||street==='TURN'));
    arr.push(indicator(23,names[22],street==='PRE-FLOP'?nap:(blockers?blockers.ranks.join('/')+' bloqueiam '+blockers.affected+'/'+blockers.total+' classes listadas':na),'','calculated',street!=='PRE-FLOP'));
    arr.push(indicator(24,names[23],m.alpha!==null?pct(m.alpha):nap,'alpha é o fold mínimo para um blefe puro no sizing escolhido; não é o fold real do vilão','calculated',m.alpha!==null));
    arr.push(indicator(25,names[24],['TURN','RIVER'].includes(street)?na:nap,'requer sequência explícita de apostas nas streets anteriores','actionHistory',['TURN','RIVER'].includes(street)));
    arr.push(indicator(26,names[25],na,'AF populacional não é inventado sem base observacional','population',false));
    arr.push(indicator(27,names[26],handClass,'classificação estrutural da mão atual','calculated'));
    arr.push(indicator(28,names[27],blockers?(blockers.ranks.join('/')+' → '+blockers.affected+' classes do range explícito'):na,blockers?'contagem sobre classes listadas, não combos exatos por naipe':'','calculated',!!blockers));
    arr.push(indicator(29,names[28],m.alpha!==null?pct(m.alpha):nap,m.alpha!==null?'risco / (pote + risco)':'','calculated',m.alpha!==null));
    arr.push(indicator(30,names[29],m.mdf!==null?pct(m.mdf):nap,m.mdf!==null?'1 - alpha; referência teórica heads-up':'','calculated',m.mdf!==null));
    arr.push(indicator(31,names[30],street==='PRE-FLOP'?nap:(checks!==undefined&&raiseFreq!==undefined?('check '+pct(checks)+' · agressão '+pct(raiseFreq)):na),'não confundir com estatística populacional','solver',street!=='PRE-FLOP'));
    arr.push(indicator(32,names[31],na,'WTSD é estatística populacional/histórica, não saída deste nó','population',false));
    arr.push(indicator(33,names[32],na,'W$SD é estatística populacional/histórica, não saída deste nó','population',false));
    arr.push(indicator(34,names[33],selectedEv!==null?String(selectedEv.toFixed(4)):(handEv!==null?String(handEv.toFixed(4))+' (EV do combo/nó)':na),selectedEv!==null?'EV da ação':handEv!==null?'o arquivo expõe EV do combo, não EV individual por ação':'','solver',selectedEv!==null||handEv!==null));
    arr.push(indicator(35,names[34],exploitProfile?('perfil '+exploitProfile+' selecionado; baseline solver mantida'):'baseline GTO/solver','ajuste exploit só é afirmado quando o solver/backend devolve essa camada','solver'));

    const impacts=INDICATOR_IMPACT[lang(language)]||INDICATOR_IMPACT.pt;
    return arr.map((x,i)=>Object.freeze({
      ...x,
      calculation:x.calculation||x.note||(x.applicable?'leitura direta do cenário/solver':'sem dados suficientes para cálculo confiável'),
      interpretation:impacts[i]||'Indicador incorporado à decisão junto da frequência e do EV do solver.'
    }));
  }

  function analyze(input){
    const language=lang(input?.language),T=t(language);
    const spot=input?.spot||null,view=input?.view||null,result=input?.result||null,uiAction=input?.uiAction||null,tableState=input?.tableState||null;
    if(!spot||!view||!result){
      return {status:'unknown',title:T.status.unknown,line2:T.notAvailable,summary:[],indicators:[],solver:null};
    }
    const status=classify(result);
    const chosen=uiActionLabel(uiAction,result);
    const best=actionLabel(result.best);
    const bestFreq=n(result.best?.frequency,0)||0,chosenFreq=n(result.frequency,0)||0;
    const scenario=spot.scenario||{},math=mathSnapshot(spot,view,result,tableState);
    const heroRange=summarizeRange(scenario.heroRange,spot,'hero');
    const villainRange=summarizeRange(scenario.villainRange,spot,'villain');
    const strategy=strategyForHand(spot,view.handKey);
    const meaningful=(result.strategy||[]).filter(a=>n(a.frequency,0)>=2);
    const mix=meaningful.length>1;
    const handEv=n(result.selected?.ev,n(strategy?.ev));
    const board=(view.board||[]).join(' ')||'—';
    const intro=(T.hand+' '+(view.handKey||view.heroCards?.join(' ')||'—')+' · '+String(view.street||scenario.street||'')+' · '+(view.heroPosition||scenario.heroPosition||'—')+' vs '+(view.villainPosition||scenario.villainPosition||'—')+' · '+T.stack+' '+bb(scenario.effectiveStack)+' · '+T.pot+' '+bb(math.pot)+'.');
    const strat=(T.chosen+' '+chosen+' aparece em '+pct(chosenFreq)+' para este combo. '+T.best+' é '+best+' em '+pct(bestFreq)+'. '+(mix?T.mix:T.pure));
    const maths=[math.spr!==null?(T.spr+' '+math.spr.toFixed(2)):null,math.potOdds!==null?('pot odds '+pct(math.potOdds)):null,math.sizingPct!==null?('sizing '+pct(math.sizingPct)):null,math.alpha!==null?('alpha '+pct(math.alpha)):null,math.mdf!==null?('MDF '+pct(math.mdf)):null].filter(Boolean).join(' · ');
    const ranges=(T.rangeHero+': '+(heroRange.text||T.noRange)+'. '+T.rangeVillain+': '+(villainRange.text||T.noRange)+'.');
    let diagnosis='';
    if(status==='correct')diagnosis='A decisão acompanha uma ação de frequência material do solver e fica próxima da ação dominante. O foco didático é entender por que esse ramo pertence ao mix, não decorar uma resposta isolada.';
    else if(status==='adjustable')diagnosis='A decisão existe na estratégia do solver, mas com peso menor. É uma linha defensável dentro do mix; a ação indicada concentra mais frequência e deve ser a referência principal.';
    else diagnosis='A ação escolhida não aparece, ou aparece abaixo do piso material de 2% usado pelo treinador. A referência é a ação de maior frequência do solver para este combo.';
    if(language==='en'){
      diagnosis=status==='correct'?'The decision follows a material solver action and stays close to the dominant branch. Learn why the branch belongs to the mix rather than memorizing one answer.':status==='adjustable'?'The decision exists in the solver strategy, but at lower weight. It is defensible inside the mix; the indicated action carries more frequency and is the main reference.':'The chosen action is absent or below the trainer\'s 2% material-frequency floor. Use the solver\'s highest-frequency action as the reference.';
    }else if(language==='es'){
      diagnosis=status==='correct'?'La decisión sigue una acción material del solver y queda cerca de la rama dominante. El objetivo es entender por qué pertenece al mix, no memorizar una respuesta aislada.':status==='adjustable'?'La decisión existe en la estrategia del solver, pero con menor peso. Es defendible dentro del mix; la acción indicada concentra más frecuencia y es la referencia principal.':'La acción elegida no aparece o queda por debajo del piso material de 2% del entrenador. La referencia es la acción de mayor frecuencia del solver.';
    }
    const line2=status==='correct'
      ?(chosen+' · '+T.positive+(handEv!==null?' · EV '+handEv.toFixed(4):'')+' · '+T.frequency+' '+pct(chosenFreq))
      :(T.indicated+' = '+best+' · '+T.frequency+' '+pct(bestFreq));
    return {
      status,
      title:T.status[status],
      line2,
      chosenAction:chosen,
      indicatedAction:best,
      chosenFrequency:chosenFreq,
      bestFrequency:bestFreq,
      summary:[
        {title:T.intro,text:intro},
        {title:T.strategy,text:strat},
        {title:T.math,text:maths||T.notApplicable},
        {title:T.ranges,text:ranges},
        {title:T.diagnosis,text:diagnosis}
      ],
      indicators:makeIndicators({spot,view,result,uiAction,tableState,language}),
      solver:{
        id:spot.solver||'—',
        solveId:spot.solveId||'—',
        version:spot.version||'—',
        convergence:spot.convergence||null
      },
      sourceNote:T.source+': '+(spot.solver||'solver')+' · '+(spot.solveId||'solve n/d')
    };
  }

  global.StackUpSpotCoach=Object.freeze({analyze,makeIndicators,actionLabel,escapeHtml:esc});
})(window);
