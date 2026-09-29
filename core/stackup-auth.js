/* StackUp Hold'em Grinder — authentication boundary.
   Development: direct entry by config.
   Closed testing: Google only.
   Post-test providers stay disabled until explicitly enabled. */
(function(global){
  'use strict';

  const STATE={config:null,ready:false,initializing:false,client:null,bound:false};
  const CONFIG_URL='config/auth.json';
  const GIS_URL='https://accounts.google.com/gsi/client';
  const USERINFO_URL='https://openidconnect.googleapis.com/v1/userinfo';

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
        failed:'Não foi possível entrar com Google.'
      },
      en:{
        configuring:'Configure the Google Client ID to enable real sign-in.',
        loading:'Loading Google sign-in…',
        failed:'Could not sign in with Google.'
      },
      es:{
        configuring:'Configura el Google Client ID para activar el acceso real.',
        loading:'Cargando acceso con Google…',
        failed:'No se pudo entrar con Google.'
      }
    };
    return (dict[l]||dict.en)[key]||key;
  }
  async function loadConfig(){
    const res=await fetch(CONFIG_URL,{cache:'no-store',credentials:'same-origin'});
    if(!res.ok)throw new Error('auth_config_'+res.status);
    const cfg=await res.json();
    if(!cfg||!cfg.environment||!cfg.policy)throw new Error('invalid_auth_config');
    STATE.config=cfg;
    return cfg;
  }
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if(global.google&&global.google.accounts&&global.google.accounts.oauth2)return resolve();
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
  async function fetchUser(accessToken){
    const res=await fetch(USERINFO_URL,{
      method:'GET',
      headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
      credentials:'omit'
    });
    if(!res.ok)throw new Error('google_userinfo_'+res.status);
    const user=await res.json();
    if(!user||!user.sub)throw new Error('google_userinfo_invalid');
    return user;
  }
  async function establishSession(accessToken,user){
    const cfg=STATE.config.providers.google;
    const core=runtime();

    if(cfg.verification_mode==='backend_exchange'){
      if(!core)throw new Error('runtime_missing');
      const out=await core.api.request(cfg.exchange_path||'/v1/auth/google',{
        method:'POST',
        body:{access_token:accessToken},
        retry:false
      });
      if(!out.ok||!out.data)throw new Error('google_exchange_failed');
      const remote=out.data.user||{};
      core.identity.set({
        stackupId:out.data.stackup_id||remote.stackup_id||null,
        token:out.data.token||null,
        authProvider:'google',
        providerSubject:user.sub,
        email:remote.email||user.email||null,
        displayName:remote.name||user.name||null,
        picture:remote.picture||user.picture||null,
        verifiedAt:new Date().toISOString()
      });
      return;
    }

    if(core){
      core.identity.set({
        authProvider:'google',
        providerSubject:user.sub,
        email:user.email||null,
        displayName:user.name||null,
        picture:user.picture||null,
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
  async function onToken(response){
    const card=q('#googleLoginCard');
    try{
      if(response&&response.error)throw new Error(response.error);
      const accessToken=response&&response.access_token;
      if(!accessToken)throw new Error('missing_access_token');
      const user=await fetchUser(accessToken);
      await establishSession(accessToken,user);
      runtime()?.analytics?.track('auth_succeeded',{provider:'google',mode:STATE.config.providers.google.verification_mode});
      runtime()?.analytics?.track('app_open',{entry_method:'google'});
      global.dispatchEvent(new CustomEvent('stackup:auth:success',{detail:{provider:'google'}}));
      status('');
      enterApp();
    }catch(error){
      status(msg('failed'),'error');
      runtime()?.analytics?.track('auth_failed',{provider:'google',reason:String(error&&error.message||'unknown')});
    }finally{
      if(card)card.classList.remove('on');
    }
  }
  function configureCard(enabled){
    const card=q('#googleLoginCard');
    if(!card)return;
    card.disabled=!enabled;
    card.setAttribute('aria-disabled',enabled?'false':'true');
    if(!enabled)card.classList.add('login-disabled');
    else card.classList.remove('login-disabled');
  }
  function bindGoogleCard(){
    const card=q('#googleLoginCard');
    if(!card||STATE.bound)return;
    STATE.bound=true;
    card.addEventListener('click',()=>{
      if(!STATE.ready||!STATE.client)return;
      card.classList.add('on');
      status(msg('loading'),'');
      runtime()?.analytics?.track('auth_started',{provider:'google'});
      STATE.client.requestAccessToken({prompt:'select_account'});
    });
  }
  async function init(){
    if(STATE.initializing)return;
    STATE.initializing=true;
    try{
      configureCard(false);
      const cfg=await loadConfig();
      if(cfg.require_auth===false||cfg.policy==='development_bypass'){
        status('');
        runtime()?.analytics?.track('app_open',{entry_method:'development_bypass'});
        global.dispatchEvent(new CustomEvent('stackup:auth:bypass',{detail:{environment:cfg.environment}}));
        enterApp();
        return;
      }
      status(msg('loading'),'');
      const google=cfg.providers&&cfg.providers.google;
      if(!google||!google.enabled)throw new Error('google_disabled');
      if(!google.client_id){
        status(msg('configuring'),'warning');
        return;
      }
      await loadScript(GIS_URL);
      if(!global.google?.accounts?.oauth2)throw new Error('gis_oauth_unavailable');
      STATE.client=global.google.accounts.oauth2.initTokenClient({
        client_id:google.client_id,
        scope:'openid email profile',
        callback:onToken,
        error_callback:()=>onToken({error:'google_popup_error'})
      });
      bindGoogleCard();
      STATE.ready=true;
      configureCard(true);
      status('');
    }catch(error){
      configureCard(false);
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
