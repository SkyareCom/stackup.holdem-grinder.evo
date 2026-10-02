#!/usr/bin/env python3
"""
StackUp Opponent Profile Best-Response Solver v1.

Uses the pinned equilibrium HU push/fold bank as the reference policy.
REC/REG/PRO are modeled only by versioned action-noise rates around that
equilibrium. A field profile mixes those policies. Hero strategy is then
solved as an exact chip-EV best response for every hand class.

No profile label changes a GTO answer without recomputation.
"""
from __future__ import annotations
import importlib.util, json, math, os
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"solver"/"opponent-profile.json"
CAL=ROOT/"data"/"solver"/"opponent-profile-calibration.json"
PF=ROOT/"data"/"solver"/"pushfold-hu-v1.json"
TB=ROOT/"scripts"/"generate-tournament-bank.py"

spec=importlib.util.spec_from_file_location("stackup_tournament_bank",TB)
tb=importlib.util.module_from_spec(spec); spec.loader.exec_module(tb)

def clip01(x): return np.clip(np.asarray(x,dtype=np.float64),0.0,1.0)

def mixed_policy(eq,profile,errors):
    mixed_error=sum(float(profile[k])*float(errors[k]) for k in ("REC","REG","PRO"))
    # Error means random binary action with p=0.5; lower-skill populations
    # deviate more often without assuming a specific loose/tight direction.
    return clip01((1.0-mixed_error)*eq + mixed_error*0.5), mixed_error

def pure_strategy(hand,ev_fold,ev_aggr,aggr_label,aggr_kind):
    choose=1.0 if ev_aggr>ev_fold+1e-12 else 0.0
    if abs(ev_aggr-ev_fold)<=1e-12: choose=0.5
    return {
      "hand":hand,
      "ev":max(ev_fold,ev_aggr),
      "actions":[
        {"action":"FOLD","kind":"fold","frequency":(1.0-choose)*100.0,"ev":float(ev_fold)},
        {"action":aggr_label,"kind":aggr_kind,"frequency":choose*100.0,"ev":float(ev_aggr)}
      ]
    }

def main():
    calibration=json.loads(CAL.read_text(encoding="utf-8"))
    pf=json.loads(PF.read_text(encoding="utf-8"))
    equity,compat=tb.load_equity()
    hands=tb.HANDS
    idx={h:i for i,h in enumerate(hands)}
    errors=calibration["errorRates"]

    expl=pf.get("final_exploitability_bb_per_100",{})
    if isinstance(expl,dict):
        max_expl=max(float(v) for v in expl.values())
    else:
        max_expl=float(expl)
    if not math.isfinite(max_expl) or max_expl>=0.05:
        raise SystemExit(f"equilibrium source exploitability gate failed: {max_expl}")

    spots=[]
    counts={}
    for profile_id,profile in calibration["profiles"].items():
        counts[profile_id]=0
        for stack in [int(x) for x in pf["stack_depths_bb"] if 2<=int(x)<=15]:
            eq_jam=np.array([float(pf["charts"]["sb_jam"][str(stack)].get(h,0.0)) for h in hands],dtype=np.float64)
            eq_call=np.array([float(pf["charts"]["bb_call_vs_jam"][str(stack)].get(h,0.0)) for h in hands],dtype=np.float64)
            field_jam,error_rate=mixed_policy(eq_jam,profile,errors)
            field_call,_=mixed_policy(eq_call,profile,errors)

            # SB Hero: opponent class j conditional on Hero class i.
            row_sum=compat.sum(axis=1,keepdims=True)
            opp_given_hero=np.divide(compat,row_sum,out=np.zeros_like(compat),where=row_sum>0)
            sb_strategy=[]
            for i,h in enumerate(hands):
                call_ev=(2.0*equity[i,:]-1.0)*float(stack)
                jam_ev=float((opp_given_hero[i,:]*((1.0-field_call)*1.0+field_call*call_ev)).sum())
                sb_strategy.append(pure_strategy(h,-0.5,jam_ev,"ALL IN","jam"))

            # BB Hero: condition SB range on the observed shove.
            bb_strategy=[]
            for j,h in enumerate(hands):
                reach=compat[:,j]*field_jam
                total=float(reach.sum())
                if total<=1e-18:
                    call_ev=-1e9
                else:
                    prob=reach/total
                    hero_equity=equity[j,:]
                    call_ev=float((prob*((2.0*hero_equity)-1.0)*float(stack)).sum())
                bb_strategy.append(pure_strategy(h,-1.0,call_ev,"CALL","call"))

            positions=["UTG","HJ","CO","BTN","SB","BB"]
            common={
              "gameType":"TOURNAMENT","street":"PRE-FLOP","tableSize":6,"trainingTableSize":6,
              "effectiveStack":float(stack),"board":[],"positions":positions,
              "playerStacks":{p:float(stack) for p in positions},
              "phase":"MIDDLE","tournamentType":"REGULAR","fieldSize":"500",
              "opponentProfile":profile_id,
              "profileMix":profile,
              "behaviorModel":{
                "id":"EQUILIBRIUM_NOISE_MIXTURE_V1",
                "mixedErrorRate":error_rate,
                "componentErrorRates":errors,
                "equilibriumSource":"pushfold-hu-v1"
              },
              "tags":["opponent_profile_br"],
              "provenance":{
                "strategySource":"STACKUP_PROFILE_BR",
                "model":"EQUILIBRIUM_NOISE_MIXTURE_V1",
                "profile":profile_id,"profileMix":profile,
                "mixedErrorRate":error_rate,
                "equilibriumExploitabilityBbPer100":max_expl,
                "equitySource":"amaster97/poker_solver preflop_equity_169x169.npz",
                "equityLicense":"MIT"
              }
            }
            spots.append({
              "id":f"profile-{profile_id}-{stack}bb-sb",
              "solver":"STACKUP_PROFILE_BR","version":"v1",
              "solveId":f"profile-br|{profile_id}|{stack}|SB",
              "convergence":{"method":"EXACT_FIXED_POLICY_BEST_RESPONSE","equilibriumExploitabilityBbPer100":max_expl},
              "scenario":{**common,"heroPosition":"SB","villainPosition":"BB","heroStack":float(stack),"pot":1.5,"actionHistory":[]},
              "strategy":sb_strategy
            })
            spots.append({
              "id":f"profile-{profile_id}-{stack}bb-bb",
              "solver":"STACKUP_PROFILE_BR","version":"v1",
              "solveId":f"profile-br|{profile_id}|{stack}|BB",
              "convergence":{"method":"EXACT_FIXED_POLICY_BEST_RESPONSE","equilibriumExploitabilityBbPer100":max_expl},
              "scenario":{**common,"heroPosition":"BB","villainPosition":"SB","heroStack":float(stack),"pot":float(stack)+1.0,
                "actionHistory":[{"position":"SB","action":"ALL IN","kind":"jam","to":float(stack)}]},
              "strategy":bb_strategy
            })
            counts[profile_id]+=len(sb_strategy)+len(bb_strategy)

    for profile_id,count in counts.items():
        if count<2000: raise SystemExit(f"{profile_id} below current goal: {count}")
    payload={
      "schemaVersion":1,"generatedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
      "solver":"STACKUP_PROFILE_BR","modelVersion":"v1","calibration":calibration,
      "equilibriumSource":"pushfold-hu-v1","spots":spots,"solvedByProfile":counts,"rejected":[]
    }
    OUT.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    print({"spots":len(spots),"solvedByProfile":counts})

if __name__=="__main__":main()
