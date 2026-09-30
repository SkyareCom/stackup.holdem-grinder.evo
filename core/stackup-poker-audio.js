/* StackUp Hold'em Grinder EVO — original procedural poker audio cues.
   No third-party sound assets are copied or bundled. Web Audio is unlocked by user gesture. */
(function(global){
  'use strict';

  let ctx=null, master=null, unlocked=false;

  function audioContext(){
    if(ctx)return ctx;
    const Ctx=global.AudioContext||global.webkitAudioContext;
    if(!Ctx)return null;
    try{
      ctx=new Ctx();
      master=ctx.createGain();
      master.gain.value=.38;
      master.connect(ctx.destination);
      return ctx;
    }catch(_){ return null; }
  }

  function envelope(gain,at,attack,decay,peak){
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),at+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);
  }

  function tone(freq,delay=.0,duration=.08,volume=.16,type='sine'){
    const c=audioContext(); if(!c||!master)return;
    const at=c.currentTime+delay;
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,at);
    o.connect(g);g.connect(master);
    envelope(g,at,.004,Math.max(.025,duration),volume);
    o.start(at);o.stop(at+duration+.025);
  }

  function noise(delay=.0,duration=.06,volume=.11,highpass=700){
    const c=audioContext(); if(!c||!master)return;
    const len=Math.max(1,Math.floor(c.sampleRate*(duration+.03)));
    const b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const src=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();
    src.buffer=b;filter.type='highpass';filter.frequency.value=highpass;
    src.connect(filter);filter.connect(g);g.connect(master);
    const at=c.currentTime+delay;
    envelope(g,at,.002,duration,volume);
    src.start(at);src.stop(at+duration+.025);
  }

  function chip(delay=.0,volume=.12){
    tone(1480,delay,.038,volume,'triangle');
    tone(820,delay+.012,.045,volume*.55,'sine');
    noise(delay,.035,volume*.5,1250);
  }

  function tap(delay=.0){
    tone(165,delay,.045,.10,'sine');
    noise(delay,.025,.055,280);
  }

  function sweep(){
    const c=audioContext(); if(!c||!master)return;
    const at=c.currentTime,g=c.createGain(),o=c.createOscillator();
    o.type='triangle';o.frequency.setValueAtTime(420,at);o.frequency.exponentialRampToValueAtTime(145,at+.11);
    o.connect(g);g.connect(master);envelope(g,at,.004,.11,.075);o.start(at);o.stop(at+.14);
    noise(0,.105,.045,950);
  }

  function cue(kind){
    const k=String(kind||'').toLowerCase();
    if(k==='check'){
      tap(0);tap(.085);return;
    }
    if(k==='fold'){
      sweep();return;
    }
    if(k==='call'){
      chip(0,.10);chip(.055,.09);return;
    }
    if(k==='raise'||k==='bet'){
      chip(0,.10);chip(.045,.11);chip(.09,.095);chip(.135,.08);return;
    }
    if(k==='jam'||k==='allin'){
      tap(0);
      for(let i=0;i<7;i++)chip(.03+i*.032,.105-(i*.006));
      tone(105,.04,.18,.075,'sine');return;
    }
    if(k==='hero'||k==='turn'){
      tone(660,0,.075,.075,'sine');
      tone(880,.105,.095,.09,'sine');return;
    }
    chip(0,.08);
  }

  async function unlock(){
    const c=audioContext();
    if(!c)return false;
    try{
      if(c.state!=='running')await c.resume();
    }catch(_){}
    unlocked=c.state==='running';
    return unlocked;
  }

  function play(kind){
    const c=audioContext();
    if(!c)return false;
    const fire=()=>{
      if(c.state!=='running')return false;
      unlocked=true;
      cue(kind);
      return true;
    };
    if(fire())return true;
    try{
      const resumed=c.resume();
      if(resumed&&typeof resumed.then==='function'){
        resumed.then(()=>{fire();}).catch(()=>{});
      }
    }catch(_){}
    return false;
  }

  function setVolume(value){
    const v=Math.max(0,Math.min(1,Number(value)||0));
    if(master)master.gain.value=.38*v;
  }

  const gestureUnlock=()=>{unlock().catch(()=>{});};
  global.addEventListener?.('pointerdown',gestureUnlock,{capture:true});
  global.addEventListener?.('touchstart',gestureUnlock,{capture:true,passive:true});
  global.addEventListener?.('keydown',gestureUnlock,{capture:true});

  global.StackUpPokerAudio=Object.freeze({unlock,play,setVolume});
})(window);
