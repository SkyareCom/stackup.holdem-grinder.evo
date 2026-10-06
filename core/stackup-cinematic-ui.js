/* GRINDER.EVO — Cinematic Premium UI
   Visual-only layer. Does not alter solver/filter/training logic. */
(function(){
'use strict';
const CSS=`
:host{
 --cine-bg:#030507;--cine-panel:rgba(9,12,15,.78);--cine-panel2:rgba(15,18,21,.72);
 --cine-gold:#d6ae63;--cine-gold2:#8f6b32;--cine-text:#f4efe4;--cine-muted:#918b80;
 --cine-line:rgba(214,174,99,.34);--cine-glow:0 0 24px rgba(214,174,99,.12);
 --cine-green:#75d6a1;--cine-red:#dc6c67;
}
.screen{
 background:
 radial-gradient(circle at 50% -8%,rgba(214,174,99,.10),transparent 30%),
 radial-gradient(circle at 115% 42%,rgba(70,95,110,.10),transparent 32%),
 linear-gradient(180deg,#080a0c 0%,#020304 46%,#060708 100%)!important;
 color:var(--cine-text)!important;
 isolation:isolate;
}
.screen:before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.36;
 background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);
 background-size:22px 22px}
.screen:after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
 background:radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,.62) 100%)}
.cardsbox{opacity:.12!important;mix-blend-mode:screen}
.header{z-index:3!important;padding-top:calc(env(safe-area-inset-top) + 12px)!important}
.brandrow{justify-content:flex-start!important;border-bottom:1px solid var(--cine-line);padding:0 0 10px;position:relative}
.brandrow:after{content:"SYSTEM // ONLINE";position:absolute;right:0;bottom:-5px;padding-left:8px;background:#050607;color:var(--cine-gold);font-size:7px;letter-spacing:1.6px}
.brandrow img{width:42px!important;height:42px!important;filter:drop-shadow(0 0 10px rgba(214,174,99,.25))!important}
.brandtxt .brand{font-family:Arial,sans-serif!important;font-size:9px!important;letter-spacing:3px!important;color:var(--cine-muted)!important}
.brandtxt .title{font-family:Arial,sans-serif!important;font-size:24px!important;font-weight:700!important;letter-spacing:2.2px!important;color:var(--cine-text)!important;-webkit-text-stroke:0!important}
.navbtns{margin-top:2px}
.hbtn{height:40px!important;border-radius:3px!important;background:linear-gradient(180deg,rgba(20,23,26,.82),rgba(7,9,11,.92))!important;border:1px solid var(--cine-line)!important;color:var(--cine-muted)!important;letter-spacing:1.4px!important;box-shadow:inset 0 1px rgba(255,255,255,.03),var(--cine-glow)!important}
.hbtn.on{color:#0a0b0c!important;background:linear-gradient(180deg,#e4c781,#b98a42)!important;border-color:#f1d99e!important;box-shadow:0 0 18px rgba(214,174,99,.25)!important}
.content{z-index:2!important;padding-left:16px!important;padding-right:16px!important}
.slot{border:1px solid var(--cine-line)!important;border-radius:4px!important;background:linear-gradient(145deg,rgba(14,17,20,.76),rgba(5,7,9,.86))!important;box-shadow:inset 0 1px rgba(255,255,255,.03),var(--cine-glow)!important;position:relative}
.slot:before,.tsec:before{content:"";position:absolute;left:-1px;top:-1px;width:16px;height:16px;border-left:2px solid var(--cine-gold);border-top:2px solid var(--cine-gold);pointer-events:none}
.slot b{color:var(--cine-text)!important;letter-spacing:1.8px!important}.slot small{color:var(--cine-muted)!important}
.trainwrap{gap:8px!important}
.tsec{position:relative!important}
.stitle{font-family:Arial,sans-serif!important;color:var(--cine-gold)!important;font-size:9px!important;letter-spacing:2px!important;padding:7px 3px!important;text-transform:uppercase}
.thead{border-radius:3px!important;background:linear-gradient(180deg,rgba(20,23,26,.88),rgba(6,8,10,.94))!important;border:1px solid var(--cine-line)!important;box-shadow:inset 0 1px rgba(255,255,255,.03)!important}
.tsec.open .thead{background:linear-gradient(180deg,rgba(35,29,18,.92),rgba(11,10,8,.96))!important;color:var(--cine-text)!important;border-color:rgba(214,174,99,.58)!important}
.tsec.open .thead b{color:var(--cine-text)!important}.tsec.open .thead small{color:var(--cine-gold)!important}
.glabel,.tnote{font-family:Arial,sans-serif!important;color:var(--cine-muted)!important;letter-spacing:1.5px!important}
.tower,.tower[data-o],.chip{border-radius:3px!important;background:linear-gradient(145deg,rgba(19,22,25,.88),rgba(7,9,11,.94))!important;border:1px solid rgba(214,174,99,.25)!important;color:var(--cine-text)!important;box-shadow:inset 0 1px rgba(255,255,255,.025)!important;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease!important}
.tower svg,.tower b,.tower[data-o] svg,.tower[data-o] b{color:var(--cine-text)!important}
.tower small{color:var(--cine-muted)!important}
.tower.on,.tower[data-o].on,.chip.on{background:linear-gradient(145deg,rgba(72,55,28,.94),rgba(17,14,9,.98))!important;border-color:var(--cine-gold)!important;color:var(--cine-text)!important;box-shadow:inset 0 0 18px rgba(214,174,99,.08),0 0 15px rgba(214,174,99,.10)!important}
.tower.on svg,.tower.on b,.tower[data-o].on svg,.tower[data-o].on b{color:#f5d995!important}
.tower:not(:disabled):active,.chip:not(:disabled):active{transform:scale(.975)}
.tower.compat-off,.chip.compat-off,.tower.coverage-off,.chip.coverage-off{opacity:.18!important;filter:saturate(.2)!important}
.tstart{border-radius:3px!important;background:linear-gradient(180deg,#d7b46a,#9c7135)!important;border:1px solid #f0d595!important;color:#090909!important;font-family:Arial,sans-serif!important;font-weight:700!important;box-shadow:0 0 24px rgba(214,174,99,.16)!important}
.tstartbar{background:linear-gradient(180deg,transparent,#030405 42%)!important}
.tabbar{z-index:4!important;background:rgba(2,3,4,.92)!important;border-top:1px solid var(--cine-line)!important;backdrop-filter:blur(18px)!important;gap:1px!important}
.tab{border-radius:2px!important;color:#77736c!important;position:relative}
.tab svg{transition:transform .2s ease,filter .2s ease}
.tab.on{background:linear-gradient(180deg,rgba(214,174,99,.13),rgba(214,174,99,.025))!important;color:#f0d595!important;border-color:transparent!important}
.tab.on:before{content:"";position:absolute;left:20%;right:20%;top:-9px;height:1px;background:var(--cine-gold);box-shadow:0 0 10px var(--cine-gold)}
.tab.on svg{filter:drop-shadow(0 0 6px rgba(214,174,99,.4));transform:translateY(-1px)}
/* Poker table: cinematic command surface */
.tablewrap,.pokerwrap,.spotwrap{filter:drop-shadow(0 16px 30px rgba(0,0,0,.45))}
.ptable,.poker-table,.tablefelt{box-shadow:inset 0 0 55px rgba(0,0,0,.72),0 0 0 1px rgba(214,174,99,.28),0 0 35px rgba(214,174,99,.08)!important}
.seat .av{border-color:rgba(214,174,99,.32)!important;background:linear-gradient(180deg,#171a1d,#08090a)!important}
.seat.hero .av,.seat.hero.spot-turn .av{border-color:var(--cine-gold)!important;box-shadow:0 0 0 1px rgba(214,174,99,.35),0 0 22px rgba(214,174,99,.22)!important}
.spotactiontext,.heroturnnotice{border-radius:2px!important;border-color:var(--cine-line)!important;background:rgba(3,4,5,.88)!important}
.spotsetupcard{border-radius:4px!important;background:linear-gradient(145deg,rgba(14,17,20,.94),rgba(4,5,6,.98))!important;border:1px solid var(--cine-line)!important;box-shadow:0 20px 60px rgba(0,0,0,.6),var(--cine-glow)!important}
.spotsetupstart{border-radius:3px!important;background:linear-gradient(180deg,#d7b46a,#9c7135)!important;color:#080808!important;border:1px solid #f0d595!important}
/* HOME: cinematic command deck */
.homegrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;align-content:start!important;position:relative;padding-top:32px!important}
.homegrid:before{content:"TACTICAL TRAINING // COMMAND DECK";position:absolute;left:1px;top:5px;color:var(--cine-gold);font:8px Arial,sans-serif;letter-spacing:1.8px}
.homegrid:after{content:"SOLVER CORE ONLINE";position:absolute;right:1px;top:5px;color:var(--cine-muted);font:7px Arial,sans-serif;letter-spacing:1.2px}
.homegrid .tower{aspect-ratio:auto!important;min-height:104px!important;align-items:flex-start!important;text-align:left!important;justify-content:flex-end!important;padding:12px!important;position:relative;overflow:hidden}
.homegrid .tower:before{content:"";position:absolute;left:0;top:0;width:22px;height:22px;border-left:2px solid var(--cine-gold);border-top:2px solid var(--cine-gold);opacity:.8}
.homegrid .tower:after{content:"";position:absolute;right:9px;top:10px;width:22px;height:1px;background:var(--cine-line);box-shadow:0 5px 0 rgba(214,174,99,.12)}
.homegrid .tower svg{position:absolute;left:11px;top:12px;width:26px!important;height:26px!important;color:var(--cine-gold)!important;opacity:.9}
.homegrid .tower b{font-family:Arial,sans-serif!important;font-weight:700!important;font-size:11px!important;letter-spacing:1.2px!important;line-height:1.2!important}
.homegrid .tower:first-child{grid-column:1/-1!important;min-height:132px!important;background:radial-gradient(circle at 78% 28%,rgba(214,174,99,.14),transparent 34%),linear-gradient(145deg,rgba(24,23,19,.94),rgba(5,7,9,.98))!important;border-color:rgba(214,174,99,.55)!important}
.homegrid .tower:first-child b{font-size:15px!important;max-width:65%;line-height:1.1!important}
.homegrid .tower:first-child svg{width:34px!important;height:34px!important}
/* remove old concrete visual without touching DOM/assets */
.concrete{opacity:0!important}
.ptitle{align-self:flex-start!important;transform:none!important;margin:0 0 4px!important;padding:7px 10px!important;border-radius:2px!important;background:rgba(4,5,6,.74)!important;border:1px solid var(--cine-line)!important;color:var(--cine-gold)!important;font-family:Arial,sans-serif!important;font-size:9px!important;letter-spacing:2px!important}
/* mobile finishing and overflow guards */
.screen{max-width:430px!important}
.content{overscroll-behavior:contain;scrollbar-width:none}
.content::-webkit-scrollbar{display:none}
.tower,.chip,.statscard,.statshero,.spotanalysis,.spotfinal{min-width:0!important;max-width:100%!important}
.tower b,.tower small,.statscard *,.spotindicator *{overflow-wrap:anywhere}
@media(max-width:360px){
 .content{padding-left:11px!important;padding-right:11px!important}
 .header{padding-left:14px!important;padding-right:14px!important}
 .homegrid{gap:6px!important}
 .homegrid .tower{min-height:96px!important;padding:10px!important}
 .brandtxt .title{font-size:21px!important}
}
@media(min-width:431px){
 .screen{border-radius:18px!important;box-shadow:0 28px 90px rgba(0,0,0,.72),0 0 0 1px rgba(214,174,99,.20)!important}
}
/* Analysis: tactical debrief */
.spotfeedback,.spotanalysis,.spotfinal{border-radius:4px!important;background:linear-gradient(145deg,rgba(13,16,19,.94),rgba(4,5,6,.98))!important;border:1px solid var(--cine-line)!important;box-shadow:inset 0 1px rgba(255,255,255,.025),0 12px 30px rgba(0,0,0,.26)!important}
.spotanalysistitle,.spotfinaltitle{color:var(--cine-gold)!important;letter-spacing:1.8px!important;text-transform:uppercase}
.spotanalysissection{border-top:1px solid rgba(214,174,99,.18)!important}
.spotindicator{background:rgba(255,255,255,.025)!important;border-left:1px solid rgba(214,174,99,.35)!important}
.spotindicatorindex{color:var(--cine-gold)!important}
.spotindicatorheading{color:var(--cine-text)!important}
.spotindicatorlist{color:var(--cine-muted)!important}
.spotfinalsummary{color:var(--cine-text)!important}
.spotaction,.spotcontrol,.spotsavebutton{border-radius:3px!important;border:1px solid rgba(214,174,99,.30)!important;background:linear-gradient(180deg,rgba(20,23,26,.92),rgba(6,8,10,.98))!important;color:var(--cine-text)!important;box-shadow:inset 0 1px rgba(255,255,255,.03)!important;transition:transform .16s ease,border-color .16s ease,background .16s ease!important}
.spotaction:not(:disabled):active,.spotcontrol:not(:disabled):active,.spotsavebutton:not(:disabled):active{transform:scale(.97)}
.spotaction.solver-size{border-color:rgba(214,174,99,.52)!important;color:#f1d48f!important}
.spotaction.danger,.dataaction.danger{border-color:rgba(220,108,103,.48)!important;color:#ef9a95!important}
.spotactionrow.primary{position:relative}
.spotactionrow.primary:before{content:"DECISION MATRIX";position:absolute;left:2px;top:-12px;color:var(--cine-muted);font:7px Arial,sans-serif;letter-spacing:1.6px}
/* STATS: intelligence dashboard */
.statsview,.statsgrid,.statsadvancegrid,.statsevolutiongrid{gap:8px!important}
.statscard,.statshero,.statsadvancecard,.statsreportbanner,.statscallout,.statsmini,.statsplan,.statsdetail,.statspiebox{border-radius:4px!important;background:linear-gradient(145deg,rgba(14,17,20,.90),rgba(5,7,9,.96))!important;border:1px solid rgba(214,174,99,.24)!important;box-shadow:inset 0 1px rgba(255,255,255,.025),0 10px 24px rgba(0,0,0,.18)!important}
.statscard.premium,.statshero.premium{border-color:rgba(214,174,99,.50)!important;box-shadow:inset 0 1px rgba(255,255,255,.035),0 0 24px rgba(214,174,99,.07)!important}
.statshead,.statshero-title{color:var(--cine-gold)!important;letter-spacing:1.5px!important}
.statshero-sub,.statssectionnote,.statslegend,.statslist{color:var(--cine-muted)!important}
.statskpi,.statsevolutionkpi,.statsgrade,.statspievalue{color:var(--cine-text)!important;text-shadow:0 0 12px rgba(214,174,99,.10)}
.statsbar,.statstrackbar,.statsmeter,.statshero-meter{background:rgba(255,255,255,.06)!important;border-radius:1px!important;overflow:hidden}
.statsbar>*,.statstrackbar>*,.statsmeter>*,.statshero-meterline{background:linear-gradient(90deg,#7c5b2d,#e1bd70)!important;box-shadow:0 0 10px rgba(214,174,99,.22)!important}
.statsdelta{color:var(--cine-green)!important}.statsdelta.flat{color:var(--cine-muted)!important}
.statsbtn{border-radius:3px!important;border:1px solid var(--cine-line)!important;background:rgba(255,255,255,.035)!important;color:var(--cine-text)!important}
.statsbtn.primary{background:linear-gradient(180deg,#d7b46a,#9c7135)!important;color:#080808!important;border-color:#f0d595!important}
.statsnav{border-radius:3px!important;background:rgba(2,3,4,.78)!important;border:1px solid rgba(214,174,99,.20)!important}
/* cinematic continuity */
.page{animation:cinePageIn .28s cubic-bezier(.2,.8,.2,1)!important}
.tower.on,.chip.on,.tab.on,.spotaction:active,.statsbtn:active{animation:cineConfirm .20s ease-out}
.seat.spot-acting .av{box-shadow:0 0 0 1px rgba(214,174,99,.55),0 0 20px rgba(214,174,99,.28)!important}
.centerbox{filter:drop-shadow(0 0 14px rgba(214,174,99,.08))}
@keyframes cinePageIn{from{opacity:.25;transform:translateY(8px);filter:blur(2px)}to{opacity:1;transform:none;filter:none}}
@keyframes cineConfirm{0%{filter:brightness(1)}45%{filter:brightness(1.35)}100%{filter:brightness(1)}}
@keyframes cineBoot{from{opacity:0;transform:translateY(7px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
.content>*{animation:cineBoot .38s cubic-bezier(.2,.8,.2,1) both}
@media(prefers-reduced-motion:reduce){.content>*{animation:none!important}}
`;
function install(){
 const host=document.getElementById('app2');
 const root=host&&host.shadowRoot;
 if(!root)return false;
 if(root.getElementById('cinematicPremiumStyle'))return true;
 const style=document.createElement('style');style.id='cinematicPremiumStyle';style.textContent=CSS;root.appendChild(style);
 return true;
}
let n=0;const timer=setInterval(()=>{if(install()||++n>120)clearInterval(timer)},50);
window.addEventListener('load',install,{once:true});
})();