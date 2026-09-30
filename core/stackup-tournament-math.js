/* STACKUP HOLD'EM — Tournament Math V1
   Exact Independent Chip Model (ICM) equities for up to 10 players via memoized
   subset recursion. No AI output is ever accepted as tournament equity. */
(function(global){
  'use strict';

  const EPS=1e-12;

  function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

  function normalizeStacks(stacks){
    const arr=(stacks||[]).map(v=>Math.max(0,num(v)));
    if(arr.length<2||arr.length>10)throw new Error('icm_player_count_must_be_2_to_10');
    if(arr.reduce((a,b)=>a+b,0)<=EPS)throw new Error('icm_total_chips_zero');
    return arr;
  }

  function normalizePayouts(payouts,n){
    const out=Array.from({length:n},(_,i)=>Math.max(0,num(payouts?.[i])));
    if(out.every(x=>x<=EPS))throw new Error('icm_payouts_zero');
    return out;
  }

  function popcount(x){
    let n=x>>>0,c=0;
    while(n){n&=n-1;c++;}
    return c;
  }

  // Exact ICM: at each finish position, each remaining player has probability
  // stack_i / total_remaining to occupy that position. Memoization by player mask
  // reduces the full permutation tree to O(n*2^n).
  function equities(stacksInput,payoutsInput){
    const stacks=normalizeStacks(stacksInput);
    const n=stacks.length;
    const payouts=normalizePayouts(payoutsInput,n);
    const full=(1<<n)-1;
    const memo=new Map();

    function solve(mask){
      if(mask===0)return new Float64Array(n);
      const cached=memo.get(mask);
      if(cached)return cached;

      const remaining=popcount(mask);
      const finishIndex=n-remaining;
      let total=0;
      for(let i=0;i<n;i++)if(mask&(1<<i))total+=stacks[i];

      const result=new Float64Array(n);
      if(total<=EPS){
        const alive=[];
        for(let i=0;i<n;i++)if(mask&(1<<i))alive.push(i);
        const share=alive.length?1/alive.length:0;
        for(const i of alive){
          result[i]+=payouts[finishIndex]*share;
          const child=solve(mask&~(1<<i));
          for(let j=0;j<n;j++)result[j]+=child[j]*share;
        }
      }else{
        for(let i=0;i<n;i++){
          if(!(mask&(1<<i)))continue;
          const p=stacks[i]/total;
          result[i]+=payouts[finishIndex]*p;
          const child=solve(mask&~(1<<i));
          for(let j=0;j<n;j++)result[j]+=child[j]*p;
        }
      }
      memo.set(mask,result);
      return result;
    }

    return Array.from(solve(full));
  }

  function withTransfer(stacks,from,to,amount){
    const out=[...stacks];
    const paid=Math.min(Math.max(0,num(amount)),out[from]);
    out[from]-=paid;
    out[to]+=paid;
    return out;
  }

  // Hero-villain all-in outcome where both can only exchange the effective risk.
  // Dead money remains represented in other players' stacks/chips if included there.
  function headsUpOutcome(stacksInput,heroIndex,villainIndex,risk){
    const stacks=normalizeStacks(stacksInput);
    const n=stacks.length;
    if(heroIndex<0||heroIndex>=n||villainIndex<0||villainIndex>=n||heroIndex===villainIndex){
      throw new Error('invalid_icm_players');
    }
    const r=Math.min(Math.max(0,num(risk)),stacks[heroIndex],stacks[villainIndex]);
    return {
      risk:r,
      win:withTransfer(stacks,villainIndex,heroIndex,r),
      lose:withTransfer(stacks,heroIndex,villainIndex,r),
      tie:[...stacks]
    };
  }

  function allInDecision({
    stacks,payouts,heroIndex,villainIndex,risk,
    winProbability,tieProbability=0,
    foldChipDelta=0
  }){
    const baseStacks=normalizeStacks(stacks);
    const n=baseStacks.length;
    const base=equities(baseStacks,payouts);
    const outcome=headsUpOutcome(baseStacks,heroIndex,villainIndex,risk);
    const winEq=equities(outcome.win,payouts);
    const loseEq=equities(outcome.lose,payouts);
    const tieEq=equities(outcome.tie,payouts);

    const pTie=clamp(num(tieProbability),0,1);
    const pWin=clamp(num(winProbability),0,1-pTie);
    const pLose=1-pWin-pTie;
    const callEv=pWin*winEq[heroIndex]+pLose*loseEq[heroIndex]+pTie*tieEq[heroIndex];

    let foldStacks=[...baseStacks];
    if(num(foldChipDelta)!==0){
      const delta=Math.max(-foldStacks[heroIndex],num(foldChipDelta));
      foldStacks[heroIndex]+=delta;
      // A negative fold delta is dead/committed money. It is intentionally not
      // gifted to an arbitrary opponent unless caller provides stacks already
      // reflecting the pot recipient.
    }
    const foldEq=equities(foldStacks,payouts)[heroIndex];

    const denom=winEq[heroIndex]-loseEq[heroIndex];
    const breakeven=denom>EPS
      ?clamp((foldEq-loseEq[heroIndex]-pTie*(tieEq[heroIndex]-loseEq[heroIndex]))/denom,0,1)
      :1;

    return Object.freeze({
      baseEquity:base[heroIndex],
      winEquity:winEq[heroIndex],
      loseEquity:loseEq[heroIndex],
      tieEquity:tieEq[heroIndex],
      foldEquity:foldEq,
      callEquity:callEv,
      icmDeltaCall:callEv-foldEq,
      breakevenWinProbability:breakeven,
      risk:outcome.risk,
      preferred:callEv>foldEq+1e-12?'CALL':callEv<foldEq-1e-12?'FOLD':'MIX'
    });
  }

  // Bubble factor = downside in prize equity / upside in prize equity for the
  // same chip swing. >1 means losing chips hurts more than winning them helps.
  function bubbleFactor({stacks,payouts,heroIndex,villainIndex,risk}){
    const baseStacks=normalizeStacks(stacks);
    const base=equities(baseStacks,payouts)[heroIndex];
    const out=headsUpOutcome(baseStacks,heroIndex,villainIndex,risk);
    const win=equities(out.win,payouts)[heroIndex];
    const lose=equities(out.lose,payouts)[heroIndex];
    const upside=Math.max(EPS,win-base);
    const downside=Math.max(0,base-lose);
    return Object.freeze({
      baseEquity:base,
      winEquity:win,
      loseEquity:lose,
      upside,
      downside,
      factor:downside/upside
    });
  }

  function riskPremium(args){
    const bf=bubbleFactor(args);
    // For a symmetric win/lose chip gamble with no dead money, chip-EV break-even
    // is 50%. ICM risk premium is the extra equity required over 50%.
    const required=bf.downside/(bf.downside+bf.upside);
    return Object.freeze({...bf,requiredWinProbability:required,riskPremium:required-.5});
  }

  // PKO helper: explicit monetary bounty value is added only to the branch in
  // which Hero eliminates a covered villain. This function does not guess a
  // bounty value; caller must supply the actual cash/prize-equity equivalent.
  function pkoAllInDecision({
    stacks,payouts,heroIndex,villainIndex,risk,
    winProbability,tieProbability=0,bountyPrizeValue=0,coversVillain=true
  }){
    const base=allInDecision({
      stacks,payouts,heroIndex,villainIndex,risk,winProbability,tieProbability
    });
    const pTie=clamp(num(tieProbability),0,1);
    const pWin=clamp(num(winProbability),0,1-pTie);
    const bounty=Math.max(0,num(bountyPrizeValue));
    const pkoEv=base.callEquity+(coversVillain?pWin*bounty:0);
    return Object.freeze({
      ...base,
      bountyPrizeValue:bounty,
      coversVillain:!!coversVillain,
      pkoCallEquity:pkoEv,
      pkoDeltaCall:pkoEv-base.foldEquity,
      preferred:pkoEv>base.foldEquity+1e-12?'CALL':pkoEv<base.foldEquity-1e-12?'FOLD':'MIX'
    });
  }

  global.StackUpTournamentMath=Object.freeze({
    equities,
    headsUpOutcome,
    allInDecision,
    bubbleFactor,
    riskPremium,
    pkoAllInDecision
  });
})(window);
