/* StackUp Hold'em Grinder EVO — saved training sessions.
   Persists compact resumable snapshots and the user's History sort preference. */
(function(global){
  'use strict';

  const KEY='saved_trainings_v2';
  const SORT_KEY='saved_trainings_sort_v1';
  const MAX_ITEMS=40;
  const memory={items:[],sort:'date',itemsLoaded:false,sortLoaded:false};

  function storage(){ return global.StackUpGrinder?.storage||null; }
  function clone(v){
    if(global.structuredClone){try{return global.structuredClone(v);}catch(_){}}
    return JSON.parse(JSON.stringify(v));
  }
  function uuid(){
    try{return crypto.randomUUID();}catch(_){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  }
  function readItems(){
    if(memory.itemsLoaded)return memory.items;
    try{
      const raw=storage()?.get?.(KEY,null);
      if(Array.isArray(raw)){memory.items=raw;memory.itemsLoaded=true;return memory.items;}
      const local=localStorage.getItem('stackup:grinder:'+KEY);
      if(local){const j=JSON.parse(local);if(Array.isArray(j)){memory.items=j;memory.itemsLoaded=true;return memory.items;}}
    }catch(_){}
    memory.items=Array.isArray(memory.items)?memory.items:[];
    memory.itemsLoaded=true;
    return memory.items;
  }
  function writeItems(items){
    const clean=(Array.isArray(items)?items:[]).slice(0,MAX_ITEMS);
    memory.items=clean;
    memory.itemsLoaded=true;
    try{
      if(storage()?.set)return storage().set(KEY,clean);
      localStorage.setItem('stackup:grinder:'+KEY,JSON.stringify(clean));
    }catch(_){}
    return clean;
  }
  function readSort(){
    if(memory.sortLoaded)return memory.sort||'date';
    try{
      const v=storage()?.get?.(SORT_KEY,null);
      if(v==='alpha'||v==='date'){memory.sort=v;memory.sortLoaded=true;return v;}
      const local=localStorage.getItem('stackup:grinder:'+SORT_KEY);
      if(local==='alpha'||local==='date'){memory.sort=local;memory.sortLoaded=true;return local;}
    }catch(_){}
    memory.sort=memory.sort||'date';memory.sortLoaded=true;
    return memory.sort;
  }
  function writeSort(value){
    const next=value==='alpha'?'alpha':'date';
    memory.sort=next;
    memory.sortLoaded=true;
    try{
      if(storage()?.set)storage().set(SORT_KEY,next);
      else localStorage.setItem('stackup:grinder:'+SORT_KEY,next);
    }catch(_){}
    return next;
  }
  function sanitizeName(name){
    return String(name||'').trim().replace(/\s+/g,' ').slice(0,64);
  }
  function save(name,snapshot){
    const title=sanitizeName(name);
    if(!title)throw new Error('training_name_required');
    const now=new Date().toISOString();
    const item={
      id:uuid(),
      name:title,
      createdAt:now,
      updatedAt:now,
      snapshot:clone(snapshot||{})
    };
    const items=readItems();
    items.unshift(item);
    writeItems(items);
    return clone(item);
  }
  function list(sortMode){
    const mode=sortMode||readSort();
    const items=readItems().map(clone);
    if(mode==='alpha'){
      items.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    }else{
      items.sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
    }
    return items;
  }
  function get(id){
    const item=readItems().find(x=>x.id===id);
    return item?clone(item):null;
  }
  function remove(id){
    const before=readItems();
    const after=before.filter(x=>x.id!==id);
    writeItems(after);
    return after.length!==before.length;
  }
  function update(id,patch){
    const items=readItems();
    const i=items.findIndex(x=>x.id===id);
    if(i<0)return null;
    items[i]=Object.assign({},items[i],clone(patch||{}),{updatedAt:new Date().toISOString()});
    writeItems(items);
    return clone(items[i]);
  }
  function clear(){
    writeItems([]);
    return true;
  }
  function sortPreference(value){
    if(value!==undefined)return writeSort(value);
    return readSort();
  }

  window.addEventListener?.('storage',event=>{
    const key=String(event?.key||'');
    if(key.includes(KEY))memory.itemsLoaded=false;
    if(key.includes(SORT_KEY))memory.sortLoaded=false;
  });

  global.StackUpTrainingHistory=Object.freeze({save,list,get,remove,update,clear,sortPreference});
})(window);
