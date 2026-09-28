/* StackUp Hold'em Grinder — authentication boundary.
   Closed testing: Google only.
   Post-test providers stay disabled in config and can be enabled without rebuilding the login UI. */
(function(global){
  'use strict';

  const STATE={config:null,ready:false,initializing:false};
  const CONFIG_URL='config/auth.json';
  const GIS_URL='https://accounts.google.com/gsi/client';

  function runtime(){return global.StackUpGrinder||null;}
  function q(sel){return document.querySelector(sel);}
  function status(message,tone){
    const el=q('#googleAuthStatus');
    if(!el)return;
    el.textContent=message||'';
    el.dataset.tone=tone||'';
  }
  function locale(){
    const l=(document.documentElement.lang||'pt').toLowerCase();
    if(l.startsWith('pt'))return 'pt-BR';
    if(l.startsWith('es'))return 'es';
    return 'en';
  }
  function msg(key){
    const l=locale();
    const dict={
      'pt-BR':{
        configuring:'Configure o Google Client ID para ativar o login real.',
        loading:'Carregando login do Google…',
        failed:'Não foi possível entrar com Google.',
        expired:'A sessão do Google expirou. Tente novamente.'
      },
      en:{
        configuring:'Configure the Google Client ID to enable real sign-in.',
        loading:'Loading Google sign-in…',
        failed:'Could not sign in with Google.',
        expired:'The Google session expired. Please try again.'
      },
      es:{
        configuring:'Configura el Google Client ID para activar el acceso real.',
        loading:'Cargando acceso con Google…',
        failed:'No se pudo entrar con Google.',
        expired:'La sesión de Google venció. Inténtalo de nuevo.'
      }
    };
    return (dict[l]||dict.en)[key]||key;
  }
  async function loadConfig(){
    const res=await fetch(CONFIG_URL,{cache:'no-store',credentials:'same-origin'});
    if(!res.ok)throw new Error('auth_config_'+res.status);
    const cfg=await res.json();
    if(!cfg||cfg.policy!=='google_only')throw new Error('invalid_auth_policy');
    STATE.config=cfg;
    return cfg;
  }
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if(global.google&&global.google.accounts&&global.google.accounts.id)return resolve();
      const existing=document.querySelector('script[data-stackup-gis="1"]');
      if(existing){
        existing.addEventListener('load',()=>resolve(),{once:true});
        existing.addEventListener('error',()=>reject(new Error('gis_load_failed')),{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=src;s.async=true;s.defer=true;s.dataset.stackupGis='1';
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('gis_load_failed'));
      document.head.appendChild(s);
    });
  }
  function decodePayload(jwt){
    try{
      const part=String(jwt||'').split('.')[1];
      if(!part)return null;
      const b64=part.replace(/-/g,'+').replace(/_/g,'/');
      const pad=b64+'='.repeat((4-b64.length%4)%4);
      const raw=atob(pad);
      const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(_){return null;}
  }
  function validClientPayload(payload,clientId){
    if(!payload||!payload.sub)return false;
    const iss=payload.iss==='https://accounts.google.com'||payload.iss==='accounts.google.com';
    const aud=Array.isArray(payload.aud)?payload.aud.includes(clientId):payload.aud===clientId;
    const exp=Number(payload.exp||0)*1000>Date.now()-30000;
    return iss&&aud&&exp;
  }
  async function establishSession(credential,payload){
    const cfg=STATE.config.providers.google;
    const core=runtime();

    if(cfg.verification_mode==='backend_exchange'){
      if(!core)throw new Error('runtime_missing');
      const out=await core.api.request(cfg.exchange_path||'/v1/auth/google',{
        method:'POST',
        body:{credential},
        retry:false
      });
      if(!out.ok||!out.data)throw new Error('google_exchange_failed');
      const user=out.data.user||{};
      core.identity.set({
        stackupId:out.data.stackup_id||user.stackup_id||null,
        token:out.data.token||null,
        authProvider:'google',
        providerSubject:payload.sub,
        email:user.email||payload.email||null,
        displayName:user.name||payload.name||null,
        picture:user.picture||payload.picture||null,
        verifiedAt:new Date().toISOString()
      });
      return;
    }

    // Temporary closed-test mode: Google verifies the credential delivery in-browser.
    // No paid entitlements or server authorization may depend on this local snapshot.
    if(core){
      core.identity.set({
        authProvider:'google',
        providerSubject:payload.sub,
        email:payload.email||null,
        displayName:payload.name||null,
        picture:payload.picture||null,
        verifiedAt:new Date().toISOString(),
        token:null
      });
    }
  }
  function enterApp(){
    const app=document.getElementById('app2');
    if(app&&typeof app.grinderEnter==='function'){
      app.grinderEnter();
      return;
    }
    const login=document.querySelector('main.screen');
    if(!app)return;
    app.hidden=false;
    app.removeAttribute('hidden');
    if(login){login.inert=true;login.style.display='none';}
  }
  async function onCredential(response){
    try{
      const credential=response&&response.credential;
      const cfg=STATE.config.providers.google;
      const payload=decodePayload(credential);
      if(!validClientPayload(payload,cfg.client_id)){
        status(msg('expired'),'error');
        runtime()?.analytics?.track('auth_failed',{provider:'google',reason:'invalid_client_payload'});
        return;
      }
      await establishSession(credential,payload);
      runtime()?.analytics?.track('auth_succeeded',{provider:'google',mode:cfg.verification_mode});
      runtime()?.analytics?.track('app_open',{entry_method:'google'});
      global.dispatchEvent(new CustomEvent('stackup:auth:success',{detail:{provider:'google'}}));
      status('');
      enterApp();
    }catch(error){
      status(msg('failed'),'error');
      runtime()?.analytics?.track('auth_failed',{provider:'google',reason:String(error&&error.message||'unknown')});
    }
  }
  function renderPlaceholder(){
    const mount=q('#googleSignInMount');
    if(!mount)return;
    mount.innerHTML='';
    const b=document.createElement('button');
    b.type='button';
    b.className='google-config-required';
    b.disabled=true;
    b.textContent='GOOGLE';
    mount.appendChild(b);
    status(msg('configuring'),'warning');
  }
  function renderGoogle(){
    const mount=q('#googleSignInMount');
    if(!mount||!global.google?.accounts?.id)return;
    mount.innerHTML='';
    const cfg=STATE.config.providers.google;
    global.google.accounts.id.initialize({
      client_id:cfg.client_id,
      callback:onCredential,
      auto_select:Boolean(cfg.auto_select)
    });
    const width=Math.max(220,Math.min(380,Math.floor(mount.getBoundingClientRect().width||360)));
    global.google.accounts.id.renderButton(mount,{
      type:'standard',
      theme:'filled_black',
      size:'large',
      text:'signin_with',
      shape:'rectangular',
      logo_alignment:'left',
      width,
      locale:locale()
    });
    status('');
  }
  async function init(){
    if(STATE.initializing)return;
    STATE.initializing=true;
    try{
      status(msg('loading'),'');
      const cfg=await loadConfig();
      const google=cfg.providers&&cfg.providers.google;
      if(!google||!google.enabled)throw new Error('google_disabled');
      if(!google.client_id){
        renderPlaceholder();
        return;
      }
      await loadScript(GIS_URL);
      renderGoogle();
      STATE.ready=true;
      const observer=new MutationObserver(()=>{
        if(STATE.ready)renderGoogle();
      });
      observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
      global.addEventListener('resize',()=>{if(STATE.ready)renderGoogle();},{passive:true});
    }catch(error){
      status(msg('failed'),'error');
      runtime()?.analytics?.track('auth_failed',{provider:'google',reason:String(error&&error.message||'init_failed')});
    }finally{
      STATE.initializing=false;
    }
  }

  global.StackUpAuth=Object.freeze({
    init,
    state:STATE,
    config:()=>STATE.config,
    enterApp
  });
})(window);
