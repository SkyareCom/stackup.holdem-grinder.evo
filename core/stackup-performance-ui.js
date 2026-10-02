/* StackUp Grinder — PERFORMANCE / Hero vs Villain UI. */
(function(global){
  'use strict';

  function mount(ctx){
    const R=ctx.root,page=ctx.page,xp=ctx.xp;
    if(!R||!page||!xp)return null;

    const style=document.createElement('style');
    style.textContent=`
      .performancepanel{display:flex;flex-direction:column;gap:10px;padding-bottom:14px}
      .performancepanel[hidden]{display:none!important}
      .perfcard,.perfduel,.perfrank{padding:12px;border-radius:var(--r-card);background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.16);box-shadow:var(--glass-hl)}
      .perfduel{background:linear-gradient(145deg,rgba(21,91,189,.24),rgba(255,255,255,.035))}
      .perftitle,.perfcard b,.perfcard span,.perfcard small,.perfduel b,.perfduel span,.perfrank b,.perfrank span,.perfrank small{font-family:var(--f-ui);font-size:12px!important;font-weight:400}
      .perftitle{color:var(--c-accent-text);letter-spacing:1px}
      .perfduelgrid{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-top:10px}
      .perfside{padding:12px 8px;border-radius:14px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.10);text-align:center}
      .perfside strong{display:block;font-family:var(--f-ui);font-size:22px!important;font-weight:400;color:#fff}
      .perfside span{display:block;margin-top:5px;color:var(--c-muted)}
      .perfside.hero{border-color:rgba(111,164,255,.38)}.perfside.hero strong{color:#8db8ff}
      .perfvs{font-family:var(--f-ui);font-size:12px!important;color:var(--c-muted)}
      .perfbar{height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px;display:flex}
      .perfbar i{display:block;height:100%}.perfbar .hero{background:#6fa4ff}.perfbar .villain{background:rgba(255,255,255,.28)}
      .perfbarlabels{display:flex;justify-content:space-between;gap:8px;margin-top:5px}.perfbarlabels span{color:var(--c-muted)}
      .perfranktop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .perfrankname{font-family:var(--f-ui);font-size:24px!important;color:var(--c-accent-text)}
      .perfxp{font-family:var(--f-ui);font-size:18px!important;color:#fff;text-align:right}
      .perfrank small{display:block;margin-top:4px;color:var(--c-muted)}
      .perfprogress{height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px}.perfprogress i{display:block;height:100%;background:linear-gradient(90deg,#155bbd,#6fa4ff);border-radius:999px}
      .perfstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .perfstat{padding:10px 5px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.10);text-align:center}
      .perfstat strong{display:block;font-family:var(--f-ui);font-size:15px!important;font-weight:400;color:#fff}.perfstat small{display:block;margin-top:4px;font-family:var(--f-ui);font-size:10px!important;color:var(--c-muted)}
      .perfdifficulty{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}
      .perfdiff{padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.10);text-align:center}
      .perfdiff b{display:block;color:var(--c-accent-text)}.perfdiff strong{display:block;margin-top:5px;font-family:var(--f-ui);font-size:17px!important;font-weight:400;color:#fff}.perfdiff span{display:block;margin-top:4px;color:var(--c-muted)}
      .perfsectionlist,.perfrecent{display:flex;flex-direction:column;gap:6px;margin-top:9px}
      .perfsection,.perfevent{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}
      .perfsection b,.perfevent b{color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .perfsection span,.perfevent span{color:var(--c-accent-text);white-space:nowrap}
      .perfsection small,.perfevent small{display:block;margin-top:3px;color:var(--c-muted)}
      .perfempty{padding:18px;text-align:center;color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important}
    `;
    R.appendChild(style);

    const panel=document.createElement('div');
    panel.className='performancepanel';
    panel.hidden=true;
    page.appendChild(panel);

    function L(){return ctx.lang();}
    function esc(v){return ctx.escape(String(v??''));}
    function T(){
      const t={
        pt:{title:'EU HERÓI × EU VILÃO',hero:'EU HERÓI',villain:'EU VILÃO',heroDesc:'XP conquistado',villainDesc:'XP deixado na mesa',rank:'RANKING PESSOAL',next:'PARA O PRÓXIMO NÍVEL',max:'NÍVEL MÁXIMO',spots:'SPOTS',correct:'ACERTOS',streak:'SEQUÊNCIA',best:'MELHOR',difficulty:'XP POR DIFICULDADE',sections:'XP POR SEÇÃO',recent:'ÚLTIMOS GANHOS DE XP',empty:'RESPONDA SPOTS PARA COMEÇAR A ACUMULAR XP',xp:'XP'},
        en:{title:'HERO ME × VILLAIN ME',hero:'HERO ME',villain:'VILLAIN ME',heroDesc:'XP earned',villainDesc:'XP left on the table',rank:'PERSONAL RANKING',next:'TO NEXT LEVEL',max:'MAX LEVEL',spots:'SPOTS',correct:'CORRECT',streak:'STREAK',best:'BEST',difficulty:'XP BY DIFFICULTY',sections:'XP BY SECTION',recent:'LATEST XP GAINS',empty:'ANSWER SPOTS TO START EARNING XP',xp:'XP'},
        es:{title:'YO HÉROE × YO VILLANO',hero:'YO HÉROE',villain:'YO VILLANO',heroDesc:'XP ganado',villainDesc:'XP dejado en la mesa',rank:'RANKING PERSONAL',next:'AL PRÓXIMO NIVEL',max:'NIVEL MÁXIMO',spots:'SPOTS',correct:'ACIERTOS',streak:'RACHA',best:'MEJOR',difficulty:'XP POR DIFICULTAD',sections:'XP POR SECCIÓN',recent:'ÚLTIMOS XP GANADOS',empty:'RESPONDE SPOTS PARA EMPEZAR A ACUMULAR XP',xp:'XP'}
      };
      return t[L()]||t.pt;
    }
    function date(v){
      try{return new Intl.DateTimeFormat(L()==='en'?'en-US':L()==='es'?'es-ES':'pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}
      catch(_){return String(v||'');}
    }
    function render(){
      xp.backfill(ctx.records());
      const tx=T(),s=xp.summary();
      if(!s.total){
        panel.innerHTML='<div class="perfcard"><div class="perftitle">'+esc(tx.rank)+'</div><div class="perfempty">'+esc(tx.empty)+'</div></div>';
        return;
      }
      const duel='<div class="perfduel"><div class="perftitle">'+esc(tx.title)+'</div><div class="perfduelgrid">'+
        '<div class="perfside hero"><strong>'+s.heroXP+'</strong><span>'+esc(tx.hero)+' · '+esc(tx.heroDesc)+'</span></div>'+
        '<div class="perfvs">×</div>'+
        '<div class="perfside"><strong>'+s.villainXP+'</strong><span>'+esc(tx.villain)+' · '+esc(tx.villainDesc)+'</span></div>'+
        '</div><div class="perfbar"><i class="hero" style="width:'+s.heroShare.toFixed(1)+'%"></i><i class="villain" style="width:'+s.villainShare.toFixed(1)+'%"></i></div>'+
        '<div class="perfbarlabels"><span>'+s.heroShare.toFixed(0)+'%</span><span>'+s.villainShare.toFixed(0)+'%</span></div></div>';

      const rank=s.rank;
      const rankCard='<div class="perfrank"><div class="perfranktop"><div><b>'+esc(tx.rank)+'</b><div class="perfrankname">'+esc(rank.name)+'</div></div><div class="perfxp">'+s.heroXP+' XP<small>'+(rank.next==null?esc(tx.max):rank.remaining+' XP · '+esc(tx.next))+'</small></div></div>'+
        '<div class="perfprogress"><i style="width:'+rank.progress.toFixed(1)+'%"></i></div></div>';

      const stats='<div class="perfstats"><div class="perfstat"><strong>'+s.total+'</strong><small>'+esc(tx.spots)+'</small></div><div class="perfstat"><strong>'+s.correct+'</strong><small>'+esc(tx.correct)+'</small></div><div class="perfstat"><strong>'+s.currentStreak+'</strong><small>'+esc(tx.streak)+' · '+esc(tx.best)+' '+s.bestStreak+'</small></div></div>';

      const diff='<div class="perfcard"><div class="perftitle">'+esc(tx.difficulty)+'</div><div class="perfdifficulty">'+s.byDifficulty.map(d=>'<div class="perfdiff"><b>'+d.name+'</b><strong>'+d.xp+' XP</strong><span>+'+d.weight+' XP · '+d.correct+'/'+d.spots+'</span></div>').join('')+'</div></div>';

      const sections=s.bySection.length?'<div class="perfsectionlist">'+s.bySection.map((x,i)=>'<div class="perfsection"><div><b>#'+(i+1)+' · '+esc(x.name)+'</b><small>'+x.correct+'/'+x.spots+' · '+Math.round(x.spots?x.correct/x.spots*100:0)+'%</small></div><span>'+x.xp+' XP</span></div>').join('')+'</div>':'<div class="perfempty">'+esc(tx.empty)+'</div>';
      const sec='<div class="perfcard"><div class="perftitle">'+esc(tx.sections)+'</div>'+sections+'</div>';

      const gains=s.recent.filter(x=>x.xpEarned>0).slice(0,12);
      const recent=gains.length?'<div class="perfrecent">'+gains.map(x=>'<div class="perfevent"><div><b>'+esc((x.sections&&x.sections[0])||x.training||'SPOT')+'</b><small>'+esc(date(x.answeredAt))+' · '+esc(x.difficulty)+'</small></div><span>+'+x.xpEarned+' XP</span></div>').join('')+'</div>':'<div class="perfempty">'+esc(tx.empty)+'</div>';
      const rec='<div class="perfcard"><div class="perftitle">'+esc(tx.recent)+'</div>'+recent+'</div>';

      panel.innerHTML=duel+rankCard+stats+diff+sec+rec;
    }

    function show(on){
      panel.hidden=!on;
      panel.style.display=on?'flex':'none';
      if(on)render();
    }
    return Object.freeze({panel,render,show});
  }

  global.StackUpPerformanceUI=Object.freeze({mount});
})(window);
