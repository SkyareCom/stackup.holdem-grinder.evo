/* StackUp Hold'em Grinder EVO — personal training performance.
   Stores decision-level results locally so STATS can build session, section and training reports. */
(function(global){
  'use strict';

  const RECORDS_KEY='training_performance_records_v1';
  const SESSIONS_KEY='training_performance_sessions_v1';
  const MAX_RECORDS=5000;
  const MAX_SESSIONS=250;
  const memory={records:[],sessions:[],recordsLoaded:false,sessionsLoaded:false};

  function storage(){ return global.StackUpGrinder?.storage||null; }
  function clone(v){
    if(v===undefined)return undefined;
    if(global.structuredClone){try{return global.structuredClone(v);}catch(_){}}
    try{return JSON.parse(JSON.stringify(v));}catch(_){return v;}
  }
  function uuid(){
    try{return crypto.randomUUID();}catch(_){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  }
  function read(key,fallback){
    try{
      const v=storage()?.get?.(key,null);
      if(Array.isArray(v))return v;
      const raw=localStorage.getItem('stackup:grinder:'+key);
      if(raw){const j=JSON.parse(raw);if(Array.isArray(j))return j;}
    }catch(_){}
    return fallback;
  }
  function write(key,value,max){
    const clean=(Array.isArray(value)?value:[]).slice(0,max);
    try{
      if(storage()?.set)storage().set(key,clean);
      else localStorage.setItem('stackup:grinder:'+key,JSON.stringify(clean));
    }catch(_){}
    return clean;
  }
  function records(){
    if(!memory.recordsLoaded){
      memory.records=read(RECORDS_KEY,memory.records);
      memory.recordsLoaded=true;
    }
    return memory.records.map(clone);
  }
  function sessions(){
    if(!memory.sessionsLoaded){
      memory.sessions=read(SESSIONS_KEY,memory.sessions);
      memory.sessionsLoaded=true;
    }
    return memory.sessions.map(clone);
  }
  function startSession(meta){
    const now=new Date().toISOString();
    const item=Object.assign({
      id:uuid(),
      name:'',
      training:'TREINO GERAL',
      sections:[],
      startedAt:now,
      updatedAt:now,
      filters:null,
      language:'pt'
    },clone(meta||{}));
    const list=sessions();
    list.unshift(item);
    memory.sessions=write(SESSIONS_KEY,list,MAX_SESSIONS);
    memory.sessionsLoaded=true;
    return item.id;
  }
  function updateSession(id,patch){
    if(!id)return null;
    const list=sessions();
    const i=list.findIndex(x=>x.id===id);
    if(i<0)return null;
    list[i]=Object.assign({},list[i],clone(patch||{}),{updatedAt:new Date().toISOString()});
    memory.sessions=write(SESSIONS_KEY,list,MAX_SESSIONS);
    return clone(list[i]);
  }
  function record(input){
    const now=new Date().toISOString();
    const item=Object.assign({
      id:uuid(),
      sessionId:null,
      answeredAt:now,
      spotId:'',
      training:'TREINO GERAL',
      sections:[],
      street:'',
      heroPosition:'',
      hand:'',
      status:'unknown',
      chosenAction:'',
      indicatedAction:'',
      chosenFrequency:0,
      bestFrequency:0,
      filters:null,
      solver:''
    },clone(input||{}));
    if(!item.sessionId)item.sessionId='session-'+now.slice(0,16);
    const list=records();
    const duplicate=list.find(x=>x.sessionId===item.sessionId&&x.spotId===item.spotId&&x.answeredAt===item.answeredAt);
    if(duplicate)return clone(duplicate);
    list.unshift(item);
    memory.records=write(RECORDS_KEY,list,MAX_RECORDS);
    memory.recordsLoaded=true;
    updateSession(item.sessionId,{updatedAt:now});
    return clone(item);
  }
  function clear(){
    memory.records=[];memory.sessions=[];
    memory.recordsLoaded=true;memory.sessionsLoaded=true;
    write(RECORDS_KEY,[],MAX_RECORDS);
    write(SESSIONS_KEY,[],MAX_SESSIONS);
  }
  window.addEventListener?.('storage',event=>{
    const key=String(event?.key||'');
    if(key.includes(RECORDS_KEY))memory.recordsLoaded=false;
    if(key.includes(SESSIONS_KEY))memory.sessionsLoaded=false;
  });

  global.StackUpTrainingPerformance=Object.freeze({startSession,updateSession,record,records,sessions,clear});
})(window);
