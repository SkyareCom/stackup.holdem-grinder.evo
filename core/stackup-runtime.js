/* StackUp Hold'em Grinder — scalable runtime foundation.
   Non-invasive: no feature is gated until the UI explicitly asks this layer. */
(function(global){
  'use strict';

  const PRODUCT='grinder';
  const STORAGE_VERSION='v1';
  const PREFIX='stackup:'+PRODUCT+':'+STORAGE_VERSION+':';
  const memory=new Map();
  const cfg=Object.assign({
    product:PRODUCT,
    appVersion:'scalable-v1',
    apiBase:'',
    analyticsPath:'/v1/analytics/events/batch',
    requestTimeoutMs:10000,
    analyticsBatchSize:25,
    analyticsQueueMax:500
  },global.STACKUP_CONFIG||{});

  function rawGet(k){
    try{return localStorage.getItem(PREFIX+k);}catch(_){return memory.has(k)?memory.get(k):null;}
  }
  function rawSet(k,v){
    try{localStorage.setItem(PREFIX+k,v);}catch(_){memory.set(k,v);}
  }
  function get(k,fallback=null){
    const v=rawGet(k); if(v==null)return fallback;
    try{return JSON.parse(v);}catch(_){return fallback;}
  }
  function set(k,v){rawSet(k,JSON.stringify(v));return v;}
  function remove(k){
    try{localStorage.removeItem(PREFIX+k);}catch(_){memory.delete(k);}
  }
  function uuid(){
    try{return crypto.randomUUID();}catch(_){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  }

  const sessionId=uuid();
  const PLANS=Object.freeze({
    free:Object.freeze(['training.core','spots.basic','stats.basic']),
    edge:Object.freeze(['training.core','spots.basic','stats.basic','training.advanced','history','goals','stats.advanced','recommendations']),
    full:Object.freeze(['training.core','spots.basic','stats.basic','training.advanced','history','goals','stats.advanced','recommendations','training.full','personalization.advanced','premium.content','early_access'])
  });

  const identity={
    anonymousId(){
      let id=get('anonymous_id');
      if(!id){id=uuid();set('anonymous_id',id);}
      return id;
    },
    get(){return get('identity',{stackupId:null,anonymousId:this.anonymousId(),token:null,authProvider:null,providerSubject:null,email:null,displayName:null,picture:null,verifiedAt:null});},
    set(snapshot){
      const prev=this.get();
      return set('identity',Object.assign({},prev,snapshot||{},{anonymousId:prev.anonymousId||this.anonymousId()}));
    },
    clear(){
      const anonymousId=this.anonymousId();
      set('identity',{stackupId:null,anonymousId,token:null,authProvider:null,providerSubject:null,email:null,displayName:null,picture:null,verifiedAt:null});
    }
  };

  const subscriptions={
    get(){
      return get('subscription',{product:PRODUCT,plan:'free',status:'inactive',source:'local',updatedAt:null});
    },
    set(snapshot){
      const allowed=new Set(['free','edge','full']);
      const next=Object.assign({},this.get(),snapshot||{},{product:PRODUCT,updatedAt:new Date().toISOString()});
      if(!allowed.has(next.plan))throw new Error('Invalid Grinder plan: '+next.plan);
      return set('subscription',next);
    },
    plan(){return this.get().plan||'free';},
    entitlements(){
      const remote=get('entitlements');
      if(remote&&Array.isArray(remote.items))return new Set(remote.items);
      return new Set(PLANS[this.plan()]||PLANS.free);
    },
    can(feature){return this.entitlements().has(feature);}
  };

  const flags={
    all(){return get('feature_flags',{});},
    enabled(name,fallback=false){
      const f=this.all();
      return Object.prototype.hasOwnProperty.call(f,name)?Boolean(f[name]):fallback;
    },
    replace(next){return set('feature_flags',Object.assign({},next||{}));}
  };

  function analyticsContext(){
    const i=identity.get(),s=subscriptions.get();
    return {
      product:PRODUCT,
      app_version:cfg.appVersion,
      plan:s.plan||'free',
      session_id:sessionId,
      stackup_id:i.stackupId||null,
      anonymous_id:i.anonymousId||identity.anonymousId()
    };
  }
  function queue(){
    const q=get('analytics_queue',[]);
    return Array.isArray(q)?q:[];
  }
  function writeQueue(q){set('analytics_queue',q.slice(-cfg.analyticsQueueMax));}
  function validEventName(name){return typeof name==='string'&&/^[a-z][a-z0-9_]{1,63}$/.test(name);}

  const analytics={
    track(name,props){
      if(!validEventName(name))throw new Error('Invalid analytics event: '+name);
      const event=Object.assign({
        event_id:uuid(),
        event:name,
        occurred_at:new Date().toISOString()
      },analyticsContext(),{properties:Object.assign({},props||{})});
      const q=queue();q.push(event);writeQueue(q);
      if(q.length>=cfg.analyticsBatchSize)this.flush().catch(()=>{});
      return event;
    },
    crossSell(destinationProduct,destinationPlan,props){
      return this.track('cross_sell_viewed',Object.assign({
        origin_product:PRODUCT,
        destination_product:destinationProduct,
        destination_plan:destinationPlan||null
      },props||{}));
    },
    async flush(){
      if(!cfg.apiBase)return {sent:0,pending:queue().length,reason:'api_not_configured'};
      const q=queue(); if(!q.length)return {sent:0,pending:0};
      const batch=q.slice(0,cfg.analyticsBatchSize);
      const res=await api.request(cfg.analyticsPath,{method:'POST',body:{events:batch},retry:false});
      if(res.ok){writeQueue(q.slice(batch.length));return {sent:batch.length,pending:queue().length};}
      return {sent:0,pending:q.length,status:res.status};
    }
  };

  const api={
    async request(path,options){
      const opt=Object.assign({method:'GET',headers:{},body:null,retry:true},options||{});
      if(!cfg.apiBase)return {ok:false,status:0,error:'api_not_configured'};
      const id=identity.get();
      const headers=Object.assign({
        'Accept':'application/json',
        'X-StackUp-Product':PRODUCT,
        'X-StackUp-App-Version':cfg.appVersion
      },opt.headers||{});
      if(opt.body!=null)headers['Content-Type']='application/json';
      if(id.token)headers.Authorization='Bearer '+id.token;
      const url=cfg.apiBase.replace(/\/$/,'')+'/'+String(path||'').replace(/^\//,'');
      const attempts=opt.retry&&opt.method==='GET'?3:1;
      let last;
      for(let n=0;n<attempts;n++){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),cfg.requestTimeoutMs);
        try{
          const response=await fetch(url,{
            method:opt.method,
            headers,
            body:opt.body==null?undefined:JSON.stringify(opt.body),
            signal:controller.signal,
            credentials:'omit'
          });
          clearTimeout(timer);
          let data=null;
          const ct=response.headers.get('content-type')||'';
          if(ct.includes('application/json')){try{data=await response.json();}catch(_){}}
          const out={ok:response.ok,status:response.status,data};
          if(response.ok||response.status<500)return out;
          last=out;
        }catch(error){
          clearTimeout(timer);
          last={ok:false,status:0,error:error&&error.name==='AbortError'?'timeout':'network_error'};
        }
        if(n<attempts-1)await new Promise(resolve=>setTimeout(resolve,250*Math.pow(2,n)));
      }
      return last||{ok:false,status:0,error:'unknown'};
    }
  };

  const runtime={
    product:PRODUCT,
    config:cfg,
    plans:PLANS,
    storage:Object.freeze({get,set,remove,prefix:PREFIX}),
    identity,
    subscriptions,
    flags,
    analytics,
    api,
    boot(){
      identity.anonymousId();
      analytics.track('app_loaded',{surface:'web'});
      global.addEventListener('online',()=>analytics.flush().catch(()=>{}));
      if(document.visibilityState==='visible')analytics.flush().catch(()=>{});
      return this;
    }
  };

  global.StackUpGrinder=runtime;
})(window);
