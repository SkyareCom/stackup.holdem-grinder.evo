/* StackUp Grinder — WhatsApp Coach planner and future delivery adapter.
   Automatic scheduling is local-first. Actual WhatsApp delivery requires
   a server-side WhatsApp Business transport exposed as window.StackUpWhatsAppTransport.send(message). */
(function(global){
  'use strict';

  const SETTINGS='stackup.grinder.whatsapp-coach.settings.v1';
  const OUTBOX='stackup.grinder.whatsapp-coach.outbox.v1';
  const SENT='stackup.grinder.whatsapp-coach.sent.v1';

  const TEMPLATES={
    pt:[
      {id:'new_training',title:'NOVO TREINO',body:'Novo treino indicado: {{title}}. Origem: {{origin}}. Prioridade: {{priority}}. Meta: {{target}} spots. Motivo: {{reason}}.'},
      {id:'high_priority',title:'PRIORIDADE ALTA',body:'{{title}} está entre os pontos mais importantes do seu plano agora. Você está em {{done}}/{{target}} spots. Vale priorizar este treino hoje.'},
      {id:'due_today',title:'TREINO PROGRAMADO',body:'Seu treino {{title}} está programado para hoje. Faltam {{remaining}} spots para concluir a meta.'},
      {id:'overdue',title:'PENDÊNCIA',body:'O treino {{title}} está pendente desde {{deadline}}. Retome do ponto em que parou: {{done}}/{{target}} spots.'},
      {id:'stalled',title:'TREINO PARADO',body:'Você iniciou {{title}}, mas não avançou recentemente. Uma sessão curta de reforço pode recolocar esse ponto no ritmo.'},
      {id:'halfway',title:'META PELA METADE',body:'Você chegou a {{progress}}% de {{title}}. Restam {{remaining}} spots para fechar esta etapa.'},
      {id:'improving',title:'EVOLUÇÃO',body:'Seu desempenho em {{title}} está evoluindo. Score atual: {{score}}. Continue até completar a amostra recomendada.'},
      {id:'weakness',title:'FRAQUEZA DETECTADA',body:'{{origin}} identificou uma fraqueza em {{title}}. Score atual: {{score}}. O treino recomendado já está no PERSONAL.'},
      {id:'reinforcement',title:'REFORÇO RECOMENDADO',body:'{{title}} não é uma falha crítica, mas ainda merece reforço. Meta sugerida: {{target}} spots para consolidar o padrão.'},
      {id:'completed',title:'TREINO CONCLUÍDO',body:'Meta concluída em {{title}}: {{done}} spots. Score técnico: {{score}}. O próximo passo será definido pela sua evolução.'}
    ],
    en:[
      {id:'new_training',title:'NEW TRAINING',body:'New prescribed training: {{title}}. Source: {{origin}}. Priority: {{priority}}. Goal: {{target}} spots. Reason: {{reason}}.'},
      {id:'high_priority',title:'HIGH PRIORITY',body:'{{title}} is one of the most important items in your current plan. You are at {{done}}/{{target}} spots. Prioritize it today.'},
      {id:'due_today',title:'SCHEDULED TRAINING',body:'Your {{title}} training is scheduled for today. {{remaining}} spots remain to complete the goal.'},
      {id:'overdue',title:'PENDING TRAINING',body:'{{title}} has been pending since {{deadline}}. Resume where you stopped: {{done}}/{{target}} spots.'},
      {id:'stalled',title:'STALLED TRAINING',body:'You started {{title}} but have not progressed recently. A short reinforcement session can put it back on track.'},
      {id:'halfway',title:'HALFWAY',body:'You reached {{progress}}% of {{title}}. {{remaining}} spots remain to finish this stage.'},
      {id:'improving',title:'IMPROVING',body:'Your performance in {{title}} is improving. Current score: {{score}}. Continue until the recommended sample is complete.'},
      {id:'weakness',title:'WEAKNESS DETECTED',body:'{{origin}} detected a weakness in {{title}}. Current score: {{score}}. The recommended training is already in PERSONAL.'},
      {id:'reinforcement',title:'REINFORCEMENT RECOMMENDED',body:'{{title}} is not a critical leak, but it still needs reinforcement. Suggested goal: {{target}} spots.'},
      {id:'completed',title:'TRAINING COMPLETED',body:'Goal completed in {{title}}: {{done}} spots. Technical score: {{score}}. Your next step will be based on your evolution.'}
    ],
    es:[
      {id:'new_training',title:'NUEVO ENTRENO',body:'Nuevo entreno indicado: {{title}}. Origen: {{origin}}. Prioridad: {{priority}}. Meta: {{target}} spots. Motivo: {{reason}}.'},
      {id:'high_priority',title:'PRIORIDAD ALTA',body:'{{title}} está entre los puntos más importantes de tu plan actual. Vas en {{done}}/{{target}} spots. Conviene priorizarlo hoy.'},
      {id:'due_today',title:'ENTRENO PROGRAMADO',body:'Tu entreno {{title}} está programado para hoy. Faltan {{remaining}} spots para completar la meta.'},
      {id:'overdue',title:'PENDIENTE',body:'El entreno {{title}} está pendiente desde {{deadline}}. Retómalo donde lo dejaste: {{done}}/{{target}} spots.'},
      {id:'stalled',title:'ENTRENO DETENIDO',body:'Empezaste {{title}}, pero no avanzaste recientemente. Una sesión corta de refuerzo puede devolverlo al ritmo.'},
      {id:'halfway',title:'MITAD DE META',body:'Llegaste al {{progress}}% de {{title}}. Quedan {{remaining}} spots para cerrar esta etapa.'},
      {id:'improving',title:'EVOLUCIÓN',body:'Tu desempeño en {{title}} está mejorando. Score actual: {{score}}. Continúa hasta completar la muestra recomendada.'},
      {id:'weakness',title:'DEBILIDAD DETECTADA',body:'{{origin}} detectó una debilidad en {{title}}. Score actual: {{score}}. El entreno recomendado ya está en PERSONAL.'},
      {id:'reinforcement',title:'REFUERZO RECOMENDADO',body:'{{title}} no es una falla crítica, pero todavía merece refuerzo. Meta sugerida: {{target}} spots.'},
      {id:'completed',title:'ENTRENO COMPLETADO',body:'Meta completada en {{title}}: {{done}} spots. Score técnico: {{score}}. El próximo paso se definirá según tu evolución.'}
    ]
  };

  function read(key,fallback){try{const v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v);}catch(_){return fallback;}}
  function write(key,v){try{localStorage.setItem(key,JSON.stringify(v));return true;}catch(_){return false;}}
  function settings(){
    const s=read(SETTINGS,null);
    return {
      enabled:!!s?.enabled,
      phone:String(s?.phone||''),
      timezone:String(s?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),
      quietStart:String(s?.quietStart||'22:00'),
      quietEnd:String(s?.quietEnd||'08:00'),
      maxPerDay:Math.max(1,Math.min(4,Number(s?.maxPerDay)||2)),
      updatedAt:s?.updatedAt||null
    };
  }
  function setSettings(patch){
    const next={...settings(),...(patch||{}),updatedAt:new Date().toISOString()};
    write(SETTINGS,next);return next;
  }
  function tpl(lang,id){
    return (TEMPLATES[lang]||TEMPLATES.pt).find(x=>x.id===id)||(TEMPLATES.pt.find(x=>x.id===id));
  }
  function render(template,ctx){
    return String(template||'').replace(/{{(\w+)}}/g,(_,k)=>String(ctx?.[k]??'—'));
  }
  function msgId(trainingId,type,bucket){return [trainingId,type,bucket].join(':');}
  function queue(message){
    const items=read(OUTBOX,[]);
    if(items.some(x=>x.id===message.id))return message;
    items.push(message);write(OUTBOX,items.slice(-300));return message;
  }
  function sentToday(){
    const d=new Date().toISOString().slice(0,10);
    return (read(SENT,[])||[]).filter(x=>String(x.sentAt||'').slice(0,10)===d).length;
  }
  function markSent(item){
    const sent=read(SENT,[]);
    sent.push({...item,sentAt:new Date().toISOString()});
    write(SENT,sent.slice(-500));
    write(OUTBOX,(read(OUTBOX,[])||[]).filter(x=>x.id!==item.id));
  }
  function context(item,progress){
    const p=progress||{},target=Math.max(1,Number(item?.targetSpots)||50),done=Math.max(0,Number(p.done)||0);
    const score=Number.isFinite(Number(p.score))?Number(p.score).toFixed(0)+'%':'—';
    return {
      title:item?.title||'TREINO',
      origin:String(item?.origin||'GRINDER').toUpperCase(),
      priority:String(item?.priority||'normal').toUpperCase(),
      target,done,remaining:Math.max(0,target-done),
      progress:Math.min(100,done/target*100).toFixed(0),
      score,reason:item?.reason||'—',
      deadline:item?.dueAt?new Date(item.dueAt).toLocaleDateString():'—'
    };
  }
  function plan(item,progress,lang){
    const now=Date.now(),p=context(item,progress),out=[];
    const created=Date.parse(item?.createdAt||'');
    const due=Date.parse(item?.dueAt||'');
    const last=Date.parse(item?.lastReminderAt||item?.createdAt||'');
    const day=new Date().toISOString().slice(0,10);
    const add=(type,priority)=>{
      const t=tpl(lang,type);if(!t)return;
      out.push({
        id:msgId(item.id,type,day),
        trainingId:item.id,type,priority:priority||item.priority||'normal',
        channel:'whatsapp',createdAt:new Date().toISOString(),
        title:render(t.title,p),body:render(t.body,p),context:p
      });
    };
    if(item.status==='completed'){add('completed','normal');return out;}
    if(Number.isFinite(created)&&now-created<36e5*24)add('new_training',item.priority);
    if(item.kind==='weakness')add('weakness',item.priority);
    if(item.kind==='reinforcement')add('reinforcement',item.priority);
    if(['critical','high'].includes(item.priority)&&p.done<p.target)add('high_priority',item.priority);
    if(Number.isFinite(due)){
      const hours=(due-now)/36e5;
      if(hours>=0&&hours<=24)add('due_today','high');
      if(hours<0)add('overdue','high');
    }
    if(item.status==='in_progress'&&p.done>0&&p.done<p.target&&Number.isFinite(last)&&now-last>48*36e5)add('stalled','medium');
    const pct=Number(p.progress);
    if(pct>=45&&pct<80)add('halfway','normal');
    if(Number(progress?.delta)>4&&p.done<p.target)add('improving','normal');
    return out;
  }
  function schedule(trainings,progressResolver,lang){
    if(!settings().enabled)return [];
    const all=[];
    (trainings||[]).forEach(item=>{
      const progress=typeof progressResolver==='function'?progressResolver(item):{};
      plan(item,progress,lang||'pt').forEach(x=>{queue(x);all.push(x);});
    });
    return all;
  }
  async function flush(){
    const cfg=settings();
    if(!cfg.enabled)return {sent:0,pending:(read(OUTBOX,[])||[]).length,status:'disabled'};
    const sender=global.StackUpWhatsAppTransport?.send;
    if(typeof sender!=='function')return {sent:0,pending:(read(OUTBOX,[])||[]).length,status:'awaiting_backend'};
    let sent=0;
    for(const item of [...(read(OUTBOX,[])||[])]){
      if(sentToday()>=cfg.maxPerDay)break;
      try{
        const ok=await sender({...item,phone:cfg.phone});
        if(ok!==false){markSent(item);sent++;}
      }catch(_){}
    }
    return {sent,pending:(read(OUTBOX,[])||[]).length,status:'ok'};
  }

  global.StackUpWhatsAppCoach=Object.freeze({
    templates:lang=>[...(TEMPLATES[lang]||TEMPLATES.pt)],
    settings,setSettings,plan,schedule,flush,
    outbox:()=>[...(read(OUTBOX,[])||[])],
    sent:()=>[...(read(SENT,[])||[])]
  });
})(window);
