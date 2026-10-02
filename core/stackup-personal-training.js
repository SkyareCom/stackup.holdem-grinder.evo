/* StackUp Grinder — PERSONAL training prescription library. */
(function(global){
  'use strict';
  const KEY='stackup.grinder.personal.trainings.v1';
  const MAX=120;
  let memory=null;

  function read(){
    if(Array.isArray(memory))return memory;
    try{
      const v=JSON.parse(localStorage.getItem(KEY)||'[]');
      memory=Array.isArray(v)?v:[];
    }catch(_){memory=[];}
    return memory;
  }
  function write(v){
    memory=(v||[]).slice(0,MAX);
    try{localStorage.setItem(KEY,JSON.stringify(memory));return true;}catch(_){return false;}
  }
  function id(){try{if(crypto?.randomUUID)return crypto.randomUUID();}catch(_){}return 'personal-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
  function clean(x){
    const now=new Date().toISOString();
    return {
      id:String(x?.id||id()),
      externalKey:String(x?.externalKey||''),
      sourceMessageId:x?.sourceMessageId?String(x.sourceMessageId):null,
      origin:String(x?.origin||'grinder'),
      kind:String(x?.kind||'reinforcement'),
      priority:String(x?.priority||'normal'),
      title:String(x?.title||'TREINO PERSONAL'),
      reason:String(x?.reason||''),
      status:String(x?.status||'pending'),
      targetSpots:Math.max(1,Number(x?.targetSpots)||50),
      createdAt:String(x?.createdAt||now),
      updatedAt:String(x?.updatedAt||now),
      startedAt:x?.startedAt?String(x.startedAt):null,
      completedAt:x?.completedAt?String(x.completedAt):null,
      scheduledAt:x?.scheduledAt?String(x.scheduledAt):null,
      dueAt:x?.dueAt?String(x.dueAt):null,
      lastReminderAt:x?.lastReminderAt?String(x.lastReminderAt):null,
      reminderCadenceHours:Math.max(6,Number(x?.reminderCadenceHours)||24),
      filters:x?.filters&&typeof x.filters==='object'?x.filters:{},
      meta:x?.meta&&typeof x.meta==='object'?x.meta:{}
    };
  }
  function relevance(item,context){
    const now=Number(context?.now)||Date.now();
    const progress=Number(context?.progressById?.[item.id]??context?.progressByKey?.[item.externalKey]??0);
    const priority={critical:42,high:32,medium:22,normal:12,low:5}[item.priority]??10;
    const status={in_progress:24,pending:18,completed:-60,dismissed:-100}[item.status]??0;
    const kind=item.kind==='weakness'?18:8;
    const origin=item.origin==='heroes'?6:4;
    const severity=Math.max(0,Math.min(100,Number(item.meta?.severity??item.meta?.weaknessScore??item.meta?.baselineRisk??0)))*.18;
    const confidence=Math.max(0,Math.min(100,Number(item.meta?.confidence??0)))*.06;
    const recurrence=Math.min(20,Math.max(0,Number(item.meta?.recurrenceCount||0))*4);
    const due=Date.parse(item.dueAt||'');
    const scheduled=Date.parse(item.scheduledAt||'');
    let urgency=0;
    if(Number.isFinite(due)){
      const hours=(due-now)/36e5;
      urgency=hours<0?28:hours<=24?20:hours<=72?10:0;
    }
    if(Number.isFinite(scheduled)&&scheduled<=now)urgency+=8;
    const stalled=item.status==='in_progress'&&progress<100&&item.lastReminderAt&&now-Date.parse(item.lastReminderAt)>48*36e5?8:0;
    return Math.round((priority+status+kind+origin+severity+confidence+recurrence+urgency+stalled)*10)/10;
  }
  function list(context){
    return read().map(clean).sort((a,b)=>
      relevance(b,context)-relevance(a,context)||
      String(a.dueAt||'9999').localeCompare(String(b.dueAt||'9999'))||
      a.title.localeCompare(b.title,undefined,{sensitivity:'base',numeric:true})
    );
  }
  function get(v){return list().find(x=>x.id===String(v)||x.externalKey===String(v))||null;}
  function upsert(input){
    const items=read().map(clean),now=new Date().toISOString();
    const key=String(input?.externalKey||'');
    const at=items.findIndex(x=>(key&&x.externalKey===key)||(input?.id&&x.id===String(input.id)));
    if(at>=0){
      const old=items[at];
      items[at]=clean({...old,...input,id:old.id,createdAt:old.createdAt,updatedAt:now});
      write(items);return items[at];
    }
    const item=clean({...input,updatedAt:now});
    items.unshift(item);write(items);return item;
  }
  function setStatus(v,status,extra){
    const item=get(v);if(!item)return null;
    const now=new Date().toISOString();
    const patch={status:String(status||item.status),updatedAt:now,...(extra||{})};
    if(status==='in_progress'&&!item.startedAt)patch.startedAt=now;
    if(status==='completed'&&!item.completedAt)patch.completedAt=now;
    return upsert({...item,...patch});
  }
  function remove(v){
    const idv=String(v),items=read().map(clean),next=items.filter(x=>x.id!==idv&&x.externalKey!==idv);
    write(next);return items.length-next.length;
  }
  function clear(){
    memory=[];
    try{localStorage.removeItem(KEY);return true;}catch(_){return false;}
  }

  function markReminder(v,when){
    const item=get(v);if(!item)return null;
    return upsert({...item,lastReminderAt:String(when||new Date().toISOString())});
  }

  window.addEventListener?.('storage',event=>{if(String(event?.key||'')===KEY)memory=null;});

  global.StackUpPersonalTraining=Object.freeze({list,get,upsert,setStatus,remove,clear,relevance,markReminder});
})(window);
