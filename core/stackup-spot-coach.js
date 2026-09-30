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

  function spotSpecificIndicatorText(index,ctx){
    const {language,spot,view,result,tableState,street,m,tags,heroRange,villainRange,blockers,init,tableCount,active,handClass,strategy,raiseFreq,folds,checks,exploitProfile}=ctx;
    const l=lang(language),s=spot?.scenario||{};
    const heroPos=String(view?.heroPosition||s.heroPosition||'—').toUpperCase();
    const villainPos=String(view?.villainPosition||s.villainPosition||'—').toUpperCase();
    const hand=String(view?.handKey||view?.heroCards?.join(' ')||'—');
    const board=(view?.board||s.board||[]).join(' ')||'—';
    const best=actionLabel(result?.best);
    const bestFreq=n(result?.best?.frequency,0)||0;
    const chosen=uiActionLabel(result?.uiAction||result?.selected?.kind,result);
    const chosenFreq=n(result?.frequency,0)||0;
    const potType=inferPotType(s);
    const na=t(language).notAvailable;
    const nap=t(language).notApplicable;
    const isUnavailable=v=>v===na||v===nap||v==='—'||v===null||v===undefined;
    const p=(pt,en,es)=>l==='en'?en:l==='es'?es:pt;
    const pct1=v=>Number.isFinite(Number(v))?pct(Number(v)):na;
    const bb1=v=>Number.isFinite(Number(v))?bb(Number(v)):na;
    const spr=m.spr;
    const sprBand=spr===null?'':spr<2?p('muito baixo','very low','muy bajo'):spr<4?p('baixo','low','bajo'):spr<8?p('médio','medium','medio'):p('alto','high','alto');
    const posPost=(()=>{
      const hi=POS_ORDER.indexOf(heroPos),vi=POS_ORDER.indexOf(villainPos);
      if(street==='PRE-FLOP'||hi<0||vi<0)return null;
      return hi>vi?'IP':'OOP';
    })();
    const solverRef=p(
      'A referência do solver para '+hand+' é '+best+' em '+pct(bestFreq)+'.',
      'The solver reference for '+hand+' is '+best+' at '+pct(bestFreq)+'.',
      'La referencia del solver para '+hand+' es '+best+' en '+pct(bestFreq)+'.'
    );
    const unavailable=(why)=>({
      calculation:why,
      interpretation:p(
        'Neste '+street+', esse dado não está disponível no nó atual; portanto ele não é usado para alterar artificialmente a recomendação. '+solverRef,
        'In this '+street+' node, this datum is unavailable, so it is not used to artificially change the recommendation. '+solverRef,
        'En este nodo '+street+', este dato no está disponible; por eso no se usa para alterar artificialmente la recomendación. '+solverRef
      )
    });

    switch(index){
      case 1:{
        const calc=p(
          'Stack efetivo '+bb1(s.effectiveStack)+'; pote atual '+bb1(m.pot)+(spr!==null?' → SPR '+spr.toFixed(2):'')+'.',
          'Effective stack '+bb1(s.effectiveStack)+'; current pot '+bb1(m.pot)+(spr!==null?' → SPR '+spr.toFixed(2):'')+'.',
          'Stack efectivo '+bb1(s.effectiveStack)+'; bote actual '+bb1(m.pot)+(spr!==null?' → SPR '+spr.toFixed(2):'')+'.'
        );
        const interp=spr!==null?p(
          'Com '+bb1(s.effectiveStack)+' efetivos e apenas '+bb1(m.pot)+' no pote, o spot ainda tem bastante profundidade. Isso deixa espaço para decisões futuras e torna menos automático comprometer muitas fichas agora. '+solverRef,
          'With '+bb1(s.effectiveStack)+' effective and only '+bb1(m.pot)+' in the pot, this spot is still deep. There is room for later-street decisions, so committing many chips now is less automatic. '+solverRef,
          'Con '+bb1(s.effectiveStack)+' efectivos y sólo '+bb1(m.pot)+' en el bote, el spot sigue profundo. Hay margen para decisiones futuras, así que comprometer muchas fichas ahora es menos automático. '+solverRef
        ):solverRef;
        return {calculation:calc,interpretation:interp};
      }
      case 2:{
        const calc=p(
          heroPos+' enfrenta '+villainPos+(posPost?' e joga '+posPost+' pós-flop.':'.'),
          heroPos+' faces '+villainPos+(posPost?' and plays '+posPost+' postflop.':'.'),
          heroPos+' enfrenta '+villainPos+(posPost?' y juega '+posPost+' postflop.':'.')
        );
        const interp=posPost==='OOP'?p(
          'Neste confronto '+heroPos+' vs '+villainPos+', o herói age antes pós-flop. Isso reduz a capacidade de realizar equity gratuitamente e aumenta o valor de linhas que protegem o range de check; a ação indicada deve ser lida com essa desvantagem posicional. '+solverRef,
          'In '+heroPos+' vs '+villainPos+', hero acts first postflop. That reduces free equity realization and increases the value of protecting the checking range. '+solverRef,
          'En '+heroPos+' vs '+villainPos+', el héroe actúa primero postflop. Eso reduce la realización gratuita de equity y aumenta el valor de proteger el rango de check. '+solverRef
        ):posPost==='IP'?p(
          'Neste confronto '+heroPos+' vs '+villainPos+', o herói age depois pós-flop. A informação extra permite realizar mais equity e controlar melhor o tamanho do pote; isso dá mais flexibilidade ao mix do solver. '+solverRef,
          'In '+heroPos+' vs '+villainPos+', hero acts later postflop. Extra information improves equity realization and pot control, giving the solver mix more flexibility. '+solverRef,
          'En '+heroPos+' vs '+villainPos+', el héroe actúa después postflop. La información extra mejora la realización de equity y el control del bote. '+solverRef
        ):p(
          'No pré-flop, a relevância de '+heroPos+' vs '+villainPos+' vem da ordem real de ação e dos blinds; ela define quais ranges chegam a este nó. '+solverRef,
          'Preflop, '+heroPos+' vs '+villainPos+' matters through action order and blinds, which define the ranges reaching this node. '+solverRef,
          'Preflop, '+heroPos+' vs '+villainPos+' importa por el orden de acción y las ciegas, que definen los rangos que llegan al nodo. '+solverRef
        );
        return {calculation:calc,interpretation:interp};
      }
      case 3:{
        if(!init)return unavailable(p(
          'O histórico deste spot não contém uma ação agressiva anterior que identifique PFR/iniciativa.',
          'This spot history contains no prior aggressive action identifying PFR/initiative.',
          'El historial de este spot no contiene una acción agresiva previa que identifique PFR/iniciativa.'
        ));
        return {
          calculation:p('Última ação agressiva antes da decisão: '+init+'.','Last aggressive action before the decision: '+init+'.','Última acción agresiva antes de la decisión: '+init+'.'),
          interpretation:p(
            'Como '+init+' carrega a iniciativa neste '+street+', a distribuição de bets/checks parte desse histórico real, não de uma regra genérica. '+solverRef,
            'Because '+init+' carries initiative on this '+street+', the bet/check distribution follows this actual history rather than a generic rule. '+solverRef,
            'Como '+init+' lleva la iniciativa en este '+street+', la distribución bet/check parte de este historial real y no de una regla genérica. '+solverRef
          )
        };
      }
      case 4:{
        return {
          calculation:p('O histórico de ações classifica este nó como '+potType+'.','Action history classifies this node as '+potType+'.','El historial de acciones clasifica este nodo como '+potType+'.'),
          interpretation:p(
            'Este é um pote '+potType+'. Isso determina o quanto os ranges já foram filtrados antes de chegar a '+street+' e, portanto, muda a densidade de mãos fortes e blefes disponíveis para '+heroPos+' e '+villainPos+'. '+solverRef,
            'This is a '+potType+' pot. That determines how much ranges were filtered before '+street+', changing the density of strong hands and bluffs available to '+heroPos+' and '+villainPos+'. '+solverRef,
            'Este es un bote '+potType+'. Eso determina cuánto se filtraron los rangos antes de '+street+' y cambia la densidad de manos fuertes y bluffs disponibles. '+solverRef
          )
        };
      }
      case 5:{
        if(!active)return unavailable(p('O estado da mesa não informa quantos jogadores seguem ativos.','Table state does not report active players.','El estado de mesa no informa cuántos jugadores siguen activos.'));
        return {
          calculation:p(active+' jogadores ativos de '+String(tableCount||active)+' lugares.',''+active+' active players out of '+String(tableCount||active)+' seats.',''+active+' jugadores activos de '+String(tableCount||active)+' asientos.'),
          interpretation:active>2?p(
            'A decisão ocorre multiway com '+active+' jogadores ainda vivos. Isso reduz a liberdade de blefar e aumenta a necessidade de equity robusta porque '+hand+' precisa atravessar mais de um range. '+solverRef,
            'The decision is multiway with '+active+' players still live. Bluffing freedom drops because '+hand+' must clear more than one range. '+solverRef,
            'La decisión es multiway con '+active+' jugadores vivos. Baja la libertad de bluff porque '+hand+' debe superar más de un rango. '+solverRef
          ):p(
            'O nó está heads-up: a decisão de '+heroPos+' é avaliada diretamente contra o range de '+villainPos+', sem um terceiro range comprimindo value e bluffs. '+solverRef,
            'The node is heads-up: '+heroPos+' is evaluated directly against '+villainPos+' without a third range compressing value and bluffs. '+solverRef,
            'El nodo es heads-up: '+heroPos+' se evalúa directamente contra '+villainPos+' sin un tercer rango comprimiendo value y bluffs. '+solverRef
          )
        };
      }
      case 6:{
        if(street!=='PRE-FLOP')return unavailable(p('RFI só é aplicável antes do flop; o spot atual está em '+street+'.','RFI only applies preflop; current spot is '+street+'.','RFI sólo aplica preflop; el spot actual está en '+street+'.'));
        return {
          calculation:p('Para '+hand+', a frequência agressiva de abertura neste nó é '+pct1(raiseFreq)+'.','For '+hand+', aggressive opening frequency at this node is '+pct1(raiseFreq)+'.','Para '+hand+', la frecuencia agresiva de apertura en este nodo es '+pct1(raiseFreq)+'.'),
          interpretation:p(
            'Essa frequência é específica de '+hand+' em '+heroPos+' neste nó. Ela mostra se o combo pertence de forma forte, marginal ou inexistente ao range de abertura; a comparação direta é com '+best+' em '+pct(bestFreq)+'.',
            'This frequency is specific to '+hand+' in '+heroPos+' at this node and shows how strongly the combo belongs to the opening range; compare it directly with '+best+' at '+pct(bestFreq)+'.',
            'Esta frecuencia es específica de '+hand+' en '+heroPos+' en este nodo y muestra cuánto pertenece el combo al rango de apertura; compárela con '+best+' en '+pct(bestFreq)+'.'
          )
        };
      }
      case 7:{
        if(street!=='PRE-FLOP')return unavailable(p('Índice de 3-bet/4-bet é pré-flop; este nó está em '+street+'.','3-bet/4-bet index is preflop; this node is '+street+'.','El índice 3-bet/4-bet es preflop; este nodo está en '+street+'.'));
        const raises=(s.actionHistory||[]).filter(a=>['raise','jam'].includes(actionKind(a))).length;
        if(raises===0)return {
          calculation:p('Nenhum raise ocorreu antes de '+heroPos+': o pote está unopened/RFI.','No raise occurred before '+heroPos+': the pot is unopened/RFI.','No hubo raise antes de '+heroPos+': el bote está unopened/RFI.'),
          interpretation:p(
            'Como '+heroPos+' ainda não enfrenta 3-bet nem 4-bet, este indicador não comprime o range neste ponto. A decisão é de abertura. '+solverRef,
            heroPos+' is not facing a 3-bet or 4-bet, so this factor does not compress the range yet. The decision is an opening decision. '+solverRef,
            'Como '+heroPos+' todavía no enfrenta 3-bet ni 4-bet, este factor no comprime el rango. La decisión es de apertura. '+solverRef
          )
        };
        return {
          calculation:p(raises+' ação(ões) agressiva(s) registrada(s) antes do herói; classificação '+potType+'.',raises+' aggressive action(s) recorded before hero; '+potType+' classification.',raises+' acción(es) agresiva(s) registrada(s) antes del héroe; clasificación '+potType+'.'),
          interpretation:p(
            'Neste spot, '+raises+' ação(ões) agressiva(s) já filtraram os ranges antes de '+heroPos+' decidir. Isso reduz mãos marginais disponíveis e aumenta o peso de blockers e combos robustos. '+solverRef,
            'Here, '+raises+' aggressive action(s) already filtered the ranges before '+heroPos+' acts, reducing marginal hands and increasing the weight of blockers and robust combos. '+solverRef,
            'Aquí, '+raises+' acción(es) agresiva(s) ya filtraron los rangos antes de actuar '+heroPos+', reduciendo manos marginales y aumentando el peso de blockers y combos robustos. '+solverRef
          )
        };
      }
      case 8:{
        if(street!=='PRE-FLOP')return unavailable(p('Fold to 3-bet não é a estatística adequada para um nó '+street+'.','Fold to 3-bet is not the appropriate statistic for a '+street+' node.','Fold to 3-bet no es la estadística adecuada para un nodo '+street+'.'));
        const raises=(s.actionHistory||[]).filter(a=>['raise','jam'].includes(actionKind(a))).length;
        if(raises<2)return unavailable(p(
          'Neste nó '+potType+', '+heroPos+' não está enfrentando uma 3-bet; portanto “Fold to 3-bet” não deve ser calculado a partir da frequência genérica de FOLD do combo.',
          'In this '+potType+' node, '+heroPos+' is not facing a 3-bet, so “Fold to 3-bet” must not be inferred from the combo’s generic FOLD frequency.',
          'En este nodo '+potType+', '+heroPos+' no enfrenta una 3-bet; por eso “Fold to 3-bet” no debe inferirse de la frecuencia genérica de FOLD del combo.'
        ));
        return {
          calculation:p('Enfrentando 3-bet/pressão superior, '+hand+' folda '+pct1(folds)+' neste nó específico.','Facing a 3-bet/higher pressure, '+hand+' folds '+pct1(folds)+' at this exact node.','Frente a 3-bet/presión superior, '+hand+' foldea '+pct1(folds)+' en este nodo específico.'),
          interpretation:p(
            'Aqui o '+pct1(folds)+' é útil porque existe realmente uma 3-bet/pressão equivalente no histórico. Para '+hand+', ele mede quanto o solver abandona o combo nesse confronto específico; '+solverRef,
            'Here '+pct1(folds)+' is meaningful because a real 3-bet/equivalent pressure exists in the history. For '+hand+', it measures how often the solver releases this combo in this exact confrontation; '+solverRef,
            'Aquí '+pct1(folds)+' es útil porque existe realmente una 3-bet/presión equivalente en el historial. Para '+hand+', mide cuánto abandona el solver este combo en este enfrentamiento; '+solverRef
          )
        };
      }
      case 9:{
        return unavailable(street==='PRE-FLOP'?p(
          'O histórico deste nó não fornece uma taxa populacional de limp; só há as ações efetivamente usadas para chegar à decisão.',
          'This node history does not provide a population limp rate; it only contains actions that reached the decision.',
          'El historial del nodo no ofrece una tasa poblacional de limp; sólo contiene las acciones que llegaron a la decisión.'
        ):p('Limp é conceito pré-flop e o spot atual está em '+street+'.','Limp is a preflop concept and current spot is '+street+'.','Limp es un concepto preflop y el spot actual está en '+street+'.'));
      }
      case 10:{
        if(m.potOdds===null)return unavailable(p(
          'Não existe call com custo positivo neste nó para calcular pot odds.',
          'There is no positive-cost call at this node, so pot odds cannot be computed.',
          'No existe call con costo positivo en este nodo, por lo que no se pueden calcular pot odds.'
        ));
        return {
          calculation:p(
            bb1(m.callCost)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.callCost)+') = '+pct(m.potOdds)+'.',
            bb1(m.callCost)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.callCost)+') = '+pct(m.potOdds)+'.',
            bb1(m.callCost)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.callCost)+') = '+pct(m.potOdds)+'.'
          ),
          interpretation:p(
            'Neste spot, CALL precisa de pelo menos '+pct(m.potOdds)+' de equity imediata antes de considerar ganhos futuros. Se '+best+' domina em '+pct(bestFreq)+', o solver está comparando essa exigência com a equity/EV real de '+hand+', não apenas com a força visual da mão.',
            'Here, CALL needs at least '+pct(m.potOdds)+' immediate equity before future gains. If '+best+' dominates at '+pct(bestFreq)+', the solver is comparing that threshold with the actual equity/EV of '+hand+', not just hand appearance.',
            'Aquí, CALL necesita al menos '+pct(m.potOdds)+' de equity inmediata antes de ganancias futuras. Si '+best+' domina en '+pct(bestFreq)+', el solver compara ese umbral con la equity/EV real de '+hand+'.'
          )
        };
      }
      case 11:{
        return unavailable(p(
          'O nó atual não expõe a árvore completa de runouts necessária para quantificar implied odds. O SPR é '+(spr!==null?spr.toFixed(2):'n/d')+'.',
          'This node does not expose the full runout tree needed to quantify implied odds. SPR is '+(spr!==null?spr.toFixed(2):'n/a')+'.',
          'Este nodo no expone el árbol completo de runouts necesario para cuantificar implied odds. El SPR es '+(spr!==null?spr.toFixed(2):'n/d')+'.'
        ));
      }
      case 12:{
        if(spr===null)return unavailable(p('Pote ou stack efetivo insuficientes para calcular SPR.','Pot or effective stack is insufficient to compute SPR.','Bote o stack efectivo insuficientes para calcular SPR.'));
        const calc=bb1(s.effectiveStack)+' ÷ '+bb1(m.pot)+' = '+spr.toFixed(2)+'.';
        let interp='';
        if(spr>=8)interp=p(
          'SPR '+spr.toFixed(2)+' é '+sprBand+': ainda restam aproximadamente '+spr.toFixed(1)+' potes dentro do stack efetivo. Neste '+street+', isso significa baixa pressão de compromisso imediato; inflar o pote agora exige mais força/equity e há espaço para linhas de controle, proteção e decisões nas próximas streets. '+solverRef,
          'SPR '+spr.toFixed(2)+' is '+sprBand+': roughly '+spr.toFixed(1)+' pot-sized units remain in the effective stack. On '+street+', commitment pressure is low; bloating the pot now needs more strength/equity and there is room for later decisions. '+solverRef,
          'SPR '+spr.toFixed(2)+' es '+sprBand+': quedan aproximadamente '+spr.toFixed(1)+' botes dentro del stack efectivo. En '+street+', la presión de compromiso inmediato es baja; inflar el bote exige más fuerza/equity y hay margen para decisiones futuras. '+solverRef
        );
        else if(spr>=4)interp=p(
          'SPR '+spr.toFixed(2)+' é '+sprBand+': o pote já é relevante frente ao stack, mas ainda há espaço para mais de uma street de decisão. Sizings grandes começam a comprometer uma fração importante do stack, então a frequência de '+best+' em '+pct(bestFreq)+' deve ser lida também como gestão de compromisso.',
          'SPR '+spr.toFixed(2)+' is '+sprBand+': the pot is meaningful relative to stack, but more than one street of decisions remains. Large sizings start committing a material fraction of stack, so '+best+' at '+pct(bestFreq)+' also reflects commitment management.',
          'SPR '+spr.toFixed(2)+' es '+sprBand+': el bote ya pesa frente al stack, pero aún hay más de una calle de decisión. Sizings grandes comprometen una parte relevante del stack, por lo que '+best+' en '+pct(bestFreq)+' también refleja gestión de compromiso.'
        );
        else interp=p(
          'SPR '+spr.toFixed(2)+' é '+sprBand+': o pote já é grande em relação ao stack efetivo. Cada aposta consome uma parcela relevante das fichas, então decisões de value/proteção e all-in ganham peso e há menos espaço para manobras futuras. '+solverRef,
          'SPR '+spr.toFixed(2)+' is '+sprBand+': the pot is already large relative to effective stack. Each bet consumes a meaningful share, increasing the weight of value/protection and all-in decisions. '+solverRef,
          'SPR '+spr.toFixed(2)+' es '+sprBand+': el bote ya es grande frente al stack efectivo. Cada apuesta consume una parte relevante, aumentando el peso de value/protección y all-in. '+solverRef
        );
        return {calculation:calc,interpretation:interp};
      }
      case 13:{
        if(street==='PRE-FLOP')return unavailable(p('Ainda não existe board no pré-flop.','There is no board preflop.','Aún no existe board preflop.'));
        return {
          calculation:p('Board '+board+(tags.length?' → '+tags.join(' · '):' sem tag estrutural adicional')+'.','Board '+board+(tags.length?' → '+tags.join(' · '):' with no additional structural tag')+'.','Board '+board+(tags.length?' → '+tags.join(' · '):' sin etiqueta estructural adicional')+'.'),
          interpretation:p(
            'Neste board '+board+', as propriedades '+(tags.length?tags.join(', '):'observadas')+' alteram quais draws/nuts existem e quais partes dos ranges podem apostar por value ou blefe. '+solverRef,
            'On board '+board+', '+(tags.length?tags.join(', '):'its observed structure')+' changes available draws/nuts and which range segments can bet for value or bluff. '+solverRef,
            'En board '+board+', '+(tags.length?tags.join(', '):'su estructura')+' cambia los draws/nuts disponibles y qué partes de los rangos pueden apostar por value o bluff. '+solverRef
          )
        };
      }
      case 14:{
        return unavailable(p(
          'O nó não fornece distribuição completa de equity/nuts entre '+heroPos+' e '+villainPos+' no board '+board+'.',
          'The node does not provide full nut/equity distribution between '+heroPos+' and '+villainPos+' on '+board+'.',
          'El nodo no proporciona la distribución completa de nuts/equity entre '+heroPos+' y '+villainPos+' en '+board+'.'
        ));
      }
      case 15:{
        return {
          calculation:p('Range herói: '+(heroRange.text||na)+' · range vilão: '+(villainRange.text||na)+'.','Hero range: '+(heroRange.text||na)+' · villain range: '+(villainRange.text||na)+'.','Rango héroe: '+(heroRange.text||na)+' · rango villano: '+(villainRange.text||na)+'.'),
          interpretation:(heroRange.text&&villainRange.text)?p(
            'A comparação é feita especificamente entre o range de '+heroPos+' e o de '+villainPos+' que chegaram a '+street+'. A frequência de '+best+' em '+pct(bestFreq)+' reflete essa guerra de ranges para '+hand+', não uma regra universal.',
            'The comparison is specifically between the '+heroPos+' and '+villainPos+' ranges reaching '+street+'. '+best+' at '+pct(bestFreq)+' reflects that range interaction for '+hand+', not a universal rule.',
            'La comparación es específicamente entre los rangos de '+heroPos+' y '+villainPos+' que llegan a '+street+'. '+best+' en '+pct(bestFreq)+' refleja esa interacción para '+hand+', no una regla universal.'
          ):unavailable(p('Um dos ranges completos não está exposto neste nó.','One complete range is not exposed at this node.','Uno de los rangos completos no está expuesto en este nodo.')).interpretation
        };
      }
      case 16:{
        if(street==='PRE-FLOP')return unavailable(p('Donk bet só existe pós-flop.','Donk betting only exists postflop.','Donk bet sólo existe postflop.'));
        return {
          calculation:p('Iniciativa registrada: '+(init||'não identificada')+'; jogador na decisão: '+heroPos+'.','Recorded initiative: '+(init||'not identified')+'; player facing decision: '+heroPos+'.','Iniciativa registrada: '+(init||'no identificada')+'; jugador en decisión: '+heroPos+'.'),
          interpretation:init&&init!==heroPos?p(
            'Se '+heroPos+' apostar liderando contra o agressor '+init+', a linha é estruturalmente um donk neste histórico. Só deve ser valorizada se aparecer no próprio solver para '+hand+'; aqui, '+solverRef,
            'If '+heroPos+' leads into aggressor '+init+', that is structurally a donk in this history. It matters only if the solver includes it for '+hand+'; here, '+solverRef,
            'Si '+heroPos+' lidera contra el agresor '+init+', la línea es estructuralmente un donk. Sólo importa si aparece en el solver para '+hand+'; aquí, '+solverRef
          ):p(
            'Neste histórico não há um agressor anterior claramente diferente do herói, então “donk” não é o fator que explica a decisão atual. '+solverRef,
            'There is no clearly different prior aggressor in this history, so donk betting is not what explains the current decision. '+solverRef,
            'No hay un agresor previo claramente distinto del héroe, por lo que donk bet no explica la decisión actual. '+solverRef
          )
        };
      }
      case 17:{
        if(street!=='FLOP')return unavailable(p('C-bet é avaliada no flop; o spot atual está em '+street+'.','C-bet is evaluated on the flop; current spot is '+street+'.','C-bet se evalúa en flop; el spot actual está en '+street+'.'));
        return {
          calculation:p('Para '+hand+', frequência agressiva neste flop: '+pct1(raiseFreq)+'.','For '+hand+', aggressive frequency on this flop: '+pct1(raiseFreq)+'.','Para '+hand+', frecuencia agresiva en este flop: '+pct1(raiseFreq)+'.'),
          interpretation:p(
            'No flop '+board+', '+hand+' aposta/raiseia em '+pct1(raiseFreq)+' neste nó. Essa frequência já incorpora a textura e os ranges que chegaram ao flop; compare com '+best+' em '+pct(bestFreq)+'.',
            'On flop '+board+', '+hand+' bets/raises at '+pct1(raiseFreq)+' in this node. That frequency already reflects board texture and ranges reaching the flop; compare with '+best+' at '+pct(bestFreq)+'.',
            'En flop '+board+', '+hand+' apuesta/raisea en '+pct1(raiseFreq)+' en este nodo. La frecuencia ya incorpora textura y rangos; compárela con '+best+' en '+pct(bestFreq)+'.'
          )
        };
      }
      case 18:{
        return unavailable(p(
          'Delayed c-bet exige um check-back anterior explicitamente registrado; esse encadeamento não está disponível neste nó '+street+'.',
          'Delayed c-bet requires an explicitly recorded prior check-back; that chain is unavailable in this '+street+' node.',
          'Delayed c-bet exige un check-back previo explícitamente registrado; esa secuencia no está disponible en este nodo '+street+'.'
        ));
      }
      case 19:{
        if(m.sizingPct===null)return unavailable(p('A ação selecionada não expõe um sizing pós-flop mensurável neste nó.','Selected action exposes no measurable postflop sizing at this node.','La acción seleccionada no expone un sizing postflop medible en este nodo.'));
        return {
          calculation:p('Risco incremental '+bb1(m.risk)+' ÷ pote '+bb1(m.pot)+' = '+pct(m.sizingPct)+' do pote.','Incremental risk '+bb1(m.risk)+' ÷ pot '+bb1(m.pot)+' = '+pct(m.sizingPct)+' pot.','Riesgo incremental '+bb1(m.risk)+' ÷ bote '+bb1(m.pot)+' = '+pct(m.sizingPct)+' del bote.'),
          interpretation:p(
            'Neste '+street+', esse sizing arrisca '+bb1(m.risk)+' para disputar '+bb1(m.pot)+'. Isso muda diretamente a pressão sobre o range de '+villainPos+' e o quanto '+heroPos+' se compromete com SPR '+(spr!==null?spr.toFixed(2):'n/d')+'. '+solverRef,
            'On '+street+', this sizing risks '+bb1(m.risk)+' to contest '+bb1(m.pot)+'. It directly changes pressure on '+villainPos+' and how committed '+heroPos+' becomes at SPR '+(spr!==null?spr.toFixed(2):'n/a')+'. '+solverRef,
            'En '+street+', este sizing arriesga '+bb1(m.risk)+' para disputar '+bb1(m.pot)+'. Cambia la presión sobre '+villainPos+' y cuánto se compromete '+heroPos+' con SPR '+(spr!==null?spr.toFixed(2):'n/d')+'. '+solverRef
          )
        };
      }
      case 20:{
        return unavailable(p(
          'O nó não fornece equity por runout suficiente para medir quanto '+hand+' realiza de sua equity em '+heroPos+' '+(posPost||'')+'.',
          'The node lacks runout equity needed to measure how much equity '+hand+' realizes from '+heroPos+' '+(posPost||'')+'.',
          'El nodo no ofrece equity por runout suficiente para medir cuánta equity realiza '+hand+' desde '+heroPos+' '+(posPost||'')+'.'
        ));
      }
      case 21:{
        return unavailable(p(
          'Para '+hand+' no board '+board+', os outs exatos não são inferidos sem uma equity engine porque alguns podem estar dominados ou sujos.',
          'For '+hand+' on '+board+', exact outs are not inferred without an equity engine because some may be dominated or dirty.',
          'Para '+hand+' en '+board+', no se infieren outs exactos sin un motor de equity porque algunos pueden estar dominados o sucios.'
        ));
      }
      case 22:{
        return unavailable(p(
          'Sem uma contagem confiável de outs para '+hand+' no board '+board+', aplicar “2 e 4” criaria falsa precisão.',
          'Without a reliable out count for '+hand+' on '+board+', using the rule of 2 and 4 would create false precision.',
          'Sin una cuenta fiable de outs para '+hand+' en '+board+', aplicar la regla del 2 y 4 crearía falsa precisión.'
        ));
      }
      case 23:{
        if(street==='PRE-FLOP')return unavailable(p('Card removal pós-flop não se aplica antes do board existir.','Postflop card removal does not apply before a board exists.','Card removal postflop no aplica antes de existir board.'));
        if(!blockers)return unavailable(p('O range explícito do vilão não está disponível para quantificar remoções por '+hand+'.','Villain explicit range is unavailable to quantify removals from '+hand+'.','El rango explícito del villano no está disponible para cuantificar removals de '+hand+'.'));
        return {
          calculation:p('Ranks '+blockers.ranks.join('/')+' de '+hand+' aparecem em '+blockers.affected+' de '+blockers.total+' classes listadas do range rival.','Ranks '+blockers.ranks.join('/')+' from '+hand+' appear in '+blockers.affected+' of '+blockers.total+' listed villain range classes.','Ranks '+blockers.ranks.join('/')+' de '+hand+' aparecen en '+blockers.affected+' de '+blockers.total+' clases listadas del rango rival.'),
          interpretation:p(
            'Neste board '+board+', essas remoções mudam a quantidade de value/draws que '+villainPos+' pode ter. Isso ajuda a explicar por que '+hand+' pode migrar entre value, bluff-catch ou bluff dentro do mix. '+solverRef,
            'On '+board+', those removals change how many value/draw combinations '+villainPos+' can hold, helping explain why '+hand+' shifts among value, bluff-catch or bluff in the mix. '+solverRef,
            'En '+board+', esas remociones cambian cuántas combinaciones de value/draws puede tener '+villainPos+', ayudando a explicar el papel de '+hand+' en el mix. '+solverRef
          )
        };
      }
      case 24:{
        if(m.alpha===null)return unavailable(p('Não há sizing agressivo mensurável para calcular fold equity mínima neste nó.','There is no measurable aggressive sizing to compute minimum fold equity.','No hay sizing agresivo medible para calcular fold equity mínima.'));
        return {
          calculation:p('Risco '+bb1(m.risk)+' ÷ (pote '+bb1(m.pot)+' + risco '+bb1(m.risk)+') = '+pct(m.alpha)+'.','Risk '+bb1(m.risk)+' ÷ (pot '+bb1(m.pot)+' + risk '+bb1(m.risk)+') = '+pct(m.alpha)+'.','Riesgo '+bb1(m.risk)+' ÷ (bote '+bb1(m.pot)+' + riesgo '+bb1(m.risk)+') = '+pct(m.alpha)+'.'),
          interpretation:p(
            'Se a aposta fosse um blefe puro, '+villainPos+' precisaria foldar mais de '+pct(m.alpha)+' para essa linha empatar antes de considerar equity quando pago. No spot real, '+hand+' pode ter equity adicional, por isso o solver pode apostar mesmo abaixo desse fold observado. '+solverRef,
            'For a pure bluff, '+villainPos+' would need to fold more than '+pct(m.alpha)+' for breakeven before accounting for called equity. '+hand+' may have extra equity, so the solver can bet even below that observed fold rate. '+solverRef,
            'Para un bluff puro, '+villainPos+' tendría que foldear más de '+pct(m.alpha)+' para quedar break-even antes de considerar equity al ser pagado. '+hand+' puede tener equity adicional. '+solverRef
          )
        };
      }
      case 25:{
        return unavailable(p(
          'A sequência necessária de bets em streets anteriores não está completa no histórico deste '+street+'; por isso não classifico este nó artificialmente como double/triple barrel.',
          'The required prior-street betting sequence is incomplete in this '+street+' history, so this node is not artificially labeled a double/triple barrel.',
          'La secuencia de apuestas previa necesaria está incompleta en este '+street+'; por eso no se clasifica artificialmente como double/triple barrel.'
        ));
      }
      case 26:{
        return unavailable(p(
          'Não existe amostra histórica do oponente '+villainPos+' neste spot para calcular Aggression Factor.',
          'There is no historical sample for opponent '+villainPos+' in this spot to compute Aggression Factor.',
          'No existe muestra histórica del rival '+villainPos+' en este spot para calcular Aggression Factor.'
        ));
      }
      case 27:{
        return {
          calculation:p(hand+' é classificada estruturalmente como '+handClass+' no board '+board+'.',hand+' is structurally classified as '+handClass+' on board '+board+'.',hand+' se clasifica estructuralmente como '+handClass+' en board '+board+'.'),
          interpretation:p(
            'A força absoluta de '+hand+' é apenas o ponto de partida. Neste '+heroPos+' vs '+villainPos+' e board '+board+', o que decide a linha é como essa classe se comporta contra o range rival; por isso '+solverRef,
            'Absolute strength of '+hand+' is only the starting point. In '+heroPos+' vs '+villainPos+' on '+board+', the line depends on how that class performs against the opposing range; '+solverRef,
            'La fuerza absoluta de '+hand+' es sólo el punto de partida. En '+heroPos+' vs '+villainPos+' sobre '+board+', la línea depende de cómo esa clase funciona contra el rango rival; '+solverRef
          )
        };
      }
      case 28:{
        if(!blockers)return unavailable(p('Sem range rival explícito, não é possível medir blockers de '+hand+' com segurança.','Without an explicit villain range, blockers for '+hand+' cannot be measured safely.','Sin rango rival explícito, no se pueden medir blockers de '+hand+' con seguridad.'));
        return {
          calculation:p(hand+' remove ranks '+blockers.ranks.join('/')+' presentes em '+blockers.affected+'/'+blockers.total+' classes listadas do range de '+villainPos+'.',hand+' removes ranks '+blockers.ranks.join('/')+' present in '+blockers.affected+'/'+blockers.total+' listed classes of '+villainPos+' range.',hand+' elimina ranks '+blockers.ranks.join('/')+' presentes en '+blockers.affected+'/'+blockers.total+' clases listadas del rango de '+villainPos+'.'),
          interpretation:p(
            'Esses blockers são relevantes neste spot porque alteram exatamente quais continuações fortes de '+villainPos+' permanecem disponíveis. O efeito deve ser lido junto da frequência de '+best+' em '+pct(bestFreq)+', não isoladamente.',
            'These blockers matter here because they change which strong '+villainPos+' continuations remain available. Read them together with '+best+' at '+pct(bestFreq)+', not in isolation.',
            'Estos blockers importan porque cambian qué continuaciones fuertes de '+villainPos+' siguen disponibles. Deben leerse junto a '+best+' en '+pct(bestFreq)+'.'
          )
        };
      }
      case 29:{
        if(m.alpha===null)return unavailable(p('Alpha exige uma aposta/raise mensurável e esse nó não expõe uma para a ação analisada.','Alpha requires a measurable bet/raise and this node exposes none for the analyzed action.','Alpha exige una apuesta/raise medible y este nodo no expone una para la acción analizada.'));
        return {
          calculation:p(bb1(m.risk)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.risk)+') = '+pct(m.alpha)+'.',bb1(m.risk)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.risk)+') = '+pct(m.alpha)+'.',bb1(m.risk)+' ÷ ('+bb1(m.pot)+' + '+bb1(m.risk)+') = '+pct(m.alpha)+'.'),
          interpretation:p(
            'Com este sizing específico, um blefe sem equity precisa gerar '+pct(m.alpha)+' de folds para não perder fichas. Isso é o break-even matemático desta aposta, não uma estimativa do comportamento real de '+villainPos+'. '+solverRef,
            'At this exact sizing, a zero-equity bluff needs '+pct(m.alpha)+' folds to break even. This is the mathematical threshold for this bet, not an estimate of '+villainPos+' behavior. '+solverRef,
            'Con este sizing, un bluff sin equity necesita '+pct(m.alpha)+' de folds para quedar break-even. Es el umbral matemático de esta apuesta, no una estimación del comportamiento real de '+villainPos+'. '+solverRef
          )
        };
      }
      case 30:{
        if(m.mdf===null)return unavailable(p('MDF depende do sizing agressivo e ele não está mensurável neste nó.','MDF depends on aggressive sizing, which is not measurable at this node.','MDF depende del sizing agresivo y no es medible en este nodo.'));
        return {
          calculation:p('100% - alpha '+pct(m.alpha)+' = MDF '+pct(m.mdf)+'.','100% - alpha '+pct(m.alpha)+' = MDF '+pct(m.mdf)+'.','100% - alpha '+pct(m.alpha)+' = MDF '+pct(m.mdf)+'.'),
          interpretation:p(
            'Contra esse sizing, '+villainPos+' teria uma referência teórica de continuar cerca de '+pct(m.mdf)+' do range para não overfoldar contra blefes puros. No spot real, composição de range e blockers de '+hand+' podem deslocar essa defesa por combo. '+solverRef,
            'Against this sizing, '+villainPos+' has a theoretical reference to continue about '+pct(m.mdf)+' of range to avoid overfolding to pure bluffs. Actual range composition and '+hand+' blockers can shift defense by combo. '+solverRef,
            'Contra este sizing, '+villainPos+' tiene como referencia teórica continuar cerca de '+pct(m.mdf)+' del rango para no overfoldear contra bluffs puros. La composición real y los blockers de '+hand+' pueden mover esa defensa. '+solverRef
          )
        };
      }
      case 31:{
        if(street==='PRE-FLOP')return unavailable(p('Check-raise não se aplica pré-flop.','Check-raise does not apply preflop.','Check-raise no aplica preflop.'));
        if(checks===undefined||raiseFreq===undefined)return unavailable(p('O nó não expõe mix de check e agressão suficiente para esta leitura.','The node does not expose enough check/aggression mix for this reading.','El nodo no expone suficiente mix de check/agresión para esta lectura.'));
        return {
          calculation:p('Para '+hand+': CHECK '+pct(checks)+' · agressão '+pct(raiseFreq)+'.','For '+hand+': CHECK '+pct(checks)+' · aggression '+pct(raiseFreq)+'.','Para '+hand+': CHECK '+pct(checks)+' · agresión '+pct(raiseFreq)+'.'),
          interpretation:p(
            'Esse mix mostra como '+hand+' divide suas linhas neste nó específico. Se o herói checa com frequência material, parte das mãos fortes/blefes precisa permanecer no range de check para que um raise posterior seja crível. '+solverRef,
            'This mix shows how '+hand+' splits lines at this exact node. If hero checks materially, some strong hands/bluffs must remain in the checking range so later raises stay credible. '+solverRef,
            'Este mix muestra cómo '+hand+' divide sus líneas en este nodo. Si el héroe hace check con frecuencia material, parte de manos fuertes/bluffs debe permanecer en check para sostener raises posteriores. '+solverRef
          )
        };
      }
      case 32:{
        return unavailable(p('Não há histórico do jogador '+villainPos+' para medir quantas vezes ele chega ao showdown (WTSD).','There is no '+villainPos+' history to measure WTSD.','No hay historial de '+villainPos+' para medir WTSD.'));
      }
      case 33:{
        return unavailable(p('Não há amostra de showdowns de '+villainPos+' para calcular W$SD.','There is no '+villainPos+' showdown sample to compute W$SD.','No hay muestra de showdowns de '+villainPos+' para calcular W$SD.'));
      }
      case 34:{
        const selectedEv=n(result?.selected?.ev),handEv=n(strategy?.ev);
        if(selectedEv===null&&handEv===null)return unavailable(p('O arquivo deste nó não expõe EV numérico por ação nem EV do combo.','This node file exposes neither action EV nor combo EV.','El archivo de este nodo no expone EV numérico por acción ni EV del combo.'));
        return {
          calculation:selectedEv!==null?p('EV da ação escolhida '+chosen+': '+selectedEv.toFixed(4)+'.','Chosen action EV '+chosen+': '+selectedEv.toFixed(4)+'.','EV de la acción elegida '+chosen+': '+selectedEv.toFixed(4)+'.'):p('EV disponível apenas para o combo '+hand+': '+handEv.toFixed(4)+'.','EV available only for combo '+hand+': '+handEv.toFixed(4)+'.','EV disponible sólo para el combo '+hand+': '+handEv.toFixed(4)+'.'),
          interpretation:p(
            'Este EV pertence a este nó, mão e configuração específicos. Quando EV por ação existe, ele é a medida mais direta para comparar linhas; quando só há EV do combo, não uso esse número para inventar diferença de EV entre '+chosen+' e '+best+'.',
            'This EV belongs to this exact node, hand and configuration. When action EV exists it is the most direct line comparison; with combo-only EV, no fake EV gap is inferred between '+chosen+' and '+best+'.',
            'Este EV pertenece a este nodo, mano y configuración. Cuando existe EV por acción es la comparación más directa; con EV sólo del combo no se inventa diferencia entre '+chosen+' y '+best+'.'
          )
        };
      }
      case 35:{
        if(exploitProfile)return {
          calculation:p('Perfil ativo: '+exploitProfile+'; baseline do solver preservada para comparação.','Active profile: '+exploitProfile+'; solver baseline preserved for comparison.','Perfil activo: '+exploitProfile+'; baseline del solver preservada para comparar.'),
          interpretation:p(
            'Neste spot, qualquer desvio exploit deve ser justificado por dados reais do perfil '+exploitProfile+'. Sem evidência suficiente, a referência continua '+best+' em '+pct(bestFreq)+' para '+hand+'.',
            'Any exploit deviation here must be justified by real '+exploitProfile+' profile data. Without enough evidence, the reference remains '+best+' at '+pct(bestFreq)+' for '+hand+'.',
            'Cualquier desvío exploit debe justificarse con datos reales del perfil '+exploitProfile+'. Sin evidencia suficiente, la referencia sigue siendo '+best+' en '+pct(bestFreq)+' para '+hand+'.'
          )
        };
        return {
          calculation:p('Nenhum perfil exploit confiável foi aplicado; análise segue o baseline '+(spot?.solver||'solver')+'.','No reliable exploit profile was applied; analysis follows '+(spot?.solver||'solver')+' baseline.','No se aplicó un perfil exploit fiable; el análisis sigue el baseline '+(spot?.solver||'solver')+'.'),
          interpretation:p(
            'Para este spot, não há evidência do adversário que justifique sair do baseline. Portanto '+best+' em '+pct(bestFreq)+' continua sendo a referência para '+hand+', sem inventar tendência populacional.',
            'There is no opponent evidence here justifying a baseline deviation. Therefore '+best+' at '+pct(bestFreq)+' remains the reference for '+hand+' without inventing population tendencies.',
            'No hay evidencia rival que justifique desviarse del baseline. Por eso '+best+' en '+pct(bestFreq)+' sigue siendo la referencia para '+hand+' sin inventar tendencias poblacionales.'
          )
        };
      }
      default:
        return unavailable(p('Indicador sem leitura específica disponível para este nó.','No node-specific reading available for this indicator.','No hay lectura específica disponible para este indicador.'));
    }
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
    const preflopRaiseCount=(s.actionHistory||[]).filter(a=>['raise','jam'].includes(actionKind(a))).length;
    const facingThreeBet=street==='PRE-FLOP'&&preflopRaiseCount>=2;
    arr.push(indicator(8,names[7],facingThreeBet&&folds!==undefined?pct(folds):nap,facingThreeBet?'frequência de FOLD deste combo no nó que enfrenta 3-bet/mais pressão':'não há 3-bet enfrentada neste nó','solver',facingThreeBet));
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

    const detailCtx={language,spot,view,result,tableState,street,m,tags,heroRange,villainRange,blockers,init,tableCount,active,handClass,strategy,raiseFreq,folds,checks,exploitProfile};
    return arr.map(x=>{
      const specific=spotSpecificIndicatorText(x.index,detailCtx);
      return Object.freeze({
        ...x,
        calculation:specific.calculation,
        interpretation:specific.interpretation
      });
    });
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
