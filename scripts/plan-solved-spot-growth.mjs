import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";

const ROOT=resolve(process.cwd());
const SOLVER_DIR=join(ROOT,"data","solver");
const coverage=JSON.parse(await readFile(join(SOLVER_DIR,"coverage.json"),"utf8"));
const policy=JSON.parse(await readFile(join(SOLVER_DIR,"solved-spot-policy.json"),"utf8"));
const milestones=(policy.milestones||[1500,2000,5000,10000,20000]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);

function nextTarget(count){
  return milestones.find(m=>count<m)||milestones[milestones.length-1];
}
function stage(count){
  if(count<policy.publishFloor)return "RECOVERY_TO_PUBLISH";
  if(count<policy.currentGoal)return "BUILD_CURRENT_GOAL";
  if(count<(milestones[2]||5000))return "GROW_5000";
  if(count<(milestones[3]||10000))return "GROW_10000";
  if(count<(milestones[4]||20000))return "GROW_20000";
  return "MATURE";
}

const filters=(coverage.cards||[]).map(card=>{
  const solved=Number(card.validatedSolvedSpots??card.solvedSpots??card.available??0)||0;
  const target=nextTarget(solved);
  return {
    section:card.section,
    id:card.id,
    label:card.label,
    solved,
    publishFloor:Number(policy.publishFloor),
    currentGoal:Number(policy.currentGoal),
    nextTarget:target,
    shortfallToPublish:Math.max(0,Number(policy.publishFloor)-solved),
    shortfallToCurrentGoal:Math.max(0,Number(policy.currentGoal)-solved),
    shortfallToNextTarget:Math.max(0,target-solved),
    stage:stage(solved),
    priority:solved<policy.publishFloor?1:solved<policy.currentGoal?2:solved<5000?3:solved<10000?4:solved<20000?5:6
  };
}).sort((a,b)=>a.priority-b.priority||b.shortfallToPublish-a.shortfallToPublish||a.solved-b.solved);

const summary={
  generatedAt:new Date().toISOString(),
  policyVersion:policy.schemaVersion,
  strategy:policy.growth?.strategy||"DEFICIT_FIRST",
  publishFloor:policy.publishFloor,
  currentGoal:policy.currentGoal,
  longTermTarget:policy.growth?.longTermTargetPerFilter||20000,
  counts:{
    total:filters.length,
    belowPublish:filters.filter(x=>x.solved<policy.publishFloor).length,
    atOrAbovePublish:filters.filter(x=>x.solved>=policy.publishFloor).length,
    atOrAboveCurrentGoal:filters.filter(x=>x.solved>=policy.currentGoal).length,
    mature:filters.filter(x=>x.solved>=(policy.growth?.longTermTargetPerFilter||20000)).length
  },
  filters
};

await writeFile(join(SOLVER_DIR,"growth-plan.json"),JSON.stringify(summary,null,2)+"\n","utf8");
console.log(JSON.stringify(summary.counts,null,2));
