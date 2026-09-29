/* StackUp Hold'em Grinder EVO — solver transport for SPOTS.
   No UI code lives here. If no solver endpoint is configured, it stays silent
   and the existing SPOTS screen keeps its current fallback data. */
(function(global){
  'use strict';

  const state={current:null,loading:false,error:null,lastAnswer:null};
  const cfg=Object.assign({
    enabled:true,
    baseUrl:'',
    nextPath:'/v1/grinder/spots/next',
    answerPath:'/v1/grinder/spots/answer',
    requestTimeoutMs:12000
  },global.STACKUP_SOLVER_CONFIG||{});

  function baseUrl(){
    return String(cfg.baseUrl||global.StackUpGrinder?.config?.apiBase||'').replace(/\/$/,'');
  }

  function available(){
    return cfg.enabled!==false&&!!baseUrl();
  }

  async function rawRequest(path,{method='GET',body=null}={}){
    const base=baseUrl();
    if(!base)return {ok:false,status:0,error:'solver_api_not_configured'};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),cfg.requestTimeoutMs);
    try{
      const headers={'Accept':'application/json','X-StackUp-Product':'grinder'};
      const identity=global.StackUpGrinder?.identity?.get?.();
      if(identity?.token)headers.Authorization='Bearer '+identity.token;
      if(body!==null)headers['Content-Type']='application/json';
      const res=await fetch(base+'/'+String(path||'').replace(/^\//,''),{
        method,headers,body:body===null?undefined:JSON.stringify(body),signal:controller.signal,credentials:'omit'
      });
      clearTimeout(timer);
      let data=null;
      try{data=await res.json();}catch(_){}
      return {ok:res.ok,status:res.status,data};
    }catch(error){
      clearTimeout(timer);
      return {ok:false,status:0,error:error?.name==='AbortError'?'timeout':'network_error'};
    }
  }

  function toQuery(filters){
    const q=new URLSearchParams();
    Object.entries(filters||{}).forEach(([k,v])=>{
      if(v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length))return;
      q.set(k,Array.isArray(v)?v.join(','):String(v));
    });
    return q.toString();
  }

  async function next(filters){
    if(!available())return null;
    state.loading=true;state.error=null;
    try{
      const qs=toQuery(filters);
      const res=await rawRequest(cfg.nextPath+(qs?'?'+qs:''),{method:'GET'});
      if(!res.ok)throw new Error('solver_next_failed_'+res.status);
      const spot=res.data?.spot||res.data;
      global.StackUpSpotsEngine?.validateSolverSpot?.(spot);
      state.current=spot;
      return spot;
    }catch(error){
      state.error=String(error?.message||error);
      return null;
    }finally{
      state.loading=false;
    }
  }

  async function answer(payload){
    state.lastAnswer=payload||null;
    if(!available())return {ok:false,status:0,error:'solver_api_not_configured'};
    return rawRequest(cfg.answerPath,{method:'POST',body:payload||{}});
  }

  function setCurrent(spot){
    global.StackUpSpotsEngine?.validateSolverSpot?.(spot);
    state.current=spot;
    state.error=null;
    return spot;
  }

  global.StackUpSpotsClient=Object.freeze({
    config:cfg,
    state,
    available,
    next,
    answer,
    setCurrent
  });
})(window);
