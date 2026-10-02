/* StackUp Cross-App Bridge v1.1 — same-origin first.
   HEROES <-> GRINDER shared transport for StackUp apps living under the same origin.
   Browser transport is convenience only; production authorization remains StackUp ID/server-side. */
(function(global){
  'use strict';

  const VERSION='1.1';
  const PREFIX='stackup.ecosystem.v1';
  const CHANNEL_NAME='stackup-holdem-ecosystem-v1';
  const DEFAULT_ORIGIN='https://skyarecom.github.io';
  const PATHS=Object.assign({
    heroes:'/stackup.holdem-heroes/',
    grinder:'/stackup.holdem-grinder.evo/'
  },global.STACKUP_APP_PATHS||{});
  const TYPES=new Set([
    'player_profile',
    'training_prescription',
    'training_progress',
    'training_completed',
    'ack',
    'capabilities'
  ]);

  function uid(){
    try{if(global.crypto?.randomUUID)return global.crypto.randomUUID();}catch(_){}
    return 'msg-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  function read(key,fallback){
    try{const v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v);}catch(_){return fallback;}
  }
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
  function now(){return new Date().toISOString();}
  function box(app,kind){return PREFIX+'.'+String(app)+'.'+kind;}
  function cleanList(v){return Array.isArray(v)?v.filter(Boolean):[];}
  function unique(items){const seen=new Set();return items.filter(x=>x?.id&&!seen.has(x.id)&&seen.add(x.id));}
  function sharedIdentity(){
    const key=PREFIX+'.identity';
    let value=read(key,null);
    if(!value||typeof value!=='object'){
      value={mode:'device-preview',deviceId:uid(),stackupUserId:null,updatedAt:now()};
      write(key,value);
    }
    return value;
  }
  function setSharedIdentity(input){
    const prev=sharedIdentity();
    const next={
      mode:String(input?.mode||prev.mode||'device-preview'),
      deviceId:String(input?.deviceId||prev.deviceId||uid()),
      stackupUserId:input?.stackupUserId?String(input.stackupUserId):null,
      emailHint:input?.emailHint?String(input.emailHint):prev.emailHint||null,
      updatedAt:now()
    };
    write(PREFIX+'.identity',next);
    return next;
  }
  function makeEnvelope(input){
    const createdAt=input?.createdAt||now();
    const ttl=Math.max(60,Number(input?.ttlSeconds)||604800);
    const identity=sharedIdentity();
    return {
      protocol:'stackup-cross-app',
      version:VERSION,
      id:String(input?.id||uid()),
      type:String(input?.type||''),
      source:String(input?.source||''),
      target:String(input?.target||''),
      stackupUserId:input?.stackupUserId?String(input.stackupUserId):(identity.stackupUserId||null),
      deviceId:identity.deviceId||null,
      createdAt,
      expiresAt:new Date(Date.parse(createdAt)+ttl*1000).toISOString(),
      correlationId:input?.correlationId?String(input.correlationId):null,
      payload:input?.payload&&typeof input.payload==='object'?input.payload:{}
    };
  }
  function validate(env,target){
    const errors=[];
    if(!env||typeof env!=='object')errors.push('invalid_envelope');
    if(env?.protocol!=='stackup-cross-app')errors.push('invalid_protocol');
    if(String(env?.version||'').split('.')[0]!==VERSION.split('.')[0])errors.push('unsupported_version');
    if(!TYPES.has(String(env?.type||'')))errors.push('unsupported_type');
    if(!env?.id||!env?.source||!env?.target)errors.push('missing_routing');
    if(target&&env?.target!==target&&env?.target!=='*')errors.push('wrong_target');
    if(env?.expiresAt&&Date.parse(env.expiresAt)<Date.now())errors.push('expired');
    return {ok:!errors.length,errors};
  }
  function list(app,kind){
    const items=cleanList(read(box(app,kind),[]));
    const live=items.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>=Date.now());
    if(live.length!==items.length)write(box(app,kind),live);
    return live;
  }
  function put(app,kind,env){
    const items=list(app,kind);
    write(box(app,kind),unique([env,...items]).slice(0,300));
    return env;
  }
  function remove(app,kind,id){
    write(box(app,kind),list(app,kind).filter(x=>x.id!==String(id)));
  }
  function encode(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(value){
    const v=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=v+'='.repeat((4-v.length%4)%4);
    const bin=atob(padded),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function handoffUrl(target,env){
    if(!PATHS[target])throw new Error('unknown_target');
    const origin=global.location?.origin&&global.location.origin!=='null'?global.location.origin:DEFAULT_ORIGIN;
    return origin+PATHS[target]+'#stackup='+encodeURIComponent(encode(env));
  }
  function parseHandoff(app){
    try{
      const m=String(global.location?.hash||'').match(/(?:^#|[&#])stackup=([^&]+)/);
      if(!m)return null;
      const env=decode(decodeURIComponent(m[1]));
      const verdict=validate(env,app);
      if(!verdict.ok)return {error:verdict.errors};
      put(app,'inbox',env);
      try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}
      return {envelope:env};
    }catch(error){return {error:[String(error?.message||error)]};}
  }

  let channel=null;
  try{if('BroadcastChannel' in global)channel=new BroadcastChannel(CHANNEL_NAME);}catch(_){}

  function create(app){
    app=String(app||'');
    if(!app)throw new Error('app_required');
    const listeners=new Set();

    function notify(env){
      listeners.forEach(fn=>{try{fn(env);}catch(_){ }});
      try{global.dispatchEvent(new CustomEvent('stackup:bridge',{detail:env}));}catch(_){}
    }
    function receive(env){
      const verdict=validate(env,app);
      if(!verdict.ok)return false;
      put(app,'inbox',env);
      notify(env);
      return true;
    }

    if(channel){
      channel.addEventListener('message',event=>{
        const env=event?.data?.envelope;
        if(env)receive(env);
      });
    }
    global.addEventListener?.('storage',event=>{
      if(event.key!==box(app,'inbox')||!event.newValue)return;
      try{
        const items=JSON.parse(event.newValue);
        const env=Array.isArray(items)?items[0]:null;
        if(env&&validate(env,app).ok)notify(env);
      }catch(_){}
    });
    global.addEventListener?.('message',event=>{
      const env=event?.data?.stackupBridge?event.data.envelope:null;
      if(env)receive(env);
    });

    const handoff=parseHandoff(app);
    if(handoff?.envelope)notify(handoff.envelope);

    function send(type,target,payload,meta){
      const env=makeEnvelope({
        type,source:app,target,payload,
        stackupUserId:meta?.stackupUserId||null,
        correlationId:meta?.correlationId||null,
        ttlSeconds:meta?.ttlSeconds
      });
      const verdict=validate(env);
      if(!verdict.ok)throw new Error(verdict.errors.join(','));
      put(app,'outbox',env);
      // Same-origin direct delivery. Different path still shares localStorage.
      put(target,'inbox',env);
      try{channel?.postMessage({envelope:env});}catch(_){}
      return env;
    }
    function acknowledge(env,status,details){
      if(!env?.source)return null;
      return send('ack',env.source,{messageId:env.id,status:status||'received',details:details||null},{correlationId:env.correlationId||env.id});
    }
    function consume(id){
      const env=list(app,'inbox').find(x=>x.id===String(id))||null;
      if(env)remove(app,'inbox',id);
      return env;
    }
    function onMessage(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
    function openTarget(target,env,replace){
      const url=handoffUrl(target,env);
      if(replace)global.location.href=url;else global.open(url,'_blank','noopener');
      return url;
    }
    function status(){
      const identity=sharedIdentity();
      return {
        app,version:VERSION,
        sameOrigin:!!(global.location?.origin&&global.location.origin!=='null'),
        origin:global.location?.origin||null,
        broadcast:!!channel,
        identity,
        inbox:list(app,'inbox').length,
        outbox:list(app,'outbox').length
      };
    }

    return Object.freeze({
      app,version:VERSION,
      send,acknowledge,consume,onMessage,
      inbox:()=>list(app,'inbox'),
      outbox:()=>list(app,'outbox'),
      removeOutbox:id=>remove(app,'outbox',id),
      openTarget,handoffUrl,status,
      identity:sharedIdentity,
      setIdentity:setSharedIdentity,
      validate:env=>validate(env,app),
      handoff
    });
  }

  global.StackUpAppBridge=Object.freeze({
    VERSION,CHANNEL_NAME,
    TYPES:Object.freeze([...TYPES]),
    PATHS:Object.freeze({...PATHS}),
    create,makeEnvelope,validate,
    identity:sharedIdentity,setIdentity:setSharedIdentity
  });
})(window);
