import {writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {catalog,solvedPolicy,countCombination} from "./audit-scenario-coverage.mjs";

const OUT=join(resolve(process.cwd()),"data","solver","filter-combinations.json");
const TARGET=Number(solvedPolicy.currentGoal)||2000;
const FLOOR=Number(solvedPolicy.publishFloor)||1500;
const bySection=new Map();
for(const item of catalog.ALL){
  if(!bySection.has(item.section))bySection.set(item.section,[]);
  bySection.get(item.section).push(item);
}
const dimensions=["mode","seats","phase","pos","street","stack"];
const advanceSections=["pre_special","blind_special","aggr_special","short_special","icm_special","pko_special","post_special","river_special","texture_special","math_special"];
const combos=new Map();
const key=items=>items.map(x=>`${x.section}/${x.id}`).sort().join("+");
function add(items,kind){if(items.every(Boolean)&&!combos.has(key(items)))combos.set(key(items),{items,kind});}
function cross(sections,kind){
  const lists=sections.map(s=>bySection.get(s)||[]);
  if(lists.some(x=>!x.length))return;
  const walk=(i,acc)=>{if(i===lists.length){add(acc,kind);return;}for(const item of lists[i])walk(i+1,[...acc,item]);};
  walk(0,[]);
}
for(let i=0;i<dimensions.length;i++)for(let j=i+1;j<dimensions.length;j++)cross([dimensions[i],dimensions[j]],"core_pair");
cross(["mode","street","seats"],"mode_street_seats");
cross(["phase","pos","stack"],"phase_pos_stack");
cross(["seats","pos","street"],"seats_pos_street");
for(const section of advanceSections){
  for(const special of bySection.get(section)||[]){
    for(const mode of bySection.get("mode")||[])add([special,mode],"advance_mode");
    for(const seats of bySection.get("seats")||[])add([special,seats],"advance_seats");
  }
}
const rows=[];
for(const {items,kind} of combos.values()){
  const n=countCombination(items);
  rows.push({kind,key:key(items),filters:items.map(x=>({section:x.section,id:x.id,label:x.label})),validatedSolvedSpots:n,publishFloor:FLOOR,targetSpots:TARGET,deficitToPublish:Math.max(0,FLOOR-n),deficitToTarget:Math.max(0,TARGET-n),publishable:n>=FLOOR,atTarget:n>=TARGET});
}
rows.sort((a,b)=>b.deficitToTarget-a.deficitToTarget||a.validatedSolvedSpots-b.validatedSolvedSpots||a.key.localeCompare(b.key));
const summary={generatedAt:new Date().toISOString(),mode:"STRICT_SOLVED_ONLY",countingUnit:solvedPolicy.countingUnit,publishFloor:FLOOR,currentGoal:TARGET,totalCombinations:rows.length,empty:rows.filter(x=>x.validatedSolvedSpots===0).length,belowPublishFloor:rows.filter(x=>x.validatedSolvedSpots<FLOOR).length,publishable:rows.filter(x=>x.publishable).length,atTarget:rows.filter(x=>x.atTarget).length,rows};
await writeFile(OUT,JSON.stringify(summary,null,2)+"\n","utf8");
console.log(JSON.stringify({generatedAt:summary.generatedAt,totalCombinations:summary.totalCombinations,empty:summary.empty,belowPublishFloor:summary.belowPublishFloor,publishable:summary.publishable,atTarget:summary.atTarget},null,2));
