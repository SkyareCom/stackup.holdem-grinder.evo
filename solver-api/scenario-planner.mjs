const API_URL="https://api.openai.com/v1/responses";
const MODEL=process.env.OPENAI_SCENARIO_MODEL||"gpt-5.6-luna";
const API_KEY=process.env.OPENAI_API_KEY||"";
const TIMEOUT_MS=Math.max(1500,Number(process.env.STACKUP_AI_TIMEOUT_MS||9000));

const POSITIONS=["SB","BB","UTG","UTG+1","UTG+2","LJ","HJ","CO","BTN"];
const STREETS=["PRE-FLOP","FLOP","TURN","RIVER"];
const POT_TYPES=["UNOPENED","LIMPED","SRP","3BET","4BET","MULTIWAY"];
const TEXTURES=["DRY","CONNECTED","PAIRED","MONOTONE","TWOTONE","HIGH_CARD","LOW","DYNAMIC","STATIC"];
const PHASES=["EARLY","MIDDLE","BUBBLE","LATE","FINAL_TABLE"];
const TOURNAMENT_TYPES=["REGULAR","TURBO","PKO","FREEZEOUT","HIGH_ROLLER","SNG"];
const ACTIONS=["FOLD","CHECK","CALL","LIMP","BET","RAISE","3BET","4BET","ALL_IN"];

const cache=new Map();

function cleanStreet(v){
  const s=String(v||"").toUpperCase().replace("PREFLOP","PRE-FLOP");
  return STREETS.includes(s)?s:null;
}
function unique(a){return [...new Set((a||[]).filter(Boolean))];}
function firstSpecial(special){
  for(const [section,values] of Object.entries(special||{})){
    if(Array.isArray(values)&&values.length)return {section,id:String(values[0])};
  }
  return null;
}
function activeCard(filters){
  const sp=firstSpecial(filters.special);
  if(sp)return sp;
  if(filters.effectiveStacks?.length===1)return {section:"stack",id:String(filters.effectiveStacks[0])+"bb"};
  if(filters.phases?.length===1)return {section:"phase",id:String(filters.phases[0])};
  if(filters.heroPositions?.length===1)return {section:"pos",id:String(filters.heroPositions[0])};
  if(filters.streets?.length===1)return {section:"street",id:String(filters.streets[0]).toLowerCase().replace("pre-flop","pre")};
  if(filters.seats)return {section:"seats",id:String(filters.seats)};
  if(filters.tournamentType)return {section:"ttype",id:String(filters.tournamentType)};
  if(filters.fieldSize)return {section:"fsize",id:String(filters.fieldSize)};
  if(filters.opponentProfile)return {section:"fskill",id:String(filters.opponentProfile)};
  return {section:"mode",id:String(filters.gameType||"TOURNAMENT").toLowerCase()==="cash"?"cash":"mtt"};
}

function domain(filters,card){
  let positions=unique(filters.heroPositions?.length?filters.heroPositions:POSITIONS);
  let streets=unique((filters.streets?.length?filters.streets:STREETS).map(cleanStreet));
  let stacks=unique((filters.effectiveStacks||[]).map(Number).filter(Number.isFinite));
  if(!stacks.length)stacks=[5,8,10,12,15,18,20,25,30,40,50,75,100];

  if(["pre_special","blind_special","aggr_special","short_special","icm_special","pko_special"].includes(card.section))streets=["PRE-FLOP"];
  if(card.section==="river_special")streets=["RIVER"];
  if(card.id==="heads_up_2max")positions=["SB","BB"];
  if(card.id==="bb_ep"||card.id==="bb_mp"||card.id==="bb_lp"||card.id==="bb_limpers")positions=["BB"];
  if(card.id==="sb_ep"||card.id==="sb_mp"||card.id==="sb_cobtn"||card.id==="sb_limp_call"||card.id==="sb_limp_raise")positions=["SB"];
  if(card.id==="attack_cobtn"||card.id==="cobtn_vs_raise"||card.id==="cobtn")positions=["CO","BTN"];

  const stackBuckets={
    icm_5_8:[5,6,7,8],icm_9_12:[9,10,11,12],
    icm_13_18:[13,14,15,16,17,18],icm_19_25:[19,20,21,22,23,24,25]
  };
  if(stackBuckets[card.id])stacks=stackBuckets[card.id];
  const stackId=String(card.id).match(/^(\d+)bb$/i);
  if(stackId)stacks=[Number(stackId[1])];

  let phases=unique(filters.phases?.length?filters.phases:PHASES);
  if(card.id==="icm_bubble")phases=["BUBBLE"];
  if(card.id==="icm_final_table"||card.id==="icm_3handed")phases=["FINAL_TABLE"];

  return {card,positions,streets,stacks,phases};
}

function schemaFor(d){
  return {
    type:"object",
    properties:{
      heroPosition:{type:"string",enum:d.positions},
      villainPositions:{type:"array",items:{type:"string",enum:POSITIONS},minItems:1,maxItems:3},
      street:{type:"string",enum:d.streets},
      effectiveStack:{type:"number",enum:d.stacks},
      potType:{type:"string",enum:POT_TYPES},
      boardTexture:{anyOf:[{type:"string",enum:TEXTURES},{type:"null"}]},
      phase:{anyOf:[{type:"string",enum:d.phases},{type:"null"}]},
      tournamentType:{anyOf:[{type:"string",enum:TOURNAMENT_TYPES},{type:"null"}]},
      fieldSize:{anyOf:[{type:"string"},{type:"null"}]},
      opponentProfile:{anyOf:[{type:"string"},{type:"null"}]},
      actionHistory:{
        type:"array",maxItems:12,
        items:{
          type:"object",
          properties:{
            position:{type:"string",enum:POSITIONS},
            action:{type:"string",enum:ACTIONS},
            sizeBb:{anyOf:[{type:"number",minimum:0,maximum:200},{type:"null"}]}
          },
          required:["position","action","sizeBb"],
          additionalProperties:false
        }
      },
      targetSizingPct:{anyOf:[{type:"number",minimum:10,maximum:300},{type:"null"}]},
      scenarioTags:{type:"array",items:{type:"string"},maxItems:12}
    },
    required:[
      "heroPosition","villainPositions","street","effectiveStack","potType","boardTexture",
      "phase","tournamentType","fieldSize","opponentProfile","actionHistory","targetSizingPct","scenarioTags"
    ],
    additionalProperties:false
  };
}

function promptFor(d,recent=[]){
  return [
    "Você é o arquiteto de cenários do STACKUP HOLD'EM GRINDER, um treinador de No-Limit Hold'em.",
    "Crie UM contexto realista especificamente para o card de treino abaixo.",
    "Analise posições, ranges implícitos, stack efetivo, fase, tipo de pote e sequência de ações plausível.",
    "NÃO resolva a mão. NÃO forneça ação correta, estratégia, EV, equity ou frequências.",
    "O DCFR/ICM/PKO/motor matemático resolverá a decisão depois.",
    "Não invente valores fora do schema. Evite repetir estruturas recentes.",
    "CARD="+JSON.stringify(d.card),
    "DOMINIO="+JSON.stringify({
      heroPositions:d.positions,streets:d.streets,effectiveStacks:d.stacks,phases:d.phases,
      potTypes:POT_TYPES,boardTextures:TEXTURES
    }),
    recent?.length?"RECENTES="+JSON.stringify(recent.slice(-12)):""
  ].filter(Boolean).join("\n");
}

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text)return response.output_text;
  for(const item of response?.output||[]){
    for(const part of item?.content||[]){
      if(part?.type==="output_text"&&typeof part.text==="string")return part.text;
    }
  }
  return "";
}

function validate(plan,d){
  if(!plan||typeof plan!=="object"||Array.isArray(plan))return null;
  if(!d.positions.includes(plan.heroPosition))return null;
  if(!d.streets.includes(cleanStreet(plan.street)))return null;
  if(!d.stacks.some(x=>Math.abs(Number(x)-Number(plan.effectiveStack))<.001))return null;
  const villains=unique(plan.villainPositions);
  if(!villains.length||villains.some(v=>!POSITIONS.includes(v)||v===plan.heroPosition))return null;
  if(cleanStreet(plan.street)==="PRE-FLOP"&&plan.boardTexture!==null)return null;
  if(cleanStreet(plan.street)!=="PRE-FLOP"&&plan.boardTexture===null)return null;
  const history=Array.isArray(plan.actionHistory)?plan.actionHistory:[];
  if(history.some(e=>!POSITIONS.includes(e.position)||!ACTIONS.includes(e.action)))return null;
  return {
    ...plan,
    street:cleanStreet(plan.street),
    villainPositions:villains,
    cardKey:d.card.section+":"+d.card.id,
    provenance:"OPENAI_CONTEXT_ONLY",
    model:MODEL
  };
}

export function aiPlannerReady(){return !!API_KEY;}

export async function planScenario(filters,{recent=[]}={}){
  if(!API_KEY)return null;
  const card=activeCard(filters);
  const d=domain(filters,card);
  const key=JSON.stringify({card,d:{positions:d.positions,streets:d.streets,stacks:d.stacks,phases:d.phases},recent:recent.slice(-4)});
  if(cache.has(key))return cache.get(key);

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const response=await fetch(API_URL,{
      method:"POST",
      signal:controller.signal,
      headers:{
        "content-type":"application/json",
        "authorization":"Bearer "+API_KEY
      },
      body:JSON.stringify({
        model:MODEL,
        input:promptFor(d,recent),
        text:{
          format:{
            type:"json_schema",
            name:"stackup_scenario_context",
            strict:true,
            schema:schemaFor(d)
          }
        }
      })
    });
    if(!response.ok)throw new Error("ai_http_"+response.status);
    const data=await response.json();
    const text=outputText(data);
    if(!text)throw new Error("ai_output_empty");
    const plan=validate(JSON.parse(text),d);
    if(!plan)throw new Error("ai_plan_invalid");
    cache.set(key,plan);
    if(cache.size>128)cache.delete(cache.keys().next().value);
    return plan;
  }finally{
    clearTimeout(timer);
  }
}
