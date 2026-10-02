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

    # PKO utility: a bounty is added only to the branch where the winner
    # actually covers and eliminates the opponent. Values are expressed in
    # the same normalized prize-equity units as payouts and are explicit
    # scenario inputs, never guessed by the solver.
    hero_bounty=float(archetype.get("heroBounty",0.0))
    villain_bounty=float(archetype.get("villainBounty",0.0))
    hero_covers=stacks[hero] >= stacks[villain]-1e-12
    villain_covers=stacks[villain] >= stacks[hero]-1e-12
    if hero_covers and villain_bounty>0:
        u["hero_call"]=u["hero_call"] + equity*villain_bounty
    if villain_covers and hero_bounty>0:
        u["villain_call"]=u["villain_call"] + (1.0-equity)*hero_bounty

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

def transfer_many(stacks, transfers):
    out=np.array(stacks,dtype=np.float64).copy()
    for src,dst,amount in transfers:
        x=min(max(0.0,float(amount)),out[src])
        out[src]-=x; out[dst]+=x
    return out

def solve_reshove_game(archetype,equity,compat):
    stacks=np.array(archetype["stacks"],dtype=np.float64)
    payouts=np.array(archetype["payouts"],dtype=np.float64)
    positions=archetype["positions"]
    opener=positions.index(archetype["openerPosition"])
    hero=positions.index(archetype["heroPosition"])
    sb=positions.index("SB"); bb=positions.index("BB")
    open_size=float(archetype.get("openSizeBb",2.2))

    base=icm_equities(stacks,payouts)

    # Open + Hero folds: opener wins the blinds; his own raise returns.
    open_hero_fold=transfer_many(stacks,[(sb,opener,.5),(bb,opener,1.0)])
    u_open_fold=icm_equities(open_hero_fold,payouts)

    # Hero jams and opener folds: Hero wins opener's raise plus the blinds.
    hero_jam_fold=transfer_many(stacks,[(opener,hero,open_size),(sb,hero,.5),(bb,hero,1.0)])
    u_jam_fold=icm_equities(hero_jam_fold,payouts)

    risk=min(float(stacks[opener]),float(stacks[hero]))
    hero_win=transfer_many(stacks,[(opener,hero,risk),(sb,hero,.5),(bb,hero,1.0)])
    opener_win=transfer_many(stacks,[(hero,opener,risk),(sb,opener,.5),(bb,opener,1.0)])
    u_hw=icm_equities(hero_win,payouts)
    u_ow=icm_equities(opener_win,payouts)

    # equity[j,i] = Hero hand j equity versus opener hand i.
    eh=equity.T
    hero_call=eh*u_hw[hero]+(1.0-eh)*u_ow[hero]
    opener_call=eh*u_hw[opener]+(1.0-eh)*u_ow[opener]

    joint=compat.astype(np.float64)
    joint/=joint.sum()
    po=joint.sum(axis=1)
    ph=joint.sum(axis=0)
    hero_given_opener=np.divide(joint,po[:,None],out=np.zeros_like(joint),where=po[:,None]>0)
    opener_given_hero=np.divide(joint,ph[None,:],out=np.zeros_like(joint),where=ph[None,:]>0)

    # Opener root: FOLD/OPEN. Hero after open: FOLD/JAM.
    # Opener response after jam: FOLD/CALL.
    ro=np.zeros((169,2)); rh=np.zeros((169,2)); rr=np.zeros((169,2))
    so=np.zeros((169,2)); sh=np.zeros((169,2)); sr=np.zeros((169,2))

    for t in range(1,ITERATIONS+1):
        O=rm_strategy(ro); H=rm_strategy(rh); R=rm_strategy(rr)

        # Opener response infoset, conditional on Hero having jammed.
        jam_weight=hero_given_opener*H[:,1][None,:]
        p_jam_given_o=jam_weight.sum(axis=1)
        cond_h_jam=np.divide(jam_weight,p_jam_given_o[:,None],out=np.zeros_like(jam_weight),where=p_jam_given_o[:,None]>0)
        response_call=(cond_h_jam*opener_call).sum(axis=1)
        response_vals=np.stack([np.full(169,u_jam_fold[opener]),response_call],axis=1)
        response_node=(R*response_vals).sum(axis=1)

        # Hero decision after observing an open.
        open_weight=opener_given_hero*O[:,1][:,None]
        p_open_given_h=open_weight.sum(axis=0)
        cond_o_open=np.divide(open_weight,p_open_given_h[None,:],out=np.zeros_like(open_weight),where=p_open_given_h[None,:]>0)
        hero_jam=(cond_o_open*(R[:,0][:,None]*u_jam_fold[hero]+R[:,1][:,None]*hero_call)).sum(axis=0)
        hero_vals=np.stack([np.full(169,u_open_fold[hero]),hero_jam],axis=1)
        hero_node=(H*hero_vals).sum(axis=1)

        # Opener root decision anticipates Hero strategy and own response strategy.
        open_pay=np.zeros(169)
        for i in range(169):
            continuation=H[:,0]*u_open_fold[opener] + H[:,1]*(R[i,0]*u_jam_fold[opener]+R[i,1]*opener_call[i,:])
            open_pay[i]=(hero_given_opener[i,:]*continuation).sum()
        opener_vals=np.stack([np.full(169,base[opener]),open_pay],axis=1)
        opener_node=(O*opener_vals).sum(axis=1)

        ta=float(t)**ALPHA; tb=float(t)**BETA
        ps=ta/(ta+1.0); ns=tb/(tb+1.0); ss=(t/(t+1.0))**GAMMA
        for reg in (ro,rh,rr):
            reg[:]=np.where(reg>0,reg*ps,np.where(reg<0,reg*ns,reg))
        so*=ss;sh*=ss;sr*=ss

        ro+=po[:,None]*(opener_vals-opener_node[:,None])
        rh+=(ph*p_open_given_h)[:,None]*(hero_vals-hero_node[:,None])
        rr+=(po*O[:,1]*p_jam_given_o)[:,None]*(response_vals-response_node[:,None])

        so+=po[:,None]*O
        sh+=(ph*p_open_given_h)[:,None]*H
        sr+=(po*O[:,1]*p_jam_given_o)[:,None]*R

    def avg(x):
        s=x.sum(axis=1,keepdims=True)
        return np.divide(x,s,out=np.full_like(x,.5),where=s>1e-18)

    O=avg(so);H=avg(sh);R=avg(sr)

    # Recompute values under average strategies.
    jam_weight=hero_given_opener*H[:,1][None,:]
    p_jam_given_o=jam_weight.sum(axis=1)
    cond_h_jam=np.divide(jam_weight,p_jam_given_o[:,None],out=np.zeros_like(jam_weight),where=p_jam_given_o[:,None]>0)
    response_call=(cond_h_jam*opener_call).sum(axis=1)
    response_vals=np.stack([np.full(169,u_jam_fold[opener]),response_call],axis=1)
    response_current=(R*response_vals).sum(axis=1)
    response_best=response_vals.max(axis=1)

    open_weight=opener_given_hero*O[:,1][:,None]
    p_open_given_h=open_weight.sum(axis=0)
    cond_o_open=np.divide(open_weight,p_open_given_h[None,:],out=np.zeros_like(open_weight),where=p_open_given_h[None,:]>0)
    hero_jam=(cond_o_open*(R[:,0][:,None]*u_jam_fold[hero]+R[:,1][:,None]*hero_call)).sum(axis=0)
    hero_vals=np.stack([np.full(169,u_open_fold[hero]),hero_jam],axis=1)
    hero_current=(H*hero_vals).sum(axis=1)
    hero_gap=float((ph*p_open_given_h*(hero_vals.max(axis=1)-hero_current)).sum())

    open_current=np.zeros(169)
    open_best=np.zeros(169)
    for i in range(169):
        current_cont=H[:,0]*u_open_fold[opener]+H[:,1]*(R[i,0]*u_jam_fold[opener]+R[i,1]*opener_call[i,:])
        best_cont=H[:,0]*u_open_fold[opener]+H[:,1]*response_best[i]
        open_current[i]=(hero_given_opener[i,:]*current_cont).sum()
        open_best[i]=(hero_given_opener[i,:]*best_cont).sum()

    root_current=O[:,0]*base[opener]+O[:,1]*open_current
    root_best=np.maximum(base[opener],open_best)
    opener_gap=float((po*(root_best-root_current)).sum())
    nashconv=hero_gap+opener_gap

    return {
      "openerOpen":O[:,1],
      "heroJam":H[:,1],
      "openerCall":R[:,1],
      "heroEvs":hero_vals,
      "openerResponseEvs":response_vals,
      "nashconv":float(nashconv),
      "baseEquities":base.tolist(),
      "openSizeBb":open_size,
      "risk":risk
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

def arch(id,tags,stacks,payouts,phase="LATE",field="100",notes="",sb_tags=None,bb_tags=None,tournament_type="REGULAR",hero_bounty=0.0,villain_bounty=0.0):
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
      "heroBounty":max(0.0,float(hero_bounty)),
      "villainBounty":max(0.0,float(villain_bounty)),
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
  arch("regular1000-b",[],[80,62,48,37,28,21],[.38,.24,.15,.10,.08,.05],"LATE","1000+",tournament_type="REGULAR"),

  # PKO: explicit bounty values in normalized prize-equity units.
  # Equal stacks: both players can eliminate each other.
  arch("pko-even-a",["pko_math"],[48,38,30,24,16,16],[.38,.24,.15,.10,.08,.05],"LATE","500",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.035,villain_bounty=.035),
  arch("pko-even-b",["pko_math"],[54,42,32,25,18,18],[.38,.24,.15,.10,.08,.05],"BUBBLE","500",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.055,villain_bounty=.045),

  # SB covers BB: shove side has bounty upside; BB is the covered player.
  arch("pko-sb-cover-a",["pko_math"],[52,40,31,24,22,12],[.38,.24,.15,.10,.08,.05],"LATE","1000+",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.04,villain_bounty=.05),
  arch("pko-sb-cover-b",["pko_math"],[60,45,34,26,25,10],[.38,.24,.15,.10,.08,.05],"BUBBLE","1000+",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.06,villain_bounty=.08),

  # BB covers SB: caller has bounty upside; SB is covered.
  arch("pko-bb-cover-a",["pko_math"],[50,39,30,23,10,24],[.38,.24,.15,.10,.08,.05],"LATE","350",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.05,villain_bounty=.03),
  arch("pko-bb-cover-b",["pko_math"],[56,43,33,25,12,28],[.38,.24,.15,.10,.08,.05],"BUBBLE","350",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.075,villain_bounty=.04)
]


# Strict-coverage expansion: additional materially distinct exact-ICM / PKO
# contexts. These are independently solved; no projection or presentation
# multiplication is used to meet the solved-spot floor.
ARCHETYPES.extend([
  arch("icm-5-8-c",["icm_5_8","short_stack_survival"],[40,32,25,19,14,11,8,36],[.32,.20,.14,.105,.08,.065,.05,.04],"BUBBLE","250"),
  arch("icm-5-8-d",["icm_5_8","icm_pay_jump"],[46,35,27,21,15,12,7,41],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE","500"),
  arch("icm-5-8-e",["icm_5_8","mid_stack_pressure"],[52,39,30,23,17,13,6,45],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","1000+"),

  arch("icm-9-12-c",["icm_9_12","icm_bubble"],[41,33,26,20,16,13,11,37],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","250"),
  arch("icm-9-12-d",["icm_9_12","icm_pay_jump"],[47,36,28,22,17,14,10,42],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE","500"),
  arch("icm-9-12-e",["icm_9_12","mid_stack_pressure"],[55,42,32,25,19,15,9,48],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","1000+"),

  arch("icm-13-18-c",["icm_13_18","icm_bubble"],[54,43,34,27,21,18,15,49],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","350"),
  arch("icm-13-18-d",["icm_13_18","icm_pay_jump"],[61,47,36,28,22,17,13,55],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE","1000+"),

  arch("icm-19-25-a",["icm_19_25","mid_stack_pressure"],[62,49,38,30,25,22,19,56],[.31,.21,.14,.105,.08,.065,.05,.04],"LATE","250"),
  arch("icm-19-25-b",["icm_19_25","icm_bubble"],[68,52,40,31,26,23,20,60],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","500"),
  arch("icm-19-25-c",["icm_19_25","icm_pay_jump"],[74,56,43,33,27,24,21,65],[.34,.22,.15,.10,.075,.055,.035,.025],"LATE","1000+"),

  arch("bubble-c",["icm_bubble","mid_stack_pressure"],[63,48,36,27,20,14,9,57],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","350"),
  arch("bubble-d",["icm_bubble","short_stack_survival"],[70,52,39,29,21,15,7,62],[.31,.21,.14,.105,.08,.065,.05,.04],"BUBBLE","1000+"),
  arch("payjump-c",["icm_pay_jump","mid_stack_pressure"],[50,38,29,21,15,10],[.42,.24,.14,.09,.07,.04],"LATE","350"),

  arch("ft-c",["icm_final_table","big_stack_pressure"],[74,57,44,34,27,21,16,12,9],[.30,.20,.14,.10,.08,.06,.05,.04,.03],"FINAL_TABLE","500"),
  arch("ft-d",["icm_final_table","mid_stack_pressure"],[66,54,43,35,29,24,19,15,11],[.30,.20,.14,.10,.08,.06,.05,.04,.03],"FINAL_TABLE","1000+"),
  arch("ft-e",["icm_final_table","short_stack_survival"],[80,60,46,35,27,20,15,10,7],[.30,.20,.14,.10,.08,.06,.05,.04,.03],"FINAL_TABLE","250"),

  arch("3h-c",["icm_3handed","mid_stack_pressure"],[58,31,21],[.50,.30,.20],"FINAL_TABLE","50"),
  arch("3h-d",["icm_3handed","big_stack_pressure"],[64,24,12],[.50,.30,.20],"FINAL_TABLE","250"),
  arch("3h-e",["icm_3handed","short_stack_survival"],[44,38,18],[.50,.30,.20],"FINAL_TABLE","500"),

  arch("10max-c",["mid_stack_pressure"],[74,61,50,41,34,28,23,18,14,31],[.28,.19,.14,.105,.08,.065,.05,.04,.03,.02],"LATE","250"),
  arch("10max-d",["big_stack_pressure"],[92,70,55,43,34,27,21,16,11,48],[.28,.19,.14,.105,.08,.065,.05,.04,.03,.02],"BUBBLE","500"),
  arch("10max-e",["short_stack_survival"],[70,58,48,40,33,27,22,17,12,9],[.28,.19,.14,.105,.08,.065,.05,.04,.03,.02],"BUBBLE","1000+"),

  arch("pko-even-c",["pko_math"],[62,48,36,28,20,20],[.38,.24,.15,.10,.08,.05],"LATE","250",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.045,villain_bounty=.055),
  arch("pko-sb-cover-c",["pko_math"],[68,52,39,30,28,11],[.38,.24,.15,.10,.08,.05],"BUBBLE","500",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.065,villain_bounty=.09),
  arch("pko-bb-cover-c",["pko_math"],[64,50,38,29,11,30],[.38,.24,.15,.10,.08,.05],"LATE","1000+",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.085,villain_bounty=.045),

  # Additional independently solved covered-stack contexts. Distinct stack,
  # bounty, field and phase states; these are not projections or suit variants.
  arch("pko-sb-cover-d",["pko_math"],[76,58,44,33,31,9],[.40,.23,.14,.09,.08,.06],"LATE","250",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.035,villain_bounty=.11),
  arch("pko-sb-cover-e",["pko_math"],[84,63,47,35,29,8],[.42,.22,.13,.09,.08,.06],"BUBBLE","350",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.075,villain_bounty=.13),
  arch("pko-bb-cover-d",["pko_math"],[72,55,41,31,9,34],[.40,.23,.14,.09,.08,.06],"BUBBLE","250",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.12,villain_bounty=.035),
  arch("pko-bb-cover-e",["pko_math"],[88,66,49,36,8,38],[.42,.22,.13,.09,.08,.06],"LATE","500",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.14,villain_bounty=.055),

  # Two more materially distinct covered-stack solves take this filter beyond
  # the immediate 2,000-decision target without metadata projection.
  arch("pko-sb-cover-f",["pko_math"],[92,70,52,39,34,7],[.43,.22,.13,.085,.075,.05],"FINAL_TABLE","1000+",
       sb_tags=["pko_math","bounty_shove","covering_stack"],
       bb_tags=["pko_math","bounty_call","covered_stack"],
       tournament_type="PKO",hero_bounty=.095,villain_bounty=.145),
  arch("pko-bb-cover-f",["pko_math"],[94,71,53,40,6,35],[.43,.22,.13,.085,.075,.05],"FINAL_TABLE","1000+",
       sb_tags=["pko_math","bounty_shove","covered_stack"],
       bb_tags=["pko_math","bounty_call","covering_stack"],
       tournament_type="PKO",hero_bounty=.15,villain_bounty=.08),

  # Growth-to-2000 contexts. Each state is independently solved under exact ICM;
  # no suit permutation, positional projection or metadata multiplication.
  arch("icm-5-8-f",["icm_5_8","icm_pay_jump"],[57,43,33,25,18,14,8,50],[.35,.21,.14,.10,.075,.055,.035,.025],"LATE","350"),
  arch("icm-9-12-f",["icm_9_12","mid_stack_pressure"],[59,45,34,26,20,16,12,52],[.32,.20,.14,.105,.08,.065,.05,.04],"BUBBLE","350"),
  arch("icm-13-18-f",["icm_13_18","icm_pay_jump"],[66,50,38,29,23,18,14,59],[.35,.21,.14,.10,.075,.055,.035,.025],"LATE","500"),
  arch("icm-19-25-d",["icm_19_25","icm_bubble"],[79,60,46,35,28,25,22,70],[.32,.20,.14,.105,.08,.065,.05,.04],"BUBBLE","350"),
  arch("ft-f",["icm_final_table","mid_stack_pressure"],[86,65,50,38,30,23,17,12,8],[.31,.20,.14,.10,.08,.06,.05,.035,.025],"FINAL_TABLE","350"),
  arch("3h-f",["icm_3handed","mid_stack_pressure"],[55,29,16],[.52,.29,.19],"FINAL_TABLE","1000+"),
  arch("10max-f",["mid_stack_pressure"],[84,68,56,46,38,31,25,20,15,36],[.29,.19,.14,.105,.08,.065,.05,.035,.025,.02],"LATE","350")
])

RESHOVE_ARCHETYPES=[
  {
    "id":"reshove-late-12","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"CO","heroPosition":"BTN","openSizeBb":2.2,
    "stacks":[38,34,30,12,24,22],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"500","tournamentType":"REGULAR"
  },
  {
    "id":"reshove-bubble-15","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"CO","heroPosition":"BTN","openSizeBb":2.2,
    "stacks":[44,36,32,15,22,18],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"500","tournamentType":"REGULAR"
  },
  {
    "id":"reshove-late-18","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"HJ","heroPosition":"CO","openSizeBb":2.1,
    "stacks":[46,31,18,28,24,20],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"1000+","tournamentType":"REGULAR"
  }
]


RESHOVE_ARCHETYPES.extend([
  {
    "id":"reshove-bubble-10","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"HJ","heroPosition":"CO","openSizeBb":2.1,
    "stacks":[42,29,10,26,22,18],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"250","tournamentType":"REGULAR"
  },
  {
    "id":"reshove-late-14","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"UTG","heroPosition":"HJ","openSizeBb":2.2,
    "stacks":[33,14,28,25,21,19],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"350","tournamentType":"REGULAR"
  },
  {
    "id":"reshove-bubble-16","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"HJ","heroPosition":"BTN","openSizeBb":2.0,
    "stacks":[48,34,28,16,22,19],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"500","tournamentType":"TURBO"
  },
  {
    "id":"reshove-late-20","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"CO","heroPosition":"BTN","openSizeBb":2.2,
    "stacks":[54,42,31,20,26,23],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"1000+","tournamentType":"FREEZEOUT"
  },
  {
    "id":"reshove-bubble-22","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"UTG","heroPosition":"CO","openSizeBb":2.1,
    "stacks":[40,35,22,29,24,18],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"500","tournamentType":"HIGH_ROLLER"
  },
  {
    "id":"reshove-late-25","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"HJ","heroPosition":"CO","openSizeBb":2.2,
    "stacks":[58,39,25,32,27,21],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"250","tournamentType":"SNG"
  },
  {
    "id":"reshove-bubble-13","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"CO","heroPosition":"BTN","openSizeBb":2.1,
    "stacks":[46,37,30,13,24,20],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"350","tournamentType":"REGULAR"
  },
  {
    "id":"reshove-late-17","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"UTG","heroPosition":"HJ","openSizeBb":2.0,
    "stacks":[36,17,31,27,23,19],"payouts":[.38,.24,.15,.10,.08,.05],
    "phase":"LATE","fieldSize":"500","tournamentType":"TURBO"
  },
  {
    "id":"reshove-bubble-23","positions":["UTG","HJ","CO","BTN","SB","BB"],
    "openerPosition":"HJ","heroPosition":"CO","openSizeBb":2.1,
    "stacks":[56,43,23,34,28,20],"payouts":[.40,.25,.16,.10,.09,0],
    "phase":"BUBBLE","fieldSize":"1000+","tournamentType":"FREEZEOUT"
  }
])

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
          "heroBountyPrizeValue":a.get("heroBounty",0.0),
          "villainBountyPrizeValue":a.get("villainBounty",0.0),
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
    for a in RESHOVE_ARCHETYPES:
        pay=[max(0.0,float(x)) for x in a["payouts"]]
        total=sum(pay); pay=[x/total for x in pay]
        aa={**a,"payouts":pay}
        result=solve_reshove_game(aa,equity,compat)
        print(a["id"],"reshove nashconv",result["nashconv"],flush=True)
        if not math.isfinite(result["nashconv"]) or result["nashconv"]>MAX_NASHCONV:
            rejected.append({"id":a["id"],"nashconv":result["nashconv"],"reason":"reshove_nashconv_above_gate"})
            continue
        positions=a["positions"]; opener=a["openerPosition"]; hero=a["heroPosition"]
        oi=positions.index(opener); hi=positions.index(hero)
        open_size=float(a["openSizeBb"])
        current_stacks=dict(zip(positions,a["stacks"]))
        current_stacks[opener]=max(0.0,current_stacks[opener]-open_size)
        current_stacks["SB"]=max(0.0,current_stacks["SB"]-.5)
        current_stacks["BB"]=max(0.0,current_stacks["BB"]-1.0)
        spots.append({
          "id":"icm-"+a["id"]+"-hero","solver":"STACKUP_ICM","version":"v1",
          "solveId":"icm-"+a["id"]+"-hero",
          "convergence":{"iterations":ITERATIONS,"nashConv":result["nashconv"],"gate":MAX_NASHCONV},
          "scenario":{
            "gameType":"TOURNAMENT","street":"PRE-FLOP","tableSize":len(positions),"trainingTableSize":len(positions),
            "heroPosition":hero,"villainPosition":opener,"heroStack":float(a["stacks"][hi]),
            "effectiveStack":min(float(a["stacks"][hi]),float(a["stacks"][oi])),
            "pot":1.5+open_size,"currentBet":open_size,"board":[],"positions":positions,
            "playerStacks":current_stacks,"phase":a["phase"],"fieldSize":a["fieldSize"],
            "tournamentType":a["tournamentType"],"payouts":pay,
            "actionHistory":[
              {"position":"UTG","action":"FOLD","kind":"fold","to":0},
              *([{"position":"HJ","action":"FOLD","kind":"fold","to":0}] if opener=="CO" else []),
              {"position":opener,"action":"RAISE","kind":"raise","to":open_size}
            ],
            "tags":["reshove"],
            "provenance":{
              "strategySource":"STACKUP_ICM_RESHOVE_CFR",
              "equitySource":"amaster97/poker_solver preflop_equity_169x169.npz",
              "equityLicense":"MIT","utility":"EXACT_ICM",
              "nashConv":result["nashconv"],"iterations":ITERATIONS
            }
          },
          "strategy":strategy_rows(result["heroJam"],result["heroEvs"],"ALL IN","jam")
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
