/* StackUp Grinder — consolidated UI spacing/button system.
   Mounted inside the app shadow root. Does not alter solver/table geometry. */
(function(global){
  'use strict';
  const ID='stackup-ui-system-v1';
  const CSS=`
    :host{
      --su-space-1:4px;
      --su-space-2:8px;
      --su-space-3:12px;
      --su-space-4:16px;
      --su-space-5:24px;
      --su-button-h:40px;
      --su-button-r:12px;
      --su-card-r:16px;
      --su-card-pad:12px;
      --su-danger:#d86a6a;
      --su-danger-bg:rgba(216,106,106,.12);
      --su-danger-border:1px solid rgba(216,106,106,.48);
    }

    /* Vertical rhythm: page groups -> cards -> elements. */
    .historypanel,.reportspanel,.statspanel,.personalpanel,.coachprofile,.performancepanel,.spotsupport{
      gap:var(--su-space-4)!important;
      padding-bottom:var(--su-space-4)!important;
    }
    .historylist,.reportslist,.personallist,.perftraininglist,.perfswotlist,.perfsectionlist,.perfrecent,
    .statsview,.statslist,.statsbarlist{
      gap:var(--su-space-3)!important;
    }

    /* Functional cards only. */
    .historyitem,.historydetail,.reportitem,.reportdetail,.reportsbatch,.reportshead,
    .statscard,.statskpi,.statshero,.statscallout,
    .personalhero,.personalcard,.coachcard,
    .perfcard,.perfduel,.perfrank,.perfswotblock,.perfswotitem,.perftraining{
      border-radius:var(--su-card-r)!important;
    }
    .historyitem,.historydetail,.reportitem,.reportdetail,.reportsbatch,.reportshead,
    .statscard,.statscallout,.personalhero,.personalcard,.coachcard,
    .perfcard,.perfduel,.perfrank,.perfswotblock,.perftraining{
      padding:var(--su-card-pad)!important;
    }

    /* One interaction language for analytical screens. */
    .historysort button,.historyactions button,
    .reportsselectrow button,.reportsactions button,.reportsections button,.reportitemactions button,
    .statsnav button,.statscontact button,.statsbtn,
    .personaltabs button,.personalactions button,.coachtoggle,.coachsave,
    .perftraining button,.internalnav button,.dataaction{
      min-height:var(--su-button-h)!important;
      height:auto!important;
      border-radius:var(--su-button-r)!important;
      padding:0 var(--su-space-3)!important;
      background:rgba(255,255,255,.045)!important;
      border:1px solid rgba(255,255,255,.16)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.07)!important;
      color:var(--c-text)!important;
      font-family:var(--f-ui)!important;
      font-size:12px!important;
      letter-spacing:.45px!important;
    }
    .historysort button.on,.historyactions button.on,
    .reportsselectrow button.on,.reportsactions button.on,.reportsections button.on,.reportitemactions button.on,
    .statsnav button.on,.statscontact button.on,.statsbtn.primary,
    .personaltabs button.on,.personalactions button.primary,.coachtoggle.on,.coachsave,
    .perftraining button,.internalnav button:active{
      background:var(--on-bg)!important;
      border:var(--on-border)!important;
      color:var(--c-accent-text)!important;
      box-shadow:var(--on-glow)!important;
    }
    .dataaction.danger,.historyactions button[data-history-action="delete"],
    .reportsactions button[data-report-action="delete"],.reportitemactions button[data-report-action="delete"]{
      color:var(--su-danger)!important;
      background:var(--su-danger-bg)!important;
      border:var(--su-danger-border)!important;
      box-shadow:none!important;
    }

    /* Grid rhythm. */
    .historysort,.historyactions,.reportsselectrow,.reportsactions,.reportsections,.reportitemactions,
    .personaltabs,.personalactions,.coachgrid,.perftrainingmeta,.internalnav{
      gap:var(--su-space-2)!important;
    }
    .statsgrid,.perfstats,.perfdifficulty,.personalstats{
      gap:var(--su-space-2)!important;
    }

    /* Headings and body reading hierarchy. */
    .statshead,.perftitle,.personalcardtitle b,.coachcard>b,.reportshead b,.historyitem b{
      color:#fff!important;
    }
    .statscallout p,.statsdetail p,.perfswotitem p,.perfswotitem small,.perftraining small,
    .personalreason,.historyitem small,.historydetail p,.reportitem small,.coachstatus{
      color:var(--c-muted)!important;
      line-height:1.5!important;
    }

    /* Disclosure blocks: dense detail is closed until the user asks for it. */
    details.sudisclosure{
      border:0!important;
      background:transparent!important;
    }
    details.sudisclosure>summary{
      list-style:none;
      min-height:40px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      cursor:pointer;
      padding:0 4px;
      color:#fff;
      font-family:var(--f-ui);
      font-size:12px;
      letter-spacing:.65px;
    }
    details.sudisclosure>summary::-webkit-details-marker{display:none}
    details.sudisclosure>summary::after{content:'＋';color:var(--c-accent-text);font-size:16px}
    details.sudisclosure[open]>summary::after{content:'−'}
    details.sudisclosure>.sudisclosurebody{display:flex;flex-direction:column;gap:var(--su-space-2);padding-top:var(--su-space-2)}

    /* Data management. */
    .datamanager{display:flex;flex-direction:column;gap:var(--su-space-3)}
    .datamanagerintro{color:var(--c-muted);font-family:var(--f-ui);font-size:12px;line-height:1.5}
    .datamanagergrid{display:grid;grid-template-columns:1fr;gap:var(--su-space-2)}
    .dataconfirm{padding:var(--su-space-3);border-radius:var(--su-button-r);background:var(--su-danger-bg);border:var(--su-danger-border);color:var(--c-muted);font-family:var(--f-ui);font-size:12px;line-height:1.45}

    /* Reports: actions only appear inside the active mode. */
    .reportcompactactions{display:grid;grid-template-columns:1fr 1fr;gap:var(--su-space-2);margin-top:var(--su-space-2)}
    .reportsharepanel{display:grid;grid-template-columns:1fr 1fr;gap:var(--su-space-2);margin-top:var(--su-space-2)}

    /* Keep the screen background free of decorative outer frames. */
    .historypanel,.reportspanel,.statspanel,.personalpanel,.coachprofile,.performancepanel,
    .historylist,.reportslist,.personallist,.perfswotlist,.perftraininglist,.statsview{
      border:0!important;background:transparent!important;box-shadow:none!important;
    }
  `;

  function mount(root){
    if(!root||root.getElementById?.(ID))return;
    const style=document.createElement('style');
    style.id=ID;
    style.textContent=CSS;
    root.appendChild(style);
  }
  global.StackUpUISystem=Object.freeze({mount,CSS});
})(window);
