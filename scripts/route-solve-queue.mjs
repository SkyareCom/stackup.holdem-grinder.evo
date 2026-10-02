import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";

const ROOT=resolve(process.cwd());
const SOLVER=join(ROOT,"data","solver");
const registry=JSON.parse(await readFile(join(SOLVER,"engine-registry.json"),"utf8"));
const queue=JSON.parse(await readFile(join(SOLVER,"generation-queue.json"),"utf8"));

function match(pattern,key){
  if(pattern===key)return true;
  if(pattern.endsWith("/*"))return key.startsWith(pattern.slice(0,-1));
  return false;
}
function engineFor(key){
  for(const engine of registry.engines||[]){
    const excluded=(engine.excludes||[]).some(p=>match(p,key));
    if(excluded)continue;
    if((engine.handles||[]).some(p=>match(p,key)))return engine;
  }
  return null;
}

const items=(queue.items||[]).map(item=>{
  const engine=engineFor(item.key);
  return {
    ...item,
    engineId:engine?.id||null,
    workflow:engine?.workflow||null,
    generator:engine?.generator||null,
    routeStatus:!engine?"UNROUTED":engine.status==="ENGINE_REQUIRED"?"ENGINE_REQUIRED":"READY_TO_SOLVE"
  };
});

const workflows={};
for(const item of items){
  const key=item.workflow||"UNROUTED";
  (workflows[key]??=[]).push(item.key);
}
const unresolved=items.filter(x=>x.routeStatus!=="READY_TO_SOLVE");

const plan={
  generatedAt:new Date().toISOString(),
  mode:registry.mode,
  counts:{
    total:items.length,
    readyToSolve:items.filter(x=>x.routeStatus==="READY_TO_SOLVE").length,
    engineRequired:items.filter(x=>x.routeStatus==="ENGINE_REQUIRED").length,
    unrouted:items.filter(x=>x.routeStatus==="UNROUTED").length
  },
  workflows,
  unresolved,
  items
};

await writeFile(join(SOLVER,"solve-route-plan.json"),JSON.stringify(plan,null,2)+"\n","utf8");
console.log(JSON.stringify(plan.counts,null,2));
if(plan.counts.unrouted>0)process.exitCode=2;
