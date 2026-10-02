/* StackUp Grinder — PERSONAL + WhatsApp Coach UI. */
(function(global){
  'use strict';

  function mount(ctx){
    const R=ctx.root,page=ctx.page,lib=ctx.library,coach=ctx.coach,bridge=ctx.bridge;
    if(!R||!page||!lib||!coach)return null;
    let personalFilter='all';

    const style=document.createElement('style');
    style.textContent=`
      .personalpanel,.coachprofile{display:flex;flex-direction:column;gap:10px;padding-bottom:14px}
      .personalpanel[hidden],.coachprofile[hidden]{display:none!important}
      .personalhero,.personalcard,.coachcard{padding:12px;border-radius:var(--r-card);background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.16);box-shadow:var(--glass-hl)}
      .personalhero{background:linear-gradient(145deg,rgba(21,91,189,.25),rgba(255,255,255,.035))}
      .personalhero b,.personalhero span,.personalcard b,.personalcard span,.personalcard small,.coachcard b,.coachcard span,.coachcard small{font-family:var(--f-ui);font-size:12px!important;font-weight:400}
      .personalhero b,.coachcard> b{display:block;color:var(--c-accent-text);letter-spacing:1px}.personalhero span{display:block;margin-top:5px;color:var(--c-muted);line-height:1.45}
      .personalstats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px}
      .personalstat{padding:9px 4px;border-radius:11px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.09);text-align:center}
      .personalstat strong{display:block;font-family:var(--f-ui);font-size:12px!important;font-weight:400;color:#fff}.personalstat small{display:block;margin-top:3px;font-family:var(--f-ui);font-size:10px!important;color:var(--c-muted)}
      .personaltabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;border-radius:15px;background:rgba(2,7,20,.72);border:1px solid rgba(255,255,255,.12)}
      .personaltabs button,.personalactions button,.coachtoggle,.coachsave{min-height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important}
      .personaltabs button.on,.personalactions button.primary,.coachtoggle.on,.coachsave{background:var(--on-bg);border:var(--on-border);color:var(--c-accent-text);box-shadow:var(--on-glow)}
      .personallist{display:flex;flex-direction:column;gap:8px}
      .personalcard{display:flex;flex-direction:column;gap:8px}
      .personalcardtop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.personalcardtitle{min-width:0}
      .personalcardtitle b{display:block;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.personalcardtitle small{display:block;margin-top:3px;color:var(--c-muted);line-height:1.35}
      .personalbadge{flex:none;padding:5px 7px;border-radius:9px;background:rgba(21,91,189,.18);border:1px solid rgba(111,164,255,.26);color:var(--c-accent-text)!important;font-size:10px!important}
      .personalmeta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.personalmeta span{padding:7px;border-radius:10px;background:rgba(255,255,255,.035);color:var(--c-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .personalreason{color:var(--c-text)!important;line-height:1.45}.personalprogress{height:7px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.personalprogress i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#155bbd,#6fa4ff)}
      .personalprogressline{display:flex;justify-content:space-between;gap:8px}.personalprogressline span{color:var(--c-muted)}
      .personalactions{display:grid;grid-template-columns:2fr 1fr;gap:7px}.personalempty{padding:20px;text-align:center;border-radius:var(--r-card);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10);color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important}
      .coachstate{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}.coachstate span{color:var(--c-muted)}.coachstate strong{font-family:var(--f-ui);font-size:12px!important;font-weight:400;color:#fff}
      .coachgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.coachgrid input,.coachgrid select{height:40px;padding:0 9px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.14);color:#fff;font-family:var(--f-ui);font-size:12px!important}.coachgrid option{color:#111}
      .coachtemplates{display:flex;flex-direction:column;gap:6px;margin-top:9px}.coachtemplate{padding:8px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09)}.coachtemplate b{display:block;color:#fff}.coachtemplate span{display:block;margin-top:3px;color:var(--c-muted);line-height:1.4}
      .coachstatus{margin-top:8px;padding:8px;border-radius:10px;background:rgba(21,91,189,.10);border:1px solid rgba(111,164,255,.18);color:var(--c-muted);font-family:var(--f-ui);font-size:12px!important;line-height:1.45}
    `;
    R.appendChild(style);

    const personal=document.createElement('div');personal.className='personalpanel';personal.hidden=true;page.appendChild(personal);
    const profile=document.createElement('div');profile.className='coachprofile';profile.hidden=true;page.appendChild(profile);

    function L(){return ctx.lang();}
    function esc(v){return ctx.escape(String(v??''));}
    function T(){
      const t={
        pt:{summary:'PLANO DE EVOLUÇÃO',desc:'Treinos indicados pelo HEROES e pelo próprio GRINDER, ordenados pela relevância atual.',all:'TODOS',heroes:'HEROES',grinder:'GRINDER',weak:'FRAQUEZAS',reinforce:'REFORÇO',completed:'CONCLUÍDOS',pending:'PENDENTE',progress:'EM ANDAMENTO',start:'INICIAR',continue:'CONTINUAR',finish:'CONCLUIR',priority:'PRIORIDADE',relevance:'RELEVÂNCIA',goal:'META',reason:'MOTIVO',spots:'SPOTS',empty:'NENHUM TREINO PERSONAL INDICADO AINDA',loaded:'TREINO PERSONAL CARREGADO',done:'TREINO CONCLUÍDO',coach:'WHATSAPP COACH',coachDesc:'Mensagens automáticas sobre programação, pendências, evolução e reforço.',enabled:'ATIVADO',disabled:'DESATIVADO',phone:'WHATSAPP',max:'MÁX. / DIA',quiet:'HORÁRIO SILENCIOSO',save:'CONFIRMAR',templates:'10 MENSAGENS ADAPTATIVAS',backend:'ENVIO WHATSAPP',waiting:'AGUARDANDO WHATSAPP BUSINESS / BACKEND',ready:'TRANSPORTE CONECTADO',queued:'NA FILA',saved:'PREFERÊNCIA SALVA'},
        en:{summary:'EVOLUTION PLAN',desc:'Training prescribed by HEROES and by GRINDER itself, ordered by current relevance.',all:'ALL',heroes:'HEROES',grinder:'GRINDER',weak:'WEAKNESSES',reinforce:'REINFORCEMENT',completed:'COMPLETED',pending:'PENDING',progress:'IN PROGRESS',start:'START',continue:'CONTINUE',finish:'COMPLETE',priority:'PRIORITY',relevance:'RELEVANCE',goal:'GOAL',reason:'REASON',spots:'SPOTS',empty:'NO PERSONAL TRAINING PRESCRIBED YET',loaded:'PERSONAL TRAINING LOADED',done:'TRAINING COMPLETED',coach:'WHATSAPP COACH',coachDesc:'Automatic messages about schedule, pending training, evolution and reinforcement.',enabled:'ENABLED',disabled:'DISABLED',phone:'WHATSAPP',max:'MAX / DAY',quiet:'QUIET HOURS',save:'CONFIRM',templates:'10 ADAPTIVE MESSAGES',backend:'WHATSAPP DELIVERY',waiting:'WAITING FOR WHATSAPP BUSINESS / BACKEND',ready:'TRANSPORT CONNECTED',queued:'QUEUED',saved:'PREFERENCE SAVED'},
        es:{summary:'PLAN DE EVOLUCIÓN',desc:'Entrenos indicados por HEROES y por el propio GRINDER, ordenados por relevancia actual.',all:'TODOS',heroes:'HEROES',grinder:'GRINDER',weak:'DEBILIDADES',reinforce:'REFUERZO',completed:'COMPLETADOS',pending:'PENDIENTE',progress:'EN CURSO',start:'INICIAR',continue:'CONTINUAR',finish:'COMPLETAR',priority:'PRIORIDAD',relevance:'RELEVANCIA',goal:'META',reason:'MOTIVO',spots:'SPOTS',empty:'AÚN NO HAY ENTRENO PERSONAL INDICADO',loaded:'ENTRENO PERSONAL CARGADO',done:'ENTRENO COMPLETADO',coach:'WHATSAPP COACH',coachDesc:'Mensajes automáticos sobre programación, pendientes, evolución y refuerzo.',enabled:'ACTIVADO',disabled:'DESACTIVADO',phone:'WHATSAPP',max:'MÁX. / DÍA',quiet:'HORARIO SILENCIOSO',save:'CONFIRMAR',templates:'10 MENSAJES ADAPTATIVOS',backend:'ENVÍO WHATSAPP',waiting:'ESPERANDO WHATSAPP BUSINESS / BACKEND',ready:'TRANSPORTE CONECTADO',queued:'EN COLA',saved:'PREFERENCIA GUARDADA'}
      };
      return t[L()]||t.pt;
    }

    function pid(item){return String(item?.meta?.prescriptionId||item?.externalKey||item?.id||'');}
    function progress(item){
      const records=ctx.records().filter(r=>String(r?.prescriptionId||'')===pid(item));
      const c=ctx.counts(records),target=Math.max(1,Number(item?.targetSpots)||50);
      const prev=Number(item?.meta?.baselineScore);
      return {records,counts:c,done:c.total,target,pct:Math.min(100,c.total/target*100),score:c.total?c.technical:(Number.isFinite(prev)?prev:0),delta:c.total&&Number.isFinite(prev)?c.technical-prev:0};
    }
    function dueFor(priority){
      const days={critical:1,high:2,medium:4,normal:7,low:10}[priority]||7;
      return new Date(Date.now()+days*864e5).toISOString();
    }
    function filtersFor(group,dimension){
      const latest=[...(group.items||[])].sort((a,b)=>String(b.answeredAt||'').localeCompare(String(a.answeredAt||'')))[0];
      const f=ctx.clone(latest?.filters||{});
      if(dimension==='position')f.heroPositions=[String(group.name)];
      if(dimension==='street')f.streets=[String(group.name)];
      if(dimension==='stack'){
        const n=Number(String(group.name).replace(/[^0-9.]/g,''));
        if(Number.isFinite(n)&&n>0)f.effectiveStacks=[n];
      }
      f.sampleSize=Number(f.sampleSize)||50;
      return f;
    }
    function priority(score){return score<45?'critical':score<55?'high':score<65?'medium':'normal';}

    function syncHeroes(){
      (ctx.heroInbox()||[]).forEach(env=>{
        const p=env.payload||{},id=String(p.prescriptionId||env.id),pri=String(p.priority||'normal');
        lib.upsert({
          externalKey:'heroes:'+id,sourceMessageId:env.id,origin:'heroes',
          kind:String(p.kind||'weakness'),priority:pri,title:String(p.title||p.name||'HEROES'),
          reason:String(p.reason||''),targetSpots:Math.max(1,Number(p.sampleSize||p.targetSpots)||50),
          scheduledAt:p.scheduledAt||new Date().toISOString(),dueAt:p.dueAt||dueFor(pri),
          filters:ctx.clone(p.grinderFilters||p.filters||{}),
          meta:{prescriptionId:id,profileVersion:p.profileVersion||null,focus:p.focus||null,severity:Number(p.severity)||0,confidence:Number(p.confidence)||0}
        });
      });
    }
    function syncGrinder(){
      const records=ctx.records();if(records.length<10)return;
      const dimensions=[
        ['section',ctx.group(records,r=>(Array.isArray(r.sections)&&r.sections.length?r.sections:[r.street||'GERAL']))],
        ['position',ctx.group(records,r=>r.heroPosition||null)],
        ['street',ctx.group(records,r=>r.street||null)],
        ['stack',ctx.group(records,r=>{const v=ctx.scenario(r,'effectiveStack');return v?String(v)+'BB':null;})]
      ];
      const candidates=[];
      dimensions.forEach(([dimension,groups])=>groups.filter(g=>g.counts.total>=10).forEach(g=>{
        const score=Number(g.grade?.score)||0,adjustable=g.counts.total?g.counts.adjustable/g.counts.total*100:0;
        const kind=score<65?'weakness':(score<80||adjustable>=25?'reinforcement':null);
        if(kind)candidates.push({dimension,g,score,adjustable,kind});
      }));
      candidates.sort((a,b)=>(a.kind==='weakness'?0:1)-(b.kind==='weakness'?0:1)||a.score-b.score||b.g.counts.total-a.g.counts.total);
      candidates.slice(0,12).forEach(c=>{
        const key='grinder:'+c.dimension+':'+String(c.g.name).toLowerCase(),old=lib.get(key),pri=priority(c.score);
        if(old?.status==='completed'&&c.score>=80)return;
        lib.upsert({
          externalKey:key,origin:'grinder',kind:c.kind,priority:pri,
          title:(c.kind==='weakness'?(L()==='en'?'WEAKNESS':L()==='es'?'DEBILIDAD':'FRAQUEZA'):(L()==='en'?'REINFORCEMENT':L()==='es'?'REFUERZO':'REFORÇO'))+' · '+String(c.g.name),
          reason:(L()==='en'?'Technical score ':L()==='es'?'Score técnico ':'Score técnico ')+c.score.toFixed(0)+'% · '+c.g.counts.total+' spots · '+c.adjustable.toFixed(0)+'% '+(L()==='en'?'adjustable':L()==='es'?'ajustables':'ajustáveis'),
          targetSpots:c.kind==='weakness'?50:30,scheduledAt:old?.scheduledAt||new Date().toISOString(),dueAt:old?.dueAt||dueFor(pri),
          filters:filtersFor(c.g,c.dimension),
          meta:{...(old?.meta||{}),prescriptionId:old?.meta?.prescriptionId||key,dimension:c.dimension,baselineScore:c.score,baselineSpots:c.g.counts.total,severity:Math.max(0,100-c.score),confidence:Math.min(100,c.g.counts.total*2)}
        });
      });
    }
    function syncCompletion(){
      lib.list().forEach(item=>{
        if(item.status!=='in_progress')return;
        const p=progress(item);if(p.done<p.target)return;
        complete(item,p);
      });
    }
    function complete(item,p){
      let updated=lib.setStatus(item.id,'completed');
      if(updated?.origin==='heroes'&&!updated?.meta?.completionSent&&bridge){
        bridge.send('training_completed','heroes',{
          prescriptionId:pid(updated),title:updated.title,spots:p.counts.total,correct:p.counts.correct,
          adjustable:p.counts.adjustable,incorrect:p.counts.incorrect,accuracy:p.counts.accuracy,
          technical:p.counts.technical,completedAt:new Date().toISOString()
        },{correlationId:updated.sourceMessageId||pid(updated)});
        updated=lib.upsert({...updated,meta:{...(updated.meta||{}),completionSent:true}});
      }
      return updated;
    }
    function progressMap(items){
      const map={};items.forEach(item=>map[item.id]=progress(item).pct);return map;
    }
    function runCoach(items){
      coach.schedule(items,item=>{
        const p=progress(item);
        return {done:p.done,score:p.score,delta:p.delta};
      },L());
      coach.flush();
    }

    function renderPersonal(){
      syncHeroes();syncGrinder();syncCompletion();
      const tx=T(),base=lib.list(),map=progressMap(base),items=lib.list({progressById:map});
      runCoach(items);
      const live=items.filter(x=>x.status!=='dismissed');
      const counts={
        heroes:live.filter(x=>x.origin==='heroes').length,
        grinder:live.filter(x=>x.origin==='grinder').length,
        weak:live.filter(x=>x.kind==='weakness').length,
        progress:live.filter(x=>x.status==='in_progress').length
      };
      const filtered=live.filter(x=>personalFilter==='all'||x.origin===personalFilter||x.kind===personalFilter||(personalFilter==='completed'&&x.status==='completed'));
      const tabs=[['all',tx.all],['heroes',tx.heroes],['grinder',tx.grinder],['weakness',tx.weak],['reinforcement',tx.reinforce],['completed',tx.completed]];
      const hero='<div class="personalhero"><b>'+esc(tx.summary)+'</b><span>'+esc(tx.desc)+'</span><div class="personalstats"><div class="personalstat"><strong>'+counts.heroes+'</strong><small>HEROES</small></div><div class="personalstat"><strong>'+counts.grinder+'</strong><small>GRINDER</small></div><div class="personalstat"><strong>'+counts.weak+'</strong><small>'+esc(tx.weak)+'</small></div><div class="personalstat"><strong>'+counts.progress+'</strong><small>'+esc(tx.progress)+'</small></div></div></div>';
      const nav='<div class="personaltabs">'+tabs.map(x=>'<button data-pf="'+x[0]+'" class="'+(personalFilter===x[0]?'on':'')+'">'+esc(x[1])+'</button>').join('')+'</div>';
      const list=filtered.length?filtered.map(item=>{
        const p=progress(item),rel=lib.relevance(item,{progressById:{[item.id]:p.pct}});
        const status=item.status==='in_progress'?tx.progress:item.status==='completed'?tx.completed:tx.pending;
        const action=item.status==='in_progress'?tx.continue:tx.start;
        return '<div class="personalcard"><div class="personalcardtop"><div class="personalcardtitle"><b>'+esc(item.title)+'</b><small>'+esc((item.kind==='weakness'?tx.weak:tx.reinforce)+' · '+status)+'</small></div><span class="personalbadge">'+esc(String(item.origin).toUpperCase())+'</span></div>'+
          '<div class="personalmeta"><span>'+tx.priority+': '+esc(String(item.priority).toUpperCase())+'</span><span>'+tx.relevance+': '+rel+'</span><span>'+tx.goal+': '+p.target+' '+tx.spots+'</span><span>'+p.done+' / '+p.target+' '+tx.spots+'</span></div>'+
          (item.reason?'<span class="personalreason"><b>'+tx.reason+':</b> '+esc(item.reason)+'</span>':'')+
          '<div class="personalprogressline"><span>'+esc(status)+'</span><span>'+p.pct.toFixed(0)+'%</span></div><div class="personalprogress"><i style="width:'+p.pct.toFixed(1)+'%"></i></div>'+
          '<div class="personalactions"><button class="primary" data-pa="start" data-id="'+esc(item.id)+'">'+esc(action)+'</button><button data-pa="finish" data-id="'+esc(item.id)+'">'+esc(tx.finish)+'</button></div></div>';
      }).join(''):'<div class="personalempty">'+esc(tx.empty)+'</div>';
      personal.innerHTML=hero+nav+'<div class="personallist">'+list+'</div>';
    }

    function renderProfile(){
      const tx=T(),cfg=coach.settings(),templates=coach.templates(L()),transport=typeof global.StackUpWhatsAppTransport?.send==='function';
      const outbox=coach.outbox().length;
      profile.innerHTML=
        '<div class="coachcard"><b>'+esc(tx.coach)+'</b><span>'+esc(tx.coachDesc)+'</span>'+
        '<div class="coachstate"><span>'+esc(tx.coach)+'</span><strong>'+(cfg.enabled?esc(tx.enabled):esc(tx.disabled))+'</strong></div>'+
        '<button class="coachtoggle '+(cfg.enabled?'on':'')+'" data-coach-toggle>'+(cfg.enabled?esc(tx.enabled):esc(tx.disabled))+'</button>'+
        '<div class="coachgrid"><input data-coach-phone value="'+esc(cfg.phone)+'" placeholder="'+esc(tx.phone)+'"><select data-coach-max><option value="1"'+(cfg.maxPerDay===1?' selected':'')+'>1 / DIA</option><option value="2"'+(cfg.maxPerDay===2?' selected':'')+'>2 / DIA</option><option value="3"'+(cfg.maxPerDay===3?' selected':'')+'>3 / DIA</option><option value="4"'+(cfg.maxPerDay===4?' selected':'')+'>4 / DIA</option></select><input data-coach-start type="time" value="'+esc(cfg.quietStart)+'"><input data-coach-end type="time" value="'+esc(cfg.quietEnd)+'"></div>'+
        '<button class="coachsave" data-coach-save>'+esc(tx.save)+'</button>'+
        '<div class="coachstatus">'+esc(tx.backend)+': '+esc(transport?tx.ready:tx.waiting)+' · '+esc(tx.queued)+': '+outbox+'</div></div>'+
        '<div class="coachcard"><b>'+esc(tx.templates)+'</b><div class="coachtemplates">'+templates.map((m,i)=>'<div class="coachtemplate"><b>'+(i+1)+'. '+esc(m.title)+'</b><span>'+esc(m.body)+'</span></div>').join('')+'</div></div>';
    }

    personal.addEventListener('click',e=>{
      const f=e.target.closest('[data-pf]');if(f){personalFilter=f.dataset.pf||'all';renderPersonal();return;}
      const a=e.target.closest('[data-pa][data-id]');if(!a)return;
      const item=lib.get(a.dataset.id);if(!item)return;
      if(a.dataset.pa==='start'){lib.setStatus(item.id,'in_progress');ctx.startTraining(lib.get(item.id));ctx.toast(T().loaded);}
      if(a.dataset.pa==='finish'){complete(item,progress(item));renderPersonal();ctx.toast(T().done);}
    });
    profile.addEventListener('click',async e=>{
      const t=e.target.closest('[data-coach-toggle]');
      if(t){
        const cfg=coach.settings(),enabled=!cfg.enabled;
        coach.setSettings({enabled});
        if(enabled&&'Notification' in global&&Notification.permission==='default'){try{await Notification.requestPermission();}catch(_){}}
        renderProfile();return;
      }
      if(e.target.closest('[data-coach-save]')){
        coach.setSettings({
          phone:profile.querySelector('[data-coach-phone]')?.value||'',
          maxPerDay:Number(profile.querySelector('[data-coach-max]')?.value)||2,
          quietStart:profile.querySelector('[data-coach-start]')?.value||'22:00',
          quietEnd:profile.querySelector('[data-coach-end]')?.value||'08:00'
        });
        renderProfile();ctx.toast(T().saved);
      }
    });

    function showPersonal(on){personal.hidden=!on;personal.style.display=on?'flex':'none';if(on)renderPersonal();}
    function showProfile(on){profile.hidden=!on;profile.style.display=on?'flex':'none';if(on)renderProfile();}
    function onRecord(){syncCompletion();const items=lib.list().filter(x=>x.status!=='dismissed');runCoach(items);if(!personal.hidden)renderPersonal();}
    function onBridge(env){if(env?.type==='training_prescription'&&env?.source==='heroes'){syncHeroes();if(!personal.hidden)renderPersonal();}}

    return Object.freeze({personal,profile,showPersonal,showProfile,renderPersonal,renderProfile,onRecord,onBridge});
  }

  global.StackUpPersonalUI=Object.freeze({mount});
})(window);
