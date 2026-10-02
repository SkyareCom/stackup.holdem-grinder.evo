/* StackUp Grinder — PERSONAL training prescription library. */
(function(global){
  'use strict';
  const KEY='stackup.grinder.personal.trainings.v1';
  const MAX=120;

  function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}}
  function write(v){try{localStorage.setItem(KEY,JSON.stringify((v||[]).slice(0,MAX)));return true;}catch(_){return false;}}
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
      filters:x?.filters&&typeof x.filters==='object'?x.filters:{},
      meta:x?.meta&&typeof x.meta==='object'?x.meta:{}
    };
  }
  function list(){
    return read().map(clean).sort((a,b)=>{
      const rank={in_progress:0,pending:1,completed:2,dismissed:3};
      return (rank[a.status]??9)-(rank[b.status]??9)||
        ({critical:0,high:1,medium:2,normal:3,low:4}[a.priority]??9)-({critical:0,high:1,medium:2,normal:3,low:4}[b.priority]??9)||
        a.title.localeCompare(b.title,undefined,{sensitivity:'base',numeric:true});
    });
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
  function clear(){try{localStorage.removeItem(KEY);return true;}catch(_){return false;}}

  global.StackUpPersonalTraining=Object.freeze({list,get,upsert,setStatus,remove,clear});
})(window);
