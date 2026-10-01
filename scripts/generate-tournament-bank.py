#!/usr/bin/env python3
"""
STACKUP HOLD'EM — Tournament Bank Generator V1

Builds solver-backed tournament push/fold spots under exact ICM utility.
AI may design candidate contexts elsewhere, but this generator alone certifies
strategy. It uses the pinned MIT preflop equity matrix from amaster97/poker_solver.

Each accepted archetype yields two independently trainable decisions:
  * SB: fold / all-in
  * BB: fold / call versus SB all-in

General-sum Bayesian regret matching is accepted only when measured unilateral
best-response gap (NashConv) is below MAX_NASHCONV. Unconverged archetypes are
quarantined and do not contribute to the 1,500-spot coverage floor.
"""

from __future__ import annotations
import json, math, os, sys
from functools import lru_cache
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"solver"/"tournament.json"
EQ_PATH=Path(os.environ.get("STACKUP_PREFLOP_EQUITY", ROOT/".stackup"/"preflop_equity_169x169.npz"))
ITERATIONS=max(2000,int(os.environ.get("STACKUP_ICM_ITERATIONS","8000")))
MAX_NASHCONV=float(os.environ.get("STACKUP_ICM_MAX_NASHCONV","0.0015"))
ALPHA=1.5; BETA=0.0; GAMMA=2.0

RANKS="AKQJT98765432"
SUITS="cdhs"

def hand_classes():
    pairs=[r+r for r in RANKS]
    suited=[]; offsuit=[]
    for i,a in enumerate(RANKS):
        for b in RANKS[i+1:]:
            suited.append(a+b+"s")
            offsuit.append(a+b+"o")
    out=pairs+suited+offsuit
    assert len(out)==169
    return out

HANDS=hand_classes()
HIDX={h:i for i,h in enumerate(HANDS)}

def combos(hand):
    a,b=hand[0],hand[1]
    if a==b:
        return [(a+SUITS[i],b+SUITS[j]) for i in range(4) for j in range(i+1,4)]
    suited=hand.endswith("s")
    out=[]
    for s1 in SUITS:
        for s2 in SUITS:
            if suited and s1!=s2: continue
            if not suited and s1==s2: continue
            out.append((a+s1,b+s2))
    return out

COMBOS=[combos(h) for h in HANDS]
COMBO_COUNT=np.array([len(x) for x in COMBOS],dtype=np.float64)

def compatibility():
    m=np.zeros((169,169),dtype=np.float64)
    for i,ca in enumerate(COMBOS):
        for j,cb in enumerate(COMBOS):
            n=0
            for a in ca:
                sa=set(a)
                for b in cb:
                    if not sa.intersection(b): n+=1
            m[i,j]=n
    return m

def load_equity():
    raw=np.load(EQ_PATH)["equity"]
    if raw.shape!=(169,169,3):
        raise RuntimeError(f"equity shape mismatch: {raw.shape}")
    with np.errstate(invalid="ignore"):
        e=np.nanmean(raw,axis=2)
    compat=compatibility()
    e=np.where(np.isfinite(e),e,0.5)
    # Enforce reciprocal symmetry to damp orientation noise.
    e=0.5*(e+(1.0-e.T))
    e=np.clip(e,0.0,1.0)
    e=np.where(compat>0,e,0.5)
    return e,compat

def icm_equities(stacks,payouts):
    stacks=tuple(max(0.0,float(x)) for x in stacks)
    n=len(stacks)
    payouts=tuple(float(payouts[i]) if i<len(payouts) else 0.0 for i in range(n))
    @lru_cache(maxsize=None)
    def rec(mask):
        if mask==0:return (0.0,)*n
        alive=[i for i in range(n) if mask&(1<<i)]
        place=n-len(alive)
        total=sum(stacks[i] for i in alive)
        out=[0.0]*n
        if total<=1e-15:
            probs={i:1/len(alive) for i in alive}
        else:
            probs={i:stacks[i]/total for i in alive}
        for i,p in probs.items():
            out[i]+=p*payouts[place]
            child=rec(mask&~(1<<i))
            for j in range(n):out[j]+=p*child[j]
        return tuple(out)
    return np.array(rec((1<<n)-1),dtype=np.float64)

def outcome_vectors(stacks,hero,villain):
    s=np.array(stacks,dtype=np.float64)
    hs=float(s[hero]); vs=float(s[villain])
    risk=min(hs,vs)

    # Hero folds SB: loses 0.5 BB to BB.
    fold=s.copy()
    x=min(0.5,fold[hero]); fold[hero]-=x; fold[villain]+=x

    # Hero jams, BB folds: Hero wins BB's 1 BB blind.
    jam_fold=s.copy()
    x=min(1.0,jam_fold[villain]); jam_fold[villain]-=x; jam_fold[hero]+=x

    # Called all-in, with unmatched excess returned.
    win=s.copy(); lose=s.copy(); tie=s.copy()
    win[hero]+=risk; win[villain]-=risk
    lose[hero]-=risk; lose[villain]+=risk
    return fold,jam_fold,win,lose,tie,risk

def utilities(stacks,payouts,hero,villain,equity):
    fold,jfold,win,lose,tie,risk=outcome_vectors(stacks,hero,villain)
    base=icm_equities(stacks,payouts)
    ef=icm_equities(fold,payouts)
    ejf=icm_equities(jfold,payouts)
    ew=icm_equities(win,payouts)
    el=icm_equities(lose,payouts)
    et=icm_equities(tie,payouts)

    hcall=equity*ew[hero]+(1-equity)*el[hero]
    vcall=equity*el[villain]+(1-equity)*ew[villain]
    return {
        "base":base,"fold":ef,"jam_fold":ejf,"win":ew,"lose":el,"tie":et,
        "hero_call":hcall,"villain_call":vcall,"risk":risk
    }

def rm_strategy(regret):
    pos=np.maximum(regret,0.0)
    sums=pos.sum(axis=1,keepdims=True)
    return np.where(sums>1e-18,pos/sums,0.5)

def solve_game(archetype,equity,compat):
    stacks=np.array(archetype["stacks"],dtype=np.float64)
    payouts=np.array(archetype["payouts"],dtype=np.float64)
    hero=len(stacks)-2; villain=len(stacks)-1
    u=utilities(stacks,payouts,hero,villain,equity)

    joint=compat.astype(np.float64)
    joint/=joint.sum()
    ph=joint.sum(axis=1); pv=joint.sum(axis=0)
    pv_h=np.divide(joint,ph[:,None],out=np.zeros_like(joint),where=ph[:,None]>0)
    ph_v=np.divide(joint,pv[None,:],out=np.zeros_like(joint),where=pv[None,:]>0)

    hr=np.zeros((169,2)); vr=np.zeros((169,2))
    hs=np.zeros((169,2)); vs=np.zeros((169,2))

    for t in range(1,ITERATIONS+1):
        hst=rm_strategy(hr); vst=rm_strategy(vr)
        vf=vst[:,0]; vc=vst[:,1]

        jam=(pv_h*vf[None,:]*u["jam_fold"][hero]).sum(axis=1)
        jam+=(pv_h*vc[None,:]*u["hero_call"]).sum(axis=1)
        hvals=np.stack([np.full(169,u["fold"][hero]),jam],axis=1)
        hnode=(hst*hvals).sum(axis=1)

        hjam=hst[:,1]
        reach=ph_v*hjam[:,None]
        pjam=reach.sum(axis=0)
        cond=np.divide(reach,pjam[None,:],out=np.zeros_like(reach),where=pjam[None,:]>0)
        call=(cond*u["villain_call"]).sum(axis=0)
        vvals=np.stack([np.full(169,u["jam_fold"][villain]),call],axis=1)
        vnode=(vst*vvals).sum(axis=1)

        ta=float(t)**ALPHA; tb=float(t)**BETA
        ps=ta/(ta+1.0); ns=tb/(tb+1.0); ss=(t/(t+1.0))**GAMMA
        hr[:]=np.where(hr>0,hr*ps,np.where(hr<0,hr*ns,hr))
        vr[:]=np.where(vr>0,vr*ps,np.where(vr<0,vr*ns,vr))
        hs*=ss; vs*=ss

        hr+=ph[:,None]*(hvals-hnode[:,None])
        vr+=pjam[:,None]*(vvals-vnode[:,None])
        hs+=ph[:,None]*hst
        vs+=pv[:,None]*vst

    def avg(x):
        s=x.sum(axis=1,keepdims=True)
        return np.where(s>1e-18,x/s,0.5)
    ha=avg(hs); va=avg(vs)

    vf=va[:,0]; vc=va[:,1]
    jam=(pv_h*vf[None,:]*u["jam_fold"][hero]).sum(axis=1)+(pv_h*vc[None,:]*u["hero_call"]).sum(axis=1)
    hvals=np.stack([np.full(169,u["fold"][hero]),jam],axis=1)
    h_on=(ha*hvals).sum(axis=1)
    h_gap=(ph*(hvals.max(axis=1)-h_on)).sum()

    hjam=ha[:,1]
    reach=ph_v*hjam[:,None]; pjam=reach.sum(axis=0)
    cond=np.divide(reach,pjam[None,:],out=np.zeros_like(reach),where=pjam[None,:]>0)
    call=(cond*u["villain_call"]).sum(axis=0)
    vvals=np.stack([np.full(169,u["jam_fold"][villain]),call],axis=1)
    v_on=(va*vvals).sum(axis=1)
    v_gap=(pv*pjam*(vvals.max(axis=1)-v_on)).sum()
    nashconv=float(h_gap+v_gap)

    return {
        "hero":ha[:,1],"villain":va[:,1],
        "hero_evs":hvals,"villain_evs":vvals,
        "nashconv":nashconv,"risk":float(u["risk"]),
        "base_equities":u["base"].tolist()
    }

def strategy_rows(freqs,evs,aggressive_label,aggressive_kind):
    rows=[]
    for i,h in enumerate(HANDS):
        p=float(np.clip(freqs[i],0,1))
        rows.append({
            "hand":h,
            "actions":[
                {"action":"FOLD","kind":"fold","frequency":(1-p)*100,"ev":float(evs[i,0])},
                {"action":aggressive_label,"kind":aggressive_kind,"frequency":p*100,"ev":float(evs[i,1])}
            ]
        })
    return rows

def mk_positions(n):
    options={
      3:["BTN","SB","BB"],
      6:["UTG","HJ","CO","BTN","SB","BB"],
      8:["UTG","UTG+1","LJ","HJ","CO","BTN","SB","BB"],
      9:["UTG","UTG+1","UTG+2","LJ","HJ","CO","BTN","SB","BB"],
      10:["UTG","UTG+1","UTG+2","MP","LJ","HJ","CO","BTN","SB","BB"]
    }
    return options[n]

def arch(id,tags,stacks,payouts,phase="LATE",field="100",notes="",sb_tags=None,bb_tags=None,tournament_type="REGULAR"):
    n=len(stacks)
    pay=[max(0.0,float(x)) for x in payouts]
    # A bubble model is only a bubble when at least one remaining player is
    # outside the paid places. Never label an all-paid state as BUBBLE.
    if phase=="BUBBLE" and pay and all(x>0 for x in pay):
        pay[-1]=0.0
    total=sum(pay)
    if total<=0: raise ValueError("payout vector must contain prize value")
    pay=[x/total for x in pay]
    return {
      "id":id,"tags":tags,"stacks":stacks,"payouts":pay,"phase":phase,
      "fieldSize":field,"positions":mk_positions(n),"notes":notes,
      "tournamentType":tournament_type,
      "sbTags":list(sb_tags) if sb_tags is not None else list(tags),
      "bbTags":list(bb_tags) if bb_tags is not None else list(tags)
    }

# Two or more materially different archetypes for every covered card.
ARCHETYPES=[
  arch("icm-5-8-a",["icm_5_8","short_stack_survival"],[26,22,18,15,12,10,7,24],[.30,.20,.15,.11,.09,.07,.05,.03],"BUBBLE"),
  arch("icm-5-8-b",["icm_5_8","icm_bubble"],[35,28,21,17,13,9,6,31],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE"),
  arch("icm-9-12-a",["icm_9_12","mid_stack_pressure"],[34,27,22,18,16,14,10,29],[.30,.20,.15,.11,.09,.07,.05,.03],"LATE"),
  arch("icm-9-12-b",["icm_9_12","icm_pay_jump"],[31,25,20,17,14,12,9,27],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE"),
  arch("icm-13-18-a",["icm_13_18","mid_stack_pressure"],[42,35,29,24,20,17,14,38],[.30,.20,.15,.11,.09,.07,.05,.03],"LATE"),
  arch("icm-13-18-b",["icm_13_18","icm_pay_jump"],[39,32,26,22,19,16,13,36],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE"),
  arch("bubble-a",["icm_bubble","short_stack_survival"],[44,34,27,22,18,14,9,40],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE"),
  arch("bubble-b",["icm_bubble","big_stack_pressure"],[58,40,29,23,18,13,8,52],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE"),
  arch("payjump-a",["icm_pay_jump","mid_stack_pressure"],[36,29,23,18,14,11],[.40,.24,.15,.10,.07,.04],"LATE"),
  arch("payjump-b",["icm_pay_jump","short_stack_survival"],[44,30,21,15,10,8],[.40,.24,.15,.10,.07,.04],"LATE"),
  arch("ft-a",["icm_final_table","big_stack_pressure"],[62,48,38,30,24,19,15,11,8],[.30,.20,.14,.10,.08,.06,.05,.04,.03],"FINAL_TABLE"),
  arch("ft-b",["icm_final_table","mid_stack_pressure"],[50,43,36,31,26,22,18,14,10],[.30,.20,.14,.10,.08,.06,.05,.04,.03],"FINAL_TABLE"),
  arch("3h-a",["icm_3handed","big_stack_pressure"],[52,28,20],[.50,.30,.20],"FINAL_TABLE"),
  arch("3h-b",["icm_3handed","short_stack_survival"],[46,34,20],[.50,.30,.20],"FINAL_TABLE"),
  arch("big-a",["big_stack_pressure"],[24,20,17,15,12,44],[.38,.24,.15,.10,.08,.05],"LATE"),
  arch("big-b",["big_stack_pressure"],[30,23,18,14,10,52],[.38,.24,.15,.10,.08,.05],"BUBBLE"),
  arch("mid-a",["mid_stack_pressure"],[40,31,24,20,16,18],[.38,.24,.15,.10,.08,.05],"LATE"),
  arch("mid-b",["mid_stack_pressure"],[46,34,25,19,14,17],[.38,.24,.15,.10,.08,.05],"BUBBLE"),
  arch("short-a",["short_stack_survival"],[38,30,24,19,15,8],[.38,.24,.15,.10,.08,.05],"BUBBLE"),
  arch("short-b",["short_stack_survival"],[42,33,26,20,14,6],[.38,.24,.15,.10,.08,.05],"BUBBLE"),

  # Deep/mid Hero call-off families. SB is the short shover; BB is the target Hero stack.
  arch("hero18-a",[],[44,34,26,20,8,18],[.38,.24,.15,.10,.08,.05],"LATE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_13_18","mid_stack_pressure"]),
  arch("hero18-b",[],[48,36,27,21,10,18],[.38,.24,.15,.10,.08,.05],"BUBBLE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_13_18","mid_stack_pressure"]),
  arch("hero20-a",[],[46,35,27,21,8,20],[.38,.24,.15,.10,.08,.05],"LATE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_19_25","mid_stack_pressure"]),
  arch("hero20-b",[],[50,37,28,22,10,20],[.38,.24,.15,.10,.08,.05],"BUBBLE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_19_25","mid_stack_pressure"]),
  arch("hero25-a",[],[52,40,30,23,10,25],[.38,.24,.15,.10,.08,.05],"LATE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_19_25","mid_stack_pressure"]),
  arch("hero25-b",[],[56,42,31,24,12,25],[.38,.24,.15,.10,.08,.05],"BUBBLE",
       sb_tags=["short_stack_survival"],bb_tags=["icm_19_25","mid_stack_pressure"]),
  arch("hero30-a",[],[58,44,34,26,10,30],[.38,.24,.15,.10,.08,.05],"LATE",
       sb_tags=["short_stack_survival"],bb_tags=["big_stack_pressure"]),
  arch("hero30-b",[],[62,46,35,27,12,30],[.38,.24,.15,.10,.08,.05],"BUBBLE",
       sb_tags=["short_stack_survival"],bb_tags=["big_stack_pressure"]),
  arch("hero50-a",[],[78,56,42,31,10,50],[.38,.24,.15,.10,.08,.05],"LATE",
       sb_tags=["short_stack_survival"],bb_tags=["big_stack_pressure"]),
  arch("hero50-b",[],[84,60,45,33,15,50],[.38,.24,.15,.10,.08,.05],"BUBBLE",
       sb_tags=["short_stack_survival"],bb_tags=["big_stack_pressure"]),

  # 10-max coverage with two materially different tournament states.
  arch("10max-a",["mid_stack_pressure"],[66,54,44,36,30,25,20,16,12,28],[.28,.19,.14,.105,.08,.065,.05,.04,.03,.02],"LATE","500"),
  arch("10max-b",["big_stack_pressure"],[80,62,49,39,31,25,20,15,10,42],[.28,.19,.14,.105,.08,.065,.05,.04,.03,.02],"BUBBLE","1000+"),

  # Tournament-format / field-size families. PKO remains excluded until bounty economics are solved.
  arch("regular50-a",[],[48,39,31,24,18,14],[.38,.24,.15,.10,.08,.05],"LATE","50",tournament_type="REGULAR"),
  arch("regular50-b",[],[54,42,33,25,19,15],[.38,.24,.15,.10,.08,.05],"MIDDLE","50",tournament_type="REGULAR"),
  arch("turbo250-a",[],[34,28,22,17,13,10],[.38,.24,.15,.10,.08,.05],"LATE","250",tournament_type="TURBO"),
  arch("turbo250-b",[],[38,30,23,18,14,11],[.38,.24,.15,.10,.08,.05],"LATE","250",tournament_type="TURBO"),
  arch("freeze350-a",[],[58,46,36,28,21,16],[.38,.24,.15,.10,.08,.05],"LATE","350",tournament_type="FREEZEOUT"),
  arch("freeze350-b",[],[64,49,38,29,22,17],[.38,.24,.15,.10,.08,.05],"LATE","350",tournament_type="FREEZEOUT"),
  arch("hroller500-a",[],[92,74,58,45,34,26],[.38,.24,.15,.10,.08,.05],"LATE","500",tournament_type="HIGH_ROLLER"),
  arch("hroller500-b",[],[104,80,62,47,35,27],[.38,.24,.15,.10,.08,.05],"LATE","500",tournament_type="HIGH_ROLLER"),
  arch("sng50-a",[],[36,29,23,18,14,11],[.40,.24,.15,.10,.07,.04],"LATE","50",tournament_type="SNG"),
  arch("sng50-b",[],[42,32,25,19,14,10],[.40,.24,.15,.10,.07,.04],"BUBBLE","50",tournament_type="SNG"),
  arch("regular1000-a",[],[72,58,45,35,27,20],[.38,.24,.15,.10,.08,.05],"LATE","1000+",tournament_type="REGULAR"),
  arch("regular1000-b",[],[80,62,48,37,28,21],[.38,.24,.15,.10,.08,.05],"LATE","1000+",tournament_type="REGULAR")
]

def main():
    if not EQ_PATH.exists(): raise SystemExit(f"missing equity matrix: {EQ_PATH}")
    equity,compat=load_equity()
    spots=[]; rejected=[]
    for a in ARCHETYPES:
        result=solve_game(a,equity,compat)
        print(a["id"],"nashconv",result["nashconv"],flush=True)
        if not math.isfinite(result["nashconv"]) or result["nashconv"]>MAX_NASHCONV:
            rejected.append({"id":a["id"],"nashconv":result["nashconv"],"reason":"nashconv_above_gate"})
            continue
        positions=a["positions"]; hero=positions[-2]; villain=positions[-1]
        stack=float(a["stacks"][-2]); vstack=float(a["stacks"][-1])
        common={
          "gameType":"TOURNAMENT","street":"PRE-FLOP","tableSize":len(positions),
          "trainingTableSize":len(positions),"phase":a["phase"],"fieldSize":a["fieldSize"],
          "tournamentType":a["tournamentType"],"positions":positions,
          "payouts":a["payouts"],"icmBaseEquities":result["base_equities"],
          "playerStacks":dict(zip(positions,a["stacks"])),
          "provenance":{
            "strategySource":"STACKUP_ICM_RM",
            "equitySource":"amaster97/poker_solver preflop_equity_169x169.npz",
            "equityLicense":"MIT","utility":"EXACT_ICM",
            "nashConv":result["nashconv"],"iterations":ITERATIONS
          }
        }
        sb_tags=list(dict.fromkeys(a.get("sbTags",a["tags"])+["push_fold","open_shove"]))
        bb_tags=list(dict.fromkeys(a.get("bbTags",a["tags"])+["push_fold","call_shove"]))
        spots.append({
          "id":"icm-"+a["id"]+"-sb","solver":"STACKUP_ICM","version":"v1",
          "solveId":"icm-"+a["id"]+"-sb",
          "convergence":{"iterations":ITERATIONS,"nashConv":result["nashconv"],"gate":MAX_NASHCONV},
          "scenario":{**common,"heroPosition":hero,"villainPosition":villain,
            "heroStack":stack,"effectiveStack":min(stack,vstack),"pot":1.5,"board":[],
            "actionHistory":[],"tags":sb_tags},
          "strategy":strategy_rows(result["hero"],result["hero_evs"],"ALL IN","jam")
        })
        spots.append({
          "id":"icm-"+a["id"]+"-bb","solver":"STACKUP_ICM","version":"v1",
          "solveId":"icm-"+a["id"]+"-bb",
          "convergence":{"iterations":ITERATIONS,"nashConv":result["nashconv"],"gate":MAX_NASHCONV},
          "scenario":{**common,"heroPosition":villain,"villainPosition":hero,
            "heroStack":vstack,"effectiveStack":min(stack,vstack),"pot":stack+1.0,"board":[],
            "actionHistory":[{"position":hero,"action":"ALL IN","kind":"jam","to":stack}],
            "tags":bb_tags},
          "strategy":strategy_rows(result["villain"],result["villain_evs"],"CALL","call")
        })
    payload={
      "schemaVersion":1,
      "generator":"scripts/generate-tournament-bank.py",
      "iterations":ITERATIONS,"maxNashConv":MAX_NASHCONV,
      "equityUpstream":{"repository":"amaster97/poker_solver","license":"MIT",
        "commit":"f78f1b2bc338dd8cbb5226ecb8398bbdb3635676",
        "asset":"assets/preflop_equity_169x169.npz"},
      "spots":spots,"rejected":rejected
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    print(json.dumps({"acceptedSpots":len(spots),"rejected":len(rejected),"out":str(OUT)},indent=2))

if __name__=="__main__":
    main()
