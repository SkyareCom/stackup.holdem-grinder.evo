#!/usr/bin/env python3
"""
StackUp Multiway Tournament Best-Response Solver v1.

Families:
- MULTI SHOVE: Hero faces two all-ins and solves Fold/Call.
- BOUNTY ISO: Hero faces a bounty shove with one player behind whose call
  policy is pinned to equilibrium; solves Fold/All-in isolation.
- MULTIWAY BOUNTY: Hero faces two bounty all-ins and solves Fold/Call.

Equities are estimated by deterministic card-level Monte Carlo using a pinned
equilibrium range source. Every published hand has its own simulation result.
"""
from __future__ import annotations
import hashlib, importlib.util, json, math, os, random
from pathlib import Path
import numpy as np
from treys import Card, Evaluator

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"solver"/"multiway-tournament.json"
PF=ROOT/"data"/"solver"/"pushfold-hu-v1.json"
TB=ROOT/"scripts"/"generate-tournament-bank.py"
SAMPLES=max(400,int(os.environ.get("STACKUP_MULTIWAY_SAMPLES","700")))
INDIFFERENCE_BB=float(os.environ.get("STACKUP_MULTIWAY_INDIFFERENCE_BB","0.12"))

spec=importlib.util.spec_from_file_location("stackup_tournament_bank",TB)
tb=importlib.util.module_from_spec(spec); spec.loader.exec_module(tb)
EVAL=Evaluator()
FULL_DECK=[r+s for r in "23456789TJQKA" for s in "shdc"]

def seed_for(*parts):
    raw="|".join(map(str,parts)).encode()
    return int(hashlib.sha256(raw).hexdigest()[:16],16)

def card_ints(cards): return [Card.new(c) for c in cards]

def weighted_choice(rng,values,weights):
    total=sum(weights)
    if total<=0:return rng.choice(values)
    x=rng.random()*total
    acc=0.0
    for v,w in zip(values,weights):
        acc+=w
        if x<=acc:return v
    return values[-1]

def compatible_combo(rng,hand_class,used):
    choices=[tuple(x) for x in tb.COMBOS[tb.HIDX[hand_class]] if not (set(x)&used)]
    return rng.choice(choices) if choices else None

def sample_villain_combo(rng,hands,weights,used):
    for _ in range(80):
        cls=weighted_choice(rng,hands,weights)
        combo=compatible_combo(rng,cls,used)
        if combo:return cls,combo
    valid=[]
    for cls,w in zip(hands,weights):
        if w<=0:continue
        for combo in tb.COMBOS[tb.HIDX[cls]]:
            if not (set(combo)&used):valid.append((cls,tuple(combo)))
    return rng.choice(valid) if valid else (None,None)

def shares(hero,v1,v2,board):
    board_i=card_ints(board)
    ranks=[
      EVAL.evaluate(board_i,card_ints(hero)),
      EVAL.evaluate(board_i,card_ints(v1)),
      EVAL.evaluate(board_i,card_ints(v2))
    ]
    best=min(ranks)
    winners=[i for i,r in enumerate(ranks) if r==best]
    share3=(1.0/len(winners)) if 0 in winners else 0.0
    ranks2=ranks[:2]
    best2=min(ranks2)
    winners2=[i for i,r in enumerate(ranks2) if r==best2]
    share2=(1.0/len(winners2)) if 0 in winners2 else 0.0
    return share2,share3

def action_row(hand,fold_ev,active_ev,label,kind):
    gap=active_ev-fold_ev
    if abs(gap)<=INDIFFERENCE_BB:
        p=0.5
    else:
        p=1.0 if gap>0 else 0.0
    return {
      "hand":hand,"ev":max(fold_ev,active_ev),
      "actions":[
        {"action":"FOLD","kind":"fold","frequency":(1-p)*100.0,"ev":fold_ev},
        {"action":label,"kind":kind,"frequency":p*100.0,"ev":active_ev}
      ]
    }

def simulate_hand(family,stack,hand_class,jam_weights,call_weights,bounty_bb):
    rng=random.Random(seed_for(family,stack,hand_class,SAMPLES))
    hero_combos=[tuple(x) for x in tb.COMBOS[tb.HIDX[hand_class]]]
    if not hero_combos:return None
    evs=[]
    hero_shares=[]
    hands=tb.HANDS

    for _ in range(SAMPLES):
        hero=rng.choice(hero_combos)
        used=set(hero)
        _,v1=sample_villain_combo(rng,hands,jam_weights,used)
        if not v1:continue
        used.update(v1)
        v2_cls,v2=sample_villain_combo(rng,hands,jam_weights,used)
        if not v2:continue
        used.update(v2)
        remaining=[c for c in FULL_DECK if c not in used]
        board=rng.sample(remaining,5)
        s2,s3=shares(hero,v1,v2,board)
        hero_shares.append(s3)

        if family=="multi_shove":
            pot=3.0*stack+1.5
            ev=s3*pot-stack
        elif family=="multiway_bounty":
            pot=3.0*stack+1.5
            ev=s3*pot-stack+s3*(2.0*bounty_bb)
        elif family=="bounty_iso":
            # The player behind follows a fixed equilibrium-derived call policy.
            j=tb.HIDX[v2_cls]
            behind_calls=rng.random()<float(call_weights[j])
            if behind_calls:
                pot=3.0*stack+1.5
                ev=s3*pot-stack+s3*(2.0*bounty_bb)
            else:
                pot=2.0*stack+1.5
                ev=s2*pot-stack+s2*bounty_bb
        else:
            raise ValueError(family)
        evs.append(ev)

    if not evs:return None
    arr=np.asarray(evs,dtype=np.float64)
    share=np.asarray(hero_shares,dtype=np.float64)
    return {
      "ev":float(arr.mean()),
      "se":float(arr.std(ddof=1)/math.sqrt(len(arr))) if len(arr)>1 else 999.0,
      "equityShare":float(share.mean()),
      "samples":len(arr)
    }

def main():
    pf=json.loads(PF.read_text(encoding="utf-8"))
    expl=pf.get("final_exploitability_bb_per_100",{})
    max_expl=max(float(v) for v in expl.values()) if isinstance(expl,dict) else float(expl)
    if max_expl>=0.05:raise SystemExit("equilibrium source failed exploitability gate")

    spots=[];rejected=[];counts={"multi_shove":0,"bounty_iso":0,"multiway_bounty":0}
    stacks=[3,4,5,6,7,8,9,10,11,12,13,14]
    for family in counts:
        for stack in stacks:
            chart_stack=str(stack)
            jam=np.array([float(pf["charts"]["sb_jam"][chart_stack].get(h,0.0)) for h in tb.HANDS])
            call=np.array([float(pf["charts"]["bb_call_vs_jam"][chart_stack].get(h,0.0)) for h in tb.HANDS])
            # Weight range selection by physical combo count as well as policy reach.
            combo_counts=np.asarray(tb.COMBO_COUNT,dtype=np.float64)
            jam_weights=np.maximum(1e-9,jam*combo_counts)
            call_weights=np.clip(call,0,1)
            strategy=[]
            max_se=0.0
            bounty_bb=max(1.0,stack*0.20)
            for hand in tb.HANDS:
                result=simulate_hand(family,float(stack),hand,jam_weights,call_weights,bounty_bb)
                if not result:
                    rejected.append({"family":family,"stack":stack,"hand":hand,"reason":"sampling_failed"})
                    continue
                max_se=max(max_se,result["se"])
                label="ALL IN" if family=="bounty_iso" else "CALL"
                kind="jam" if family=="bounty_iso" else "call"
                strategy.append(action_row(hand,0.0,result["ev"],label,kind))
            if len(strategy)!=169:
                rejected.append({"family":family,"stack":stack,"reason":"incomplete_strategy","hands":len(strategy)})
                continue

            pko=family in ("bounty_iso","multiway_bounty")
            if family=="bounty_iso":
                hero="BTN";villain="CO"
                history=[{"position":"CO","action":"ALL IN","kind":"jam","to":float(stack)}]
            else:
                hero="BB";villain="CO"
                history=[
                  {"position":"CO","action":"ALL IN","kind":"jam","to":float(stack)},
                  {"position":"BTN","action":"ALL IN","kind":"jam","to":float(stack)}
                ]
            tags=[family]
            scenario={
              "gameType":"TOURNAMENT","street":"PRE-FLOP","tableSize":6,"trainingTableSize":6,
              "heroPosition":hero,"villainPosition":villain,"heroStack":float(stack),
              "effectiveStack":float(stack),"pot":(2.0*stack+1.5 if family!="bounty_iso" else stack+1.5),
              "board":[],"positions":["UTG","HJ","CO","BTN","SB","BB"],
              "playerStacks":{p:float(stack) for p in ["UTG","HJ","CO","BTN","SB","BB"]},
              "phase":"LATE","fieldSize":"500","tournamentType":"PKO" if pko else "REGULAR",
              "actionHistory":history,"tags":tags,
              "multiwayModel":{"players":3,"bountyBb":bounty_bb if pko else 0.0,"samplesPerHand":SAMPLES},
              "provenance":{
                "strategySource":"STACKUP_MULTIWAY_BR",
                "model":"CARD_LEVEL_MONTE_CARLO_FIXED_POLICY_BR_V1",
                "equilibriumSource":"pushfold-hu-v1",
                "equilibriumExploitabilityBbPer100":max_expl,
                "samplesPerHand":SAMPLES,"maxStandardErrorBb":max_se,
                "seedPolicy":"SHA256_FAMILY_STACK_HAND"
              }
            }
            spots.append({
              "id":f"multiway-{family}-{stack}bb","solver":"STACKUP_MULTIWAY_BR","version":"v1",
              "solveId":f"multiway-br|{family}|{stack}|{SAMPLES}",
              "convergence":{"method":"MONTE_CARLO_FIXED_POLICY_BEST_RESPONSE","samplesPerHand":SAMPLES,"maxStandardErrorBb":max_se},
              "scenario":scenario,"strategy":strategy
            })
            counts[family]+=169

    for family,n in counts.items():
        if n<2000:raise SystemExit(f"{family} below 2000 solved decisions: {n}")
    payload={
      "schemaVersion":1,"generatedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
      "solver":"STACKUP_MULTIWAY_BR","modelVersion":"v1","samplesPerHand":SAMPLES,
      "indifferenceBb":INDIFFERENCE_BB,"solvedByFamily":counts,"spots":spots,"rejected":rejected
    }
    OUT.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    print({"spots":len(spots),"solvedByFamily":counts,"rejected":len(rejected)})

if __name__=="__main__":main()
