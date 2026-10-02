/* StackUp Grinder — PERFORMANCE: priority -> prescribed training -> SWOT -> XP details. */
(function(global){
  'use strict';

  function mount(ctx){
    const R=ctx.root,page=ctx.page,xp=ctx.xp;
    if(!R||!page||!xp)return null;
    let pendingClear=false;
    let lastRenderKey='';
    let renderToken=0;

    const style=document.createElement('style');
    style.textContent=`
      .performancepanel{display:flex;flex-direction:column;gap:16px;padding-bottom:16px}
      .performancepanel[hidden]{display:none!important}
      .perfcard,.perfduel,.perfrank{padding:12px;border-radius:16px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.16);box-shadow:var(--glass-hl)}
      .perfduel{background:linear-gradient(145deg,rgba(21,91,189,.24),rgba(255,255,255,.035))}
      .perftitle,.perfcard b,.perfcard span,.perfcard small,.perfduel b,.perfduel span,.perfrank b,.perfrank span,.perfrank small{font-family:var(--f-ui);font-size:12px!important;font-weight:400}
      .perftitle{color:#fff;letter-spacing:1px;margin-bottom:8px}
      .perfsub{color:var(--c-muted);font-family:var(--f-ui);font-size:12px;line-height:1.5}
      .perfduelgrid{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-top:10px}
      .perfside{padding:12px 8px;border-radius:14px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.10);text-align:center}
      .perfside strong{display:block;font-family:var(--f-ui);font-size:22px!important;font-weight:400;color:#fff}.perfside span{display:block;margin-top:5px;color:var(--c-muted)}
      .perfside.hero{border-color:rgba(111,164,255,.38)}.perfside.hero strong{color:#8db8ff}.perfvs{font-family:var(--f-ui);font-size:12px!important;color:var(--c-muted)}
      .perfbar{height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px;display:flex}.perfbar i{display:block;height:100%}.perfbar .hero{background:#6fa4ff}.perfbar .villain{background:rgba(255,255,255,.28)}
      .perfbarlabels{display:flex;justify-content:space-between;gap:8px;margin-top:5px}.perfbarlabels span{color:var(--c-muted)}
      .perfranktop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.perfrankname{font-family:var(--f-ui);font-size:24px!important;color:var(--c-accent-text)}.perfxp{font-family:var(--f-ui);font-size:18px!important;color:#fff;text-align:right}.perfrank small{display:block;margin-top:4px;color:var(--c-muted)}
      .perfprogress{height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px}.perfprogress i{display:block;height:100%;background:linear-gradient(90deg,#155bbd,#6fa4ff);border-radius:999px}
      .perfstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.perfstat{padding:10px 5px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.10);text-align:center}.perfstat strong{display:block;font-family:var(--f-ui);font-size:15px!important;font-weight:400;color:#fff}.perfstat small{display:block;margin-top:4px;font-family:var(--f-ui);font-size:10px!important;color:var(--c-muted)}
      .perfpriority,.perftraininglist,.perfswotlist,.perfsectionlist,.perfrecent{display:flex;flex-direction:column;gap:8px}
      .perftraining{padding:12px;border-radius:16px;background:rgba(21,91,189,.09);border:1px solid rgba(111,164,255,.20)}
      .perftraining b{display:block;color:#fff}.perftraining small{display:block;margin-top:4px;color:var(--c-muted);line-height:1.45}
      .perftrainingmeta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.perftrainingmeta span{padding:6px;border-radius:9px;background:rgba(255,255,255,.04);color:var(--c-muted)}
      .perftraining button{width:100%;min-height:40px;border-radius:12px;border:var(--on-border);background:var(--on-bg);box-shadow:var(--on-glow);color:var(--c-accent-text);font-family:var(--f-ui);font-size:12px!important}
      .perfpriorityitem{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.10)}
      .perfpriorityitem strong{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(21,91,189,.20);color:var(--c-accent-text);font-family:var(--f-ui);font-size:12px;font-weight:400}.perfpriorityitem b{color:#fff}.perfpriorityitem small{display:block;color:var(--c-muted);margin-top:3px}.perfpriorityitem span{color:var(--c-accent-text)}
      .perfswotblock{padding:10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09)}.perfswotitem{padding:9px;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}.perfswotitem+.perfswotitem{margin-top:6px}.perfswotitem b{display:block;color:#fff}.perfswotitem small{display:block;margin-top:4px;color:var(--c-muted);line-height:1.45}.perfswotitem p{margin:6px 0 0;color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important;line-height:1.5}.perfswotitem p strong{color:#fff;font-weight:400}
      .perfdifficulty{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.perfdiff{padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.10);text-align:center}.perfdiff b{display:block;color:#fff}.perfdiff strong{display:block;margin-top:5px;font-family:var(--f-ui);font-size:17px!important;font-weight:400;color:#fff}.perfdiff span{display:block;margin-top:4px;color:var(--c-muted)}
      .perfsection,.perfevent{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}.perfsection b,.perfevent b{color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.perfsection span,.perfevent span{color:var(--c-accent-text);white-space:nowrap}.perfsection small,.perfevent small{display:block;margin-top:3px;color:var(--c-muted)}
      .perfempty{padding:18px;text-align:center;color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important}
    `;
    R.appendChild(style);

    const panel=document.createElement('div');panel.className='performancepanel';panel.hidden=true;page.appendChild(panel);

    function L(){return ctx.lang();}
    function esc(v){return ctx.escape(String(v??''));}
    function T(){
      const all={
        pt:{title:'EU HERÓI × EU VILÃO',hero:'EU HERÓI',villain:'EU VILÃO',heroDesc:'XP conquistado',villainDesc:'XP deixado na mesa',rank:'RANKING PESSOAL',next:'PARA O PRÓXIMO NÍVEL',max:'NÍVEL MÁXIMO',spots:'SPOTS',correct:'ACERTOS',streak:'SEQUÊNCIA',best:'MELHOR',priorityNow:'PRIORIDADE AGORA',priorityDesc:'Comece pelos leaks de maior impacto e relevância.',training:'TREINOS RECOMENDADOS',swot:'SWOT DESMEMBRADA',strengths:'FORÇAS',weaknesses:'FRAQUEZAS',opportunities:'OPORTUNIDADES',threats:'AMEAÇAS',evidence:'EVIDÊNCIA',risk:'RISCO',action:'COMO CORRIGIR',xpDetails:'DETALHES DE XP',difficulty:'XP POR DIFICULDADE',sections:'XP POR SEÇÃO',recent:'HISTÓRICO DE XP',start:'INICIAR TREINO',priority:'PRIORIDADE',goal:'META',empty:'RESPONDA SPOTS PARA COMEÇAR A ACUMULAR XP',clear:'APAGAR DESEMPENHO + ANÁLISES + XP',confirm:'CONFIRMAR APAGAR',cleared:'DESEMPENHO APAGADO'},
        en:{title:'HERO ME × VILLAIN ME',hero:'HERO ME',villain:'VILLAIN ME',heroDesc:'XP earned',villainDesc:'XP left on the table',rank:'PERSONAL RANKING',next:'TO NEXT LEVEL',max:'MAX LEVEL',spots:'SPOTS',correct:'CORRECT',streak:'STREAK',best:'BEST',priorityNow:'PRIORITY NOW',priorityDesc:'Start with the highest-impact, most relevant leaks.',training:'RECOMMENDED TRAINING',swot:'DETAILED SWOT',strengths:'STRENGTHS',weaknesses:'WEAKNESSES',opportunities:'OPPORTUNITIES',threats:'THREATS',evidence:'EVIDENCE',risk:'RISK',action:'HOW TO FIX IT',xpDetails:'XP DETAILS',difficulty:'XP BY DIFFICULTY',sections:'XP BY SECTION',recent:'XP HISTORY',start:'START TRAINING',priority:'PRIORITY',goal:'GOAL',empty:'ANSWER SPOTS TO START EARNING XP',clear:'DELETE PERFORMANCE + ANALYSIS + XP',confirm:'CONFIRM DELETE',cleared:'PERFORMANCE DELETED'},
        es:{title:'YO HÉROE × YO VILLANO',hero:'YO HÉROE',villain:'YO VILLANO',heroDesc:'XP ganado',villainDesc:'XP dejado en la mesa',rank:'RANKING PERSONAL',next:'AL PRÓXIMO NIVEL',max:'NIVEL MÁXIMO',spots:'SPOTS',correct:'ACIERTOS',streak:'RACHA',best:'MEJOR',priorityNow:'PRIORIDAD AHORA',priorityDesc:'Empieza por los leaks de mayor impacto y relevancia.',training:'ENTRENOS RECOMENDADOS',swot:'SWOT DESGLOSADA',strengths:'FORTALEZAS',weaknesses:'DEBILIDADES',opportunities:'OPORTUNIDADES',threats:'AMENAZAS',evidence:'EVIDENCIA',risk:'RIESGO',action:'CÓMO CORREGIR',xpDetails:'DETALLES DE XP',difficulty:'XP POR DIFICULTAD',sections:'XP POR SECCIÓN',recent:'HISTORIAL DE XP',start:'INICIAR ENTRENO',priority:'PRIORIDAD',goal:'META',empty:'RESPONDE SPOTS PARA EMPEZAR A ACUMULAR XP',clear:'BORRAR RENDIMIENTO + ANÁLISIS + XP',confirm:'CONFIRMAR BORRADO',cleared:'RENDIMIENTO BORRADO'}
      };
      return all[L()]||all.pt;
    }
    function date(v){try{return new Intl.DateTimeFormat(L()==='en'?'en-US':L()==='es'?'es-ES':'pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch(_){return String(v||'');}}
    function persistRecommendations(deep){
      if(!ctx.library)return;
      (deep?.recommendations||[]).forEach(r=>{
        const old=ctx.library.get?.(r.externalKey);
        const unchanged=old&&
          old.title===r.title&&old.reason===r.reason&&old.priority===r.priority&&
          Number(old.targetSpots)===Number(r.targetSpots)&&
          Number(old.meta?.baselineScore||0)===Number(r.meta?.baselineScore||0)&&
          Number(old.meta?.severity||0)===Number(r.meta?.severity||0);
        if(!unchanged)ctx.library.upsert(r);
      });
    }
    function priorityItems(deep){
      const all=[...(deep?.weaknesses||[]),...(deep?.threats||[]),...(deep?.opportunities||[])];
      return all.sort((a,b)=>(b.severity||0)-(a.severity||0)).slice(0,3);
    }
    function swotItems(items,tx){
      return (items||[]).length?(items||[]).map(item=>
        '<div class="perfswotitem"><b>'+esc(item.name)+' · '+Math.round(item.metrics?.technical||0)+'%</b>'+
        '<small>'+esc(tx.evidence)+': '+esc(item.evidence)+'</small>'+
        '<p>'+esc(item.comment)+'</p><p><strong>'+esc(tx.risk)+':</strong> '+esc(item.risk)+'</p><p><strong>'+esc(tx.action)+':</strong> '+esc(item.action)+'</p></div>'
      ).join(''):'<div class="perfempty">—</div>';
    }
    function swotBlock(title,items,tx,open){
      return '<div class="perfswotblock"><details class="sudisclosure"'+(open?' open':'')+'><summary>'+esc(title)+' · '+(items?.length||0)+'</summary><div class="sudisclosurebody">'+swotItems(items,tx)+'</div></details></div>';
    }
    function trainingHtml(deep,tx){
      const items=(deep?.recommendations||[]).map(r=>ctx.library?.get?.(r.externalKey)||r);
      if(!items.length)return '<div class="perfempty">—</div>';
      return '<div class="perftraininglist">'+items.slice(0,8).map(item=>
        '<div class="perftraining"><b>'+esc(item.title)+'</b><small>'+esc(item.reason)+'</small><div class="perftrainingmeta"><span>'+esc(tx.priority)+': '+esc(String(item.priority||'normal').toUpperCase())+'</span><span>'+esc(tx.goal)+': '+Number(item.targetSpots||50)+' '+esc(tx.spots)+'</span></div><button data-perf-training="'+esc(item.id||item.externalKey)+'">'+esc(tx.start)+'</button></div>'
      ).join('')+'</div>';
    }

    function render(){
      const records=ctx.records();
      xp.backfill(records);
      const tx=T(),s=xp.summary();
      const first=records[0]||{},last=records[records.length-1]||{};
      const renderKey=[L(),records.length,first.id||'',first.answeredAt||'',last.id||'',last.answeredAt||'',s.total,s.heroXP,pendingClear?'1':'0'].join('|');
      if(renderKey===lastRenderKey&&panel.childElementCount)return;
      lastRenderKey=renderKey;
      const deep=ctx.analysis?.(records,L())||{strengths:[],weaknesses:[],opportunities:[],threats:[],recommendations:[]};
      persistRecommendations(deep);
      if(!s.total){
        panel.innerHTML='<div class="perfcard"><div class="perftitle">'+esc(tx.rank)+'</div><div class="perfempty">'+esc(tx.empty)+'</div></div>';
        return;
      }

      const duel='<div class="perfduel"><div class="perftitle">'+esc(tx.title)+'</div><div class="perfduelgrid"><div class="perfside hero"><strong>'+s.heroXP+'</strong><span>'+esc(tx.hero)+' · '+esc(tx.heroDesc)+'</span></div><div class="perfvs">×</div><div class="perfside"><strong>'+s.villainXP+'</strong><span>'+esc(tx.villain)+' · '+esc(tx.villainDesc)+'</span></div></div><div class="perfbar"><i class="hero" style="width:'+s.heroShare.toFixed(1)+'%"></i><i class="villain" style="width:'+s.villainShare.toFixed(1)+'%"></i></div><div class="perfbarlabels"><span>'+s.heroShare.toFixed(0)+'%</span><span>'+s.villainShare.toFixed(0)+'%</span></div></div>';
      const rank=s.rank;
      const rankCard='<div class="perfrank"><div class="perfranktop"><div><b>'+esc(tx.rank)+'</b><div class="perfrankname">'+esc(rank.name)+'</div></div><div class="perfxp">'+s.heroXP+' XP<small>'+(rank.next==null?esc(tx.max):rank.remaining+' XP · '+esc(tx.next))+'</small></div></div><div class="perfprogress"><i style="width:'+rank.progress.toFixed(1)+'%"></i></div></div>';
      const stats='<div class="perfstats"><div class="perfstat"><strong>'+s.total+'</strong><small>'+esc(tx.spots)+'</small></div><div class="perfstat"><strong>'+s.correct+'</strong><small>'+esc(tx.correct)+'</small></div><div class="perfstat"><strong>'+s.currentStreak+'</strong><small>'+esc(tx.streak)+' · '+esc(tx.best)+' '+s.bestStreak+'</small></div></div>';

      const priority=priorityItems(deep);
      const priorityCard='<div class="perfcard"><div class="perftitle">'+esc(tx.priorityNow)+'</div><div class="perfsub">'+esc(tx.priorityDesc)+'</div><div class="perfpriority">'+(priority.length?priority.map((x,i)=>'<div class="perfpriorityitem"><strong>'+(i+1)+'</strong><div><b>'+esc(x.name)+'</b><small>'+esc(x.evidence)+'</small></div><span>'+Math.round(x.severity||0)+'</span></div>').join(''):'<div class="perfempty">—</div>')+'</div></div>';
      const trainings='<div class="perfcard"><div class="perftitle">'+esc(tx.training)+'</div>'+trainingHtml(deep,tx)+'</div>';
      const swot='<div class="perfcard"><div class="perftitle">'+esc(tx.swot)+'</div><div class="perfswotlist">'+swotBlock(tx.weaknesses,deep.weaknesses,tx,true)+swotBlock(tx.threats,deep.threats,tx,true)+swotBlock(tx.opportunities,deep.opportunities,tx,false)+swotBlock(tx.strengths,deep.strengths,tx,false)+'</div></div>';

      const diff='<div class="perfdifficulty">'+s.byDifficulty.map(d=>'<div class="perfdiff"><b>'+d.name+'</b><strong>'+d.xp+' XP</strong><span>+'+d.weight+' XP · '+d.correct+'/'+d.spots+'</span></div>').join('')+'</div>';
      const sections=s.bySection.length?'<div class="perfsectionlist">'+s.bySection.map((x,i)=>'<div class="perfsection"><div><b>#'+(i+1)+' · '+esc(x.name)+'</b><small>'+x.correct+'/'+x.spots+' · '+Math.round(x.spots?x.correct/x.spots*100:0)+'%</small></div><span>'+x.xp+' XP</span></div>').join('')+'</div>':'<div class="perfempty">—</div>';
      const xpDetails='<div class="perfcard"><details class="sudisclosure"><summary>'+esc(tx.xpDetails)+'</summary><div class="sudisclosurebody"><div class="perftitle">'+esc(tx.difficulty)+'</div>'+diff+'<div class="perftitle">'+esc(tx.sections)+'</div>'+sections+'</div></details></div>';
      const gains=s.recent.filter(x=>x.xpEarned>0).slice(0,12);
      const recent='<div class="perfcard"><details class="sudisclosure"><summary>'+esc(tx.recent)+'</summary><div class="sudisclosurebody">'+(gains.length?'<div class="perfrecent">'+gains.map(x=>'<div class="perfevent"><div><b>'+esc((x.sections&&x.sections[0])||x.training||'SPOT')+'</b><small>'+esc(date(x.answeredAt))+' · '+esc(x.difficulty)+'</small></div><span>+'+x.xpEarned+' XP</span></div>').join('')+'</div>':'<div class="perfempty">—</div>')+'</div></details></div>';
      const clear='<button class="dataaction danger" style="width:100%" data-perf-clear>'+(pendingClear?esc(tx.confirm):esc(tx.clear))+'</button>';

      panel.innerHTML=duel+rankCard+stats+priorityCard+trainings+swot+xpDetails+recent+clear;
    }

    panel.addEventListener('click',e=>{
      const b=e.target.closest('[data-perf-training]');
      if(b){
        const item=ctx.library?.get?.(b.dataset.perfTraining);
        if(item&&ctx.startTraining){ctx.startTraining(item);ctx.toast?.(L()==='en'?'TRAINING LOADED':L()==='es'?'ENTRENO CARGADO':'TREINO CARREGADO');}
        return;
      }
      if(e.target.closest('[data-perf-clear]')){
        const tx=T();
        if(!pendingClear){pendingClear=true;render();return;}
        global.StackUpTrainingPerformance?.clear?.();
        xp.clear?.();
        ctx.library?.list?.().filter(x=>x.origin==='grinder').forEach(x=>ctx.library.remove(x.id));
        pendingClear=false;render();ctx.toast?.(tx.cleared);
      }
    });

    function show(on){
      panel.hidden=!on;panel.style.display=on?'flex':'none';
      const token=++renderToken;
      if(!on)return;
      if(!panel.childElementCount)panel.innerHTML='<div class="perfcard"><div class="perfempty">CARREGANDO...</div></div>';
      requestAnimationFrame(()=>window.setTimeout(()=>{
        if(token!==renderToken||panel.hidden)return;
        render();
      },0));
    }
    return Object.freeze({panel,render,show});
  }

  global.StackUpPerformanceUI=Object.freeze({mount});
})(window);
