/* StackUp Hold'em Grinder EVO — persistent STATS report library. */
(function(global){
  'use strict';

  const KEY='stackup.grinder.stats.reports.v1';
  const MAX_REPORTS=80;
  let memory=null;

  function read(){
    if(Array.isArray(memory))return memory;
    try{
      const data=JSON.parse(localStorage.getItem(KEY)||'[]');
      memory=Array.isArray(data)?data:[];
    }catch(_){memory=[];}
    return memory;
  }
  function write(items){
    memory=(items||[]).slice(0,MAX_REPORTS);
    try{
      localStorage.setItem(KEY,JSON.stringify(memory));
      return true;
    }catch(_){return false;}
  }
  function id(){
    try{
      if(global.crypto?.randomUUID)return global.crypto.randomUUID();
    }catch(_){}
    return 'report-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  }
  function hash(text){
    let h=2166136261;
    const s=String(text||'');
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0');
  }
  function clean(item){
    const now=new Date().toISOString();
    return {
      id:String(item?.id||id()),
      name:String(item?.name||'RELATÓRIO STATS'),
      createdAt:String(item?.createdAt||now),
      updatedAt:String(item?.updatedAt||now),
      language:String(item?.language||'pt'),
      view:String(item?.view||'report'),
      fingerprint:String(item?.fingerprint||''),
      recordKeys:Array.isArray(item?.recordKeys)?[...new Set(item.recordKeys.map(String))]:[],
      summary:item?.summary&&typeof item.summary==='object'?item.summary:{},
      text:String(item?.text||''),
      html:String(item?.html||'')
    };
  }
  function list(){
    return read().map(clean).sort((a,b)=>
      a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true})||
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }
  function get(reportId){
    return list().find(x=>x.id===String(reportId))||null;
  }
  function save(input){
    const items=read().map(clean);
    const now=new Date().toISOString();
    const recordKeys=Array.isArray(input?.recordKeys)?[...new Set(input.recordKeys.map(String))]:[];
    const fingerprint=String(input?.fingerprint||hash([
      input?.view||'report',
      recordKeys.join('|'),
      input?.summary?.total??'',
      input?.summary?.technical??''
    ].join('::')));
    const existing=items.find(x=>x.fingerprint===fingerprint);
    if(existing){
      Object.assign(existing,clean({...existing,...input,id:existing.id,createdAt:existing.createdAt,updatedAt:now,fingerprint,recordKeys}));
      write(items.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));
      return clean(existing);
    }
    const item=clean({...input,createdAt:now,updatedAt:now,fingerprint,recordKeys});
    items.unshift(item);
    write(items);
    return item;
  }
  function remove(reportId){
    const id=String(reportId);
    const items=read().map(clean);
    const next=items.filter(x=>x.id!==id);
    if(next.length===items.length)return false;
    write(next);return true;
  }
  function removeMany(ids){
    const set=new Set((ids||[]).map(String));
    const items=read().map(clean);
    const next=items.filter(x=>!set.has(x.id));
    write(next);
    return items.length-next.length;
  }
  function clear(){
    memory=[];
    try{localStorage.removeItem(KEY);return true;}catch(_){return false;}
  }
  window.addEventListener?.('storage',event=>{if(String(event?.key||'')===KEY)memory=null;});

  global.StackUpReportLibrary=Object.freeze({list,get,save,remove,removeMany,clear});
})(window);
