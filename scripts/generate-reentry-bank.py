#!/usr/bin/env python3
"""
StackUp Re-entry Utility Solver v1.

Solves SB shove / BB response games under explicit tournament utility models:
- REBUY: a busted player may restore a configured stack at a normalized prize-value cost.
- ADDON: every surviving player receives configured addon chips and pays a normalized cost.

The option changes terminal utilities before regret matching. No ordinary ICM
strategy is relabelled as rebuy/addon content.
"""
from __future__ import annotations
import importlib.util, json, math, os
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"solver"/"reentry.json"
BASE_PATH=ROOT/"scripts"/"generate-tournament-bank.py"
spec=importlib.util.spec_from_file_location("stackup_tournament_bank",BASE_PATH)
tb=importlib.util.module_from_spec(spec); spec.loader.exec_module(tb)

ITERATIONS=max(4000,int(os.environ.get("STACKUP_REENTRY_ITERATIONS","9000")))
MAX_NASHCONV=float(os.environ.get("STACKUP_REENTRY_MAX_NASHCONV","0.0020"))

def adjusted_utility(stacks,payouts,model):
    stacks=np.array(stacks,dtype=np.float64)
    kind=model["kind"]
    if kind=="REBUY":
        base=tb.icm_equities(stacks,payouts)
        out=base.copy()
        for i,x in enumerate(stacks):
            if x>1e-12: continue
            restored=stacks.copy()
            restored[i]=float(model["rebuyStackBb"])
            value=float(tb.icm_equities(restored,payouts)[i])-float(model["costPrizeValue"])
            out[i]=max(0.0,value)
        return out
    if kind=="ADDON":
        alive=stacks>1e-12
        augmented=stacks.copy()
        augmented[alive]+=float(model["addonStackBb"])
        base=tb.icm_equities(augmented,payouts)
        out=base.copy()
        out[alive]=np.maximum(0.0,out[alive]-float(model["costPrizeValue"]))
        out[~alive]=0.0
        return out
    raise ValueError("unknown re-entry utility kind")

def terminal_utilities(stacks,payouts,hero,villain,equity,model):
    fold,jfold,win,lose,tie,risk=tb.outcome_vectors(stacks,hero,villain)
    uf=adjusted_utility(fold,payouts,model)
    ujf=adjusted_utility(jfold,payouts,model)
    uw=adjusted_utility(win,payouts,model)
    ul=adjusted_utility(lose,payouts,model)
    ut=adjusted_utility(tie,payouts,model)
    hcall=equity*uw[hero]+(1-equity)*ul[hero]
    vcall=equity*ul[villain]+(1-equity)*uw[villain]
    return {"fold":uf,"jam_fold":ujf,"hero_call":hcall,"villain_call":vcall,"risk":risk}

def solve(archetype,equity,compat):
    stacks=np.array(archetype["stacks"],dtype=np.float64)
    payouts=np.array(archetype["payouts"],dtype=np.float64)
    hero=len(stacks)-2; villain=len(stacks)-1
    u=terminal_utilities(stacks,payouts,hero,villain,equity,archetype["model"])

    joint=compat.astype(np.float64); joint/=joint.sum()
    ph=joint.sum(axis=1); pv=joint.sum(axis=0)
    pv_h=np.divide(joint,ph[:,None],out=np.zeros_like(joint),where=ph[:,None]>0)
    ph_v=np.divide(joint,pv[None,:],out=np.zeros_like(joint),where=pv[None,:]>0)

    hr=np.zeros((169,2)); vr=np.zeros((169,2))
    hs=np.zeros((169,2)); vs=np.zeros((169,2))

    for t in range(1,ITERATIONS+1):
        hst=tb.rm_strategy(hr); vst=tb.rm_strategy(vr)
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

        ta=float(t)**tb.ALPHA; tbeta=float(t)**tb.BETA
        ps=ta/(ta+1.0); ns=tbeta/(tbeta+1.0); ss=(t/(t+1.0))**tb.GAMMA
        hr[:]=np.where(hr>0,hr*ps,np.where(hr<0,hr*ns,hr))
        vr[:]=np.where(vr>0,vr*ps,np.where(vr<0,vr*ns,vr))
        hs*=ss;vs*=ss
        hr+=ph[:,None]*(hvals-hnode[:,None])
        vr+=pjam[:,None]*(vvals-vnode[:,None])
        hs+=ph[:,None]*hst
        vs+=pv[:,None]*vst

    def avg(x):
        s=x.sum(axis=1,keepdims=True)
        return np.divide(x,s,out=np.full_like(x,.5),where=s>1e-18)
    ha=avg(hs);va=avg(vs)

    vf=va[:,0];vc=va[:,1]
    jam=(pv_h*vf[None,:]*u["jam_fold"][hero]).sum(axis=1)+(pv_h*vc[None,:]*u["hero_call"]).sum(axis=1)
    hvals=np.stack([np.full(169,u["fold"][hero]),jam],axis=1)
    hcur=(ha*hvals).sum(axis=1)
    hgap=float((ph*(hvals.max(axis=1)-hcur)).sum())

    hjam=ha[:,1]
    reach=ph_v*hjam[:,None];pjam=reach.sum(axis=0)
    cond=np.divide(reach,pjam[None,:],out=np.zeros_like(reach),where=pjam[None,:]>0)
    call=(cond*u["villain_call"]).sum(axis=0)
    vvals=np.stack([np.full(169,u["jam_fold"][villain]),call],axis=1)
    vcur=(va*vvals).sum(axis=1)
    vgap=float((pv*pjam*(vvals.max(axis=1)-vcur)).sum())
    return {"hero":ha[:,1],"villain":va[:,1],"heroEvs":hvals,"villainEvs":vvals,"nashConv":hgap+vgap}

def archetype(kind,idx,stacks,payouts,phase,field,model):
    pay=np.array(payouts,dtype=np.float64);pay=pay/pay.sum()
    return {
      "id":f"{kind.lower()}-{idx}",
      "kind":kind,
      "positions":["UTG","HJ","CO","BTN","SB","BB"],
      "stacks":stacks,"payouts":pay.tolist(),"phase":phase,"fieldSize":field,"model":model
    }

REBUY=[
 archetype("REBUY","a",[48,38,30,24,10,10],[.38,.24,.15,.10,.08,.05],"EARLY","50",{"kind":"REBUY","rebuyStackBb":20,"costPrizeValue":.028}),
 archetype("REBUY","b",[55,43,33,26,12,12],[.38,.24,.15,.10,.08,.05],"EARLY","100",{"kind":"REBUY","rebuyStackBb":25,"costPrizeValue":.032}),
 archetype("REBUY","c",[62,48,36,28,15,15],[.38,.24,.15,.10,.08,.05],"MIDDLE","250",{"kind":"REBUY","rebuyStackBb":20,"costPrizeValue":.025}),
 archetype("REBUY","d",[70,53,40,30,18,18],[.38,.24,.15,.10,.08,.05],"MIDDLE","500",{"kind":"REBUY","rebuyStackBb":30,"costPrizeValue":.038}),
 archetype("REBUY","e",[80,60,45,34,20,20],[.38,.24,.15,.10,.08,.05],"MIDDLE","1000+",{"kind":"REBUY","rebuyStackBb":25,"costPrizeValue":.030}),
 archetype("REBUY","f",[66,50,38,29,17,17],[.38,.24,.15,.10,.08,.05],"MIDDLE","350",{"kind":"REBUY","rebuyStackBb":25,"costPrizeValue":.031}),
]
ADDON=[
 archetype("ADDON","a",[45,36,29,23,14,14],[.38,.24,.15,.10,.08,.05],"MIDDLE","50",{"kind":"ADDON","addonStackBb":10,"costPrizeValue":.014}),
 archetype("ADDON","b",[52,41,32,25,16,16],[.38,.24,.15,.10,.08,.05],"MIDDLE","100",{"kind":"ADDON","addonStackBb":15,"costPrizeValue":.020}),
 archetype("ADDON","c",[60,46,35,27,18,18],[.38,.24,.15,.10,.08,.05],"MIDDLE","250",{"kind":"ADDON","addonStackBb":20,"costPrizeValue":.026}),
 archetype("ADDON","d",[68,51,39,29,20,20],[.38,.24,.15,.10,.08,.05],"MIDDLE","500",{"kind":"ADDON","addonStackBb":25,"costPrizeValue":.032}),
 archetype("ADDON","e",[76,57,43,32,22,22],[.38,.24,.15,.10,.08,.05],"MIDDLE","1000+",{"kind":"ADDON","addonStackBb":30,"costPrizeValue":.038}),
 archetype("ADDON","f",[64,49,37,28,19,19],[.38,.24,.15,.10,.08,.05],"MIDDLE","350",{"kind":"ADDON","addonStackBb":22,"costPrizeValue":.029}),
]

def main():
    equity,compat=tb.load_equity()
    spots=[];rejected=[]
    for a in REBUY+ADDON:
        result=solve(a,equity,compat)
        nc=float(result["nashConv"])
        print(a["id"],"nashconv",nc,flush=True)
        if not math.isfinite(nc) or nc>MAX_NASHCONV:
            rejected.append({"id":a["id"],"nashConv":nc});continue
        positions=a["positions"];sb="SB";bb="BB";stack=float(a["stacks"][-2]);vstack=float(a["stacks"][-1])
        common={
          "gameType":"TOURNAMENT","street":"PRE-FLOP","tableSize":6,"trainingTableSize":6,
          "phase":a["phase"],"fieldSize":a["fieldSize"],"tournamentType":"REGULAR",
          "positions":positions,"playerStacks":dict(zip(positions,a["stacks"])),"payouts":a["payouts"],
          "extras":[a["kind"].lower()],
          "reentryUtilityModel":a["model"],
          "provenance":{
            "strategySource":"STACKUP_REENTRY_ICM_RM",
            "utilityModel":"STACKUP_REENTRY_UTILITY_V1",
            "option":a["kind"],"parameters":a["model"],
            "equitySource":"amaster97/poker_solver preflop_equity_169x169.npz",
            "equityLicense":"MIT","iterations":ITERATIONS,"nashConv":nc
          }
        }
        tags=[a["kind"].lower()]
        spots.append({
          "id":"reentry-"+a["id"]+"-sb","solver":"STACKUP_REENTRY_ICM","version":"v1","solveId":"reentry-"+a["id"]+"-sb",
          "convergence":{"iterations":ITERATIONS,"nashConv":nc,"gate":MAX_NASHCONV},
          "scenario":{**common,"heroPosition":sb,"villainPosition":bb,"heroStack":stack,"effectiveStack":min(stack,vstack),"pot":1.5,"board":[],"actionHistory":[],"tags":tags},
          "strategy":tb.strategy_rows(result["hero"],result["heroEvs"],"ALL IN","jam")
        })
        spots.append({
          "id":"reentry-"+a["id"]+"-bb","solver":"STACKUP_REENTRY_ICM","version":"v1","solveId":"reentry-"+a["id"]+"-bb",
          "convergence":{"iterations":ITERATIONS,"nashConv":nc,"gate":MAX_NASHCONV},
          "scenario":{**common,"heroPosition":bb,"villainPosition":sb,"heroStack":vstack,"effectiveStack":min(stack,vstack),"pot":stack+1,"board":[],"actionHistory":[{"position":sb,"action":"ALL IN","kind":"jam","to":stack}],"tags":tags},
          "strategy":tb.strategy_rows(result["villain"],result["villainEvs"],"CALL","call")
        })
    payload={
      "schemaVersion":1,"generatedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
      "solver":"STACKUP_REENTRY_ICM","modelVersion":"v1","iterations":ITERATIONS,
      "maxNashConv":MAX_NASHCONV,"spots":spots,"rejected":rejected
    }
    OUT.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    counts={}
    for s in spots:
        for e in s["scenario"].get("extras",[]):counts[e]=counts.get(e,0)+len(s["strategy"])
    print({"spots":len(spots),"rejected":len(rejected),"solvedByExtra":counts})
    for key in ("rebuy","addon"):
        if counts.get(key,0)<2000: raise SystemExit(f"{key} below 2000 solved decisions: {counts.get(key,0)}")

if __name__=="__main__":main()
