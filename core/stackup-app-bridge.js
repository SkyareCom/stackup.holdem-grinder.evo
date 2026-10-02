/* StackUp Cross-App Bridge v1
   Shared contract for HEROES <-> GRINDER and future StackUp apps.
   Security note: client envelopes are transport objects, not authentication.
   Production trust must come from StackUp ID + server-side authorization. */
(function(global){
  'use strict';

  const VERSION='1.0';
  const STORAGE_PREFIX='stackup.bridge.v1';
  const DEFAULT_ORIGINS={
    heroes:'https://skyarecom.github.io',
    grinder:'https://skyarecom.github.io'
  };
  const DEFAULT_PATHS={
    heroes:'/stackup.holdem-heroes/',
    grinder:'/stackup.holdem-grinder.evo/'
  };
  const TYPES=new Set([
    'player_profile','training_prescription','training_progress',
    'training_completed','ack','capabilities'
  ]);

  function uuid(){
    try{if(global.crypto?.randomUUID)return global.crypto.randomUUID();}catch(_){}
    return 'msg-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  function b64urlEncode(value){
    const raw=unescape(encodeURIComponent(JSON.stringify(value)));
    let bin='';for(let i=0;i<raw.length;i++)bin+=String.fromCharCode(raw.charCodeAt(i));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function b64urlDecode(value){
    const v=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=v+'='.repeat((4-v.length%4)%4);
    const bin=atob(padded);let raw='';for(let i=0;i<bin.length;i++)raw+=String.fromCharCode(bin.charCodeAt(i));
    return JSON.parse(decodeURIComponent(escape(raw)));
  }
  function read(key,fallback){
    try{const v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v);}catch(_){return fallback;}
  }
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
  function now(){return new Date().toISOString();}
  function appKey(app,kind){return STORAGE_PREFIX+'.'+app+'.'+kind;}
  function normalizeList(v){return Array.isArray(v)?v.filter(Boolean):[];}

  function makeEnvelope(input){
    const ttl=Math.max(60,Number(input?.ttlSeconds)||86400);
    const createdAt=input?.createdAt||now();
    return Object.freeze({
      protocol:'stackup-cross-app',
      version:VERSION,
      id:String(input?.id||uuid()),
      type:String(input?.type||''),
      source:String(input?.source||''),
      target:String(input?.target||''),
      stackupUserId:input?.stackupUserId?String(input.stackupUserId):null,
      createdAt,
      expiresAt:new Date(Date.parse(createdAt)+ttl*1000).toISOString(),
      correlationId:input?.correlationId?String(input.correlationId):null,
      payload:input?.payload&&typeof input.payload==='object'?input.payload:{}
    });
  }

  function validateEnvelope(env,expectedTarget){
    const errors=[];
    if(!env||typeof env!=='object')errors.push('invalid_envelope');
    if(env?.protocol!=='stackup-cross-app')errors.push('invalid_protocol');
    if(String(env?.version||'').split('.')[0]!==VERSION.split('.')[0])errors.push('unsupported_version');
    if(!TYPES.has(String(env?.type||'')))errors.push('unsupported_type');
    if(!env?.id||!env?.source||!env?.target)errors.push('missing_routing');
    if(expectedTarget&&env?.target!==expectedTarget&&env?.target!=='*')errors.push('wrong_target');
    if(env?.expiresAt&&Date.parse(env.expiresAt)<Date.now())errors.push('expired');
    return {ok:!errors.length,errors};
  }

  function queue(app,kind,env){
    const key=appKey(app,kind),items=read(key,[]);
    const next=[env,...items.filter(x=>x?.id!==env.id)].slice(0,200);
    write(key,next);return env;
  }
  function list(app,kind){
    const items=normalizeList(read(appKey(app,kind),[]));
    return items.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>=Date.now());
  }
  function remove(app,kind,id){
    write(appKey(app,kind),list(app,kind).filter(x=>x.id!==String(id)));
  }

  function parseHandoff(app){
    try{
      const hash=String(global.location?.hash||'');
      const m=hash.match(/(?:^#|[&#])stackup=([^&]+)/);
      if(!m)return null;
      const env=b64urlDecode(decodeURIComponent(m[1]));
      const verdict=validateEnvelope(env,app);
      if(!verdict.ok)return {error:verdict.errors};
      queue(app,'inbox',env);
      try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}
      return {envelope:env};
    }catch(error){return {error:[String(error?.message||error)]};}
  }

  function targetUrl(target,env){
    const origin=DEFAULT_ORIGINS[target],path=DEFAULT_PATHS[target];
    if(!origin||!path)throw new Error('unknown_target');
    return origin+path+'#stackup='+encodeURIComponent(b64urlEncode(env));
  }

  async function remoteSend(env,options){
    const base=String(options?.apiBase||global.STACKUP_CORE_API||'').replace(/\/$/,'');
    const token=String(options?.accessToken||global.STACKUP_ACCESS_TOKEN||'');
    if(!base||!token)return {ok:false,mode:'unconfigured'};
    try{
      const res=await fetch(base+'/v1/integrations/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify(env),
        credentials:'omit'
      });
      return {ok:res.ok,status:res.status,mode:'remote'};
    }catch(error){return {ok:false,status:0,mode:'remote',error:String(error?.message||error)};}
  }

  async function remotePull(app,options){
    const base=String(options?.apiBase||global.STACKUP_CORE_API||'').replace(/\/$/,'');
    const token=String(options?.accessToken||global.STACKUP_ACCESS_TOKEN||'');
    if(!base||!token)return {ok:false,mode:'unconfigured',messages:[]};
    try{
      const res=await fetch(base+'/v1/integrations/messages?target='+encodeURIComponent(app),{
        headers:{'Authorization':'Bearer '+token},credentials:'omit'
      });
      const data=res.ok?await res.json():null;
      const messages=normalizeList(data?.messages).filter(x=>validateEnvelope(x,app).ok);
      messages.forEach(x=>queue(app,'inbox',x));
      return {ok:res.ok,status:res.status,mode:'remote',messages};
    }catch(error){return {ok:false,status:0,mode:'remote',messages:[],error:String(error?.message||error)};}
  }

  function create(app){
    app=String(app||'');
    if(!app)throw new Error('app_required');

    function send(type,target,payload,meta){
      const env=makeEnvelope({
        type,source:app,target,payload,
        stackupUserId:meta?.stackupUserId||null,
        correlationId:meta?.correlationId||null,
        ttlSeconds:meta?.ttlSeconds
      });
      const verdict=validateEnvelope(env);
      if(!verdict.ok)throw new Error(verdict.errors.join(','));
      queue(app,'outbox',env);
      return env;
    }

    function consume(id){
      const env=list(app,'inbox').find(x=>x.id===String(id))||null;
      if(env)remove(app,'inbox',id);
      return env;
    }

    function openTarget(target,env,replace){
      const url=targetUrl(target,env);
      if(replace)global.location.href=url;
      else global.open(url,'_blank','noopener');
      return url;
    }

    function postToWindow(win,target,env){
      if(!win)return false;
      const origin=DEFAULT_ORIGINS[target];
      try{win.postMessage({stackupBridge:true,envelope:env},origin);return true;}catch(_){return false;}
    }

    global.addEventListener?.('message',event=>{
      const data=event?.data;
      if(!data?.stackupBridge||!data.envelope)return;
      const verdict=validateEnvelope(data.envelope,app);
      if(!verdict.ok)return;
      queue(app,'inbox',data.envelope);
      try{global.dispatchEvent(new CustomEvent('stackup:bridge',{detail:data.envelope}));}catch(_){}
    });

    const handoff=parseHandoff(app);
    if(handoff?.envelope){
      try{global.dispatchEvent(new CustomEvent('stackup:bridge',{detail:handoff.envelope}));}catch(_){}
    }

    return Object.freeze({
      app,version:VERSION,
      send,
      inbox:()=>list(app,'inbox'),
      outbox:()=>list(app,'outbox'),
      consume,
      removeOutbox:id=>remove(app,'outbox',id),
      openTarget,
      postToWindow,
      targetUrl,
      pullRemote:options=>remotePull(app,options),
      pushRemote:(env,options)=>remoteSend(env,options),
      validate:env=>validateEnvelope(env,app),
      handoff
    });
  }

  global.StackUpAppBridge=Object.freeze({VERSION,TYPES:Object.freeze([...TYPES]),create,makeEnvelope,validateEnvelope,targetUrl});
})(window);
