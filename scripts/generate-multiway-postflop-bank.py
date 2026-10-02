#!/usr/bin/env python3
"""
StackUp Multiway River Best-Response Solver v1.

Terminal river decision:
  pot before action = 30bb
  Villain 1 bets 20bb all-in
  Villain 2 calls 20bb all-in
  Hero faces 20bb call into 70bb.

For every exact Hero combo on every board, two compatible villain combos are
sampled from pinned solver-derived ranges. Showdowns use a real 7-card evaluator.
The output is Fold/Call best response with an indifference band for sampling noise.
"""
from __future__ import annotations
import bisect, hashlib, importlib.util, json, math, os, random
from pathlib import Path
from treys import Card, Evaluator

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"solver"/"multiway-postflop.json"
POST=ROOT/"data"/"solver"/"postflop.json"
TB=ROOT/"scripts"/"generate-tournament-bank.py"
SAMPLES=max(500,int(os.environ.get("STACKUP_MULTIWAY_RIVER_SAMPLES","1000")))
INDIFF=float(os.environ.get("STACKUP_MULTIWAY_RIVER_INDIFF_BB","0.35"))
EVAL=Evaluator()

spec=importlib.util.spec_from_file_location("stackup_tournament_bank",TB)
tb=importlib.util.module_from_spec(spec);spec.loader.exec_module(tb)

BOARDS=[
 ["As","7d","2c","Jh","4s"],
 ["Qh","8h","3c","5d","Ts"],
 ["9s","8d","6c","Kh","2s"],
 ["Kc","Qd","5h","5s","9c"],
 ["7s","6s","2d","8h","Ac"],
 ["Jc","9c","4d","2h","Qs"],
 ["Ah","Kd","7c","3s","2h"],
 ["Ks","Td","8c","6h","3d"],
 ["Qs","Jd","9h","5c","2d"],
 ["Ac","Qc","8d","4h","3s"],
 ["Kh","Jh","6c","6d","2s"],
 ["Ad","9d","7h","5c","3s"],
 ["Kc","9h","8s","4d","2c"],
 ["Qd","Td","7s","6h","4c"],
 ["As","Js","8h","5d","2c"],
 ["Kd","Qh","9c","3d","2s"],
 ["Ah","Th","6s","4c","3d"],
 ["Ks","Jc","7d","5h","2c"],
 ["Qc","9s","6d","4h","2s"],
 ["Ad","Kd","8c","7h","3s"],
 ["Kh","Qh","Td","5s","2c"],
 ["As","9c","8h","6d","4s"],
 ["Kc","Tc","7h","3d","2s"],
 ["Qh","Jh","8c","6d","3s"],
 ["Ac","Jd","9h","7s","5c"],
 ["Kd","Ts","8d","5h","4c"],
 ["Ah","Qc","7d","6s","2h"],
 ["Ks","Qd","9s","4c","3h"],
 ["Ad","Jc","8s","6h","5d"],
 ["Kh","Td","9c","7s","2d"],
 ["Qs","8c","5h","3d","2c"],
 ["Ac","Tc","9d","6h","4s"],
 ["Kd","Jd","8s","5c","3h"],
]

def seed_for(*parts):
    return int(hashlib.sha256("|".join(map(str,parts)).encode()).hexdigest()[:16],16)

def parse_range(raw):
    out={}
    for token in str(raw or "").split(","):
        if not token.strip():continue
        parts=token.strip().split(":")
        hand=parts[0].strip().upper().replace("10","T")
        weight=float(parts[1]) if len(parts)>1 else 1.0
        if not math.isfinite(weight) or weight<=0:continue
        if hand in tb.HIDX:
            for combo in tb.COMBOS[tb.HIDX[hand]]:
                key=tuple(combo)
                out[key]=max(out.get(key,0.0),weight)
    return [(combo,w) for combo,w in out.items()]

def legal(entries,board):
    used=set(board)
    return [(c,w) for c,w in entries if not (set(c)&used)]

def sampler(entries):
    combos=[];cum=[];total=0.0
    for combo,w in entries:
        if w<=0:continue
        total+=float(w);combos.append(combo);cum.append(total)
    def pick(rng,used):
        if total<=0:return None
        for _ in range(100):
            x=rng.random()*total
            combo=combos[bisect.bisect_left(cum,x)]
            if not (set(combo)&used):return combo
        candidates=[c for c in combos if not (set(c)&used)]
        return rng.choice(candidates) if candidates else None
    return pick

def rank(hand,board_i):
    return EVAL.evaluate(board_i,[Card.new(hand[0]),Card.new(hand[1])])

def strategy_row(hand,call_ev,equity,se):
    if abs(call_ev)<=INDIFF:p=0.5
    else:p=1.0 if call_ev>0 else 0.0
    return {
      "hand":"".join(hand),"ev":max(0.0,call_ev),
      "equityShare":equity,"equitySE":se,
      "actions":[
        {"action":"FOLD","kind":"fold","frequency":(1-p)*100.0,"ev":0.0},
        {"action":"CALL","kind":"call","frequency":p*100.0,"ev":call_ev}
      ]
    }

def main():
    bank=json.loads(POST.read_text(encoding="utf-8"))
    base=next((s for s in bank if s.get("matchup")=="CO vs BTN" and s.get("scenario",{}).get("street")=="FLOP"),None)
    if not base:
        base=next((s for s in bank if s.get("scenario",{}).get("street")=="FLOP"),None)
    if not base:raise SystemExit("postflop base ranges unavailable")

    hero_entries=parse_range(base["scenario"].get("heroRange"))
    villain_entries=parse_range(base["scenario"].get("villainRange"))
    if len(hero_entries)<30 or len(villain_entries)<30:
        raise SystemExit(f"solver ranges too small hero={len(hero_entries)} villain={len(villain_entries)}")

    # Board blockers reduce the legal exact Hero combos. The quality gate must
    # scale with the solver range; the global >=1500 solved-decision floor below
    # remains authoritative for publication.
    min_board_hands=max(30,int(math.floor(len(hero_entries)*0.60)))

    spots=[];rejected=[];total_solved=0
    for bi,board in enumerate(BOARDS):
        hero_legal=legal(hero_entries,board)
        villain_legal=legal(villain_entries,board)
        pick_villain=sampler(villain_legal)
        board_i=[Card.new(c) for c in board]
        strategy=[];max_se=0.0

        for hero,weight in hero_legal:
            rng=random.Random(seed_for(bi,"".join(hero),SAMPLES))
            h_rank=rank(hero,board_i)
            used0=set(board)|set(hero)
            shares=[]
            for _ in range(SAMPLES):
                v1=pick_villain(rng,used0)
                if not v1:continue
                used1=used0|set(v1)
                v2=pick_villain(rng,used1)
                if not v2:continue
                r1=rank(v1,board_i);r2=rank(v2,board_i)
                best=min(h_rank,r1,r2)
                winners=(1 if h_rank==best else 0)+(1 if r1==best else 0)+(1 if r2==best else 0)
                shares.append((1.0/winners) if h_rank==best else 0.0)
            if len(shares)<int(SAMPLES*0.95):
                rejected.append({"board":bi,"hand":"".join(hero),"samples":len(shares)})
                continue
            n=len(shares);eq=sum(shares)/n
            var=sum((x-eq)**2 for x in shares)/(n-1) if n>1 else 0.0
            se=math.sqrt(var/n)
            max_se=max(max_se,se)
            final_pot=90.0
            call_cost=20.0
            call_ev=eq*final_pot-call_cost
            strategy.append(strategy_row(hero,call_ev,eq,se))

        if len(strategy)<min_board_hands:
            rejected.append({
              "board":bi,"reason":"insufficient_hero_exact_hands",
              "hands":len(strategy),"required":min_board_hands
            })
            continue

        positions=["UTG","HJ","CO","BTN","SB","BB"]
        spots.append({
          "id":f"multiway-river-{bi+1}",
          "solver":"STACKUP_MULTIWAY_RIVER_BR","version":"v1",
          "solveId":f"multiway-river|{bi+1}|{SAMPLES}",
          "convergence":{"method":"RIVER_RANGE_MONTE_CARLO_BEST_RESPONSE","samplesPerHand":SAMPLES,"maxEquitySE":max_se},
          "matchup":"CO + BTN vs BB",
          "scenario":{
            "gameType":"TOURNAMENT","street":"RIVER","tableSize":6,"trainingTableSize":6,
            "heroPosition":"BB","villainPosition":"CO","heroStack":20.0,"effectiveStack":20.0,
            "pot":70.0,"currentBet":20.0,"board":board,
            "heroRange":base["scenario"].get("heroRange"),
            "villainRange":base["scenario"].get("villainRange"),
            "actionHistory":[
              {"position":"CO","action":"ALL IN","kind":"jam","to":20.0,"street":"RIVER"},
              {"position":"BTN","action":"CALL","kind":"call","to":20.0,"street":"RIVER"}
            ],
            "positions":positions,"playerStacks":{p:20.0 for p in positions},
            "phase":"MIDDLE","fieldSize":"500","tournamentType":"REGULAR",
            "tags":["postflop_multiway"],
            "multiwayModel":{"players":3,"decision":"FOLD_OR_CALL","finalPotIfCallBb":90.0,"callCostBb":20.0},
            "provenance":{
              "strategySource":"STACKUP_MULTIWAY_RIVER_BR",
              "model":"TERMINAL_RIVER_RANGE_BR_V1",
              "rangeSource":base.get("solveId") or base.get("id"),
              "samplesPerHand":SAMPLES,"seedPolicy":"SHA256_BOARD_HAND"
            }
          },
          "strategy":strategy
        })
        total_solved+=len(strategy)

    if total_solved<2000:
        raise SystemExit(f"postflop_multiway below 2000 solved decisions: {total_solved}")
    payload={
      "schemaVersion":1,"generatedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
      "solver":"STACKUP_MULTIWAY_RIVER_BR","modelVersion":"v1","samplesPerHand":SAMPLES,
      "minHandsPerBoard":min_board_hands,
      "solvedPostflopMultiway":total_solved,"spots":spots,"rejected":rejected
    }
    OUT.write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    print({"rootScenarios":len(spots),"solvedPostflopMultiway":total_solved,"rejected":len(rejected)})

if __name__=="__main__":main()
