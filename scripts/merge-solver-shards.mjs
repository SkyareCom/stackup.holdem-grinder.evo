import {readFile,readdir,writeFile,mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";

const ROOT=resolve(process.cwd());
const INPUT=resolve(process.env.STACKUP_SHARD_INPUT||join(ROOT,".stackup","solver-shards"));
const OUT=join(ROOT,"data","solver");
const EXPECTED=Math.max(1,Number(process.env.STACKUP_SHARD_COUNT||6));

await mkdir(OUT,{recursive:true});

const files=await readdir(INPUT);
const shardFiles=files.filter(x=>/^postflop-shard-\d+\.json$/.test(x))
  .sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));
const manifestFiles=files.filter(x=>/^shard-manifest-\d+\.json$/.test(x))
  .sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));

if(shardFiles.length!==EXPECTED){
  throw new Error(`expected ${EXPECTED} postflop shards, found ${shardFiles.length}`);
}
if(manifestFiles.length!==EXPECTED){
  throw new Error(`expected ${EXPECTED} shard manifests, found ${manifestFiles.length}`);
}

const preflop=JSON.parse(await readFile(join(INPUT,"preflop.json"),"utf8"));
const shards=await Promise.all(shardFiles.map(async file=>JSON.parse(await readFile(join(INPUT,file),"utf8"))));
const manifests=await Promise.all(manifestFiles.map(async file=>JSON.parse(await readFile(join(INPUT,file),"utf8"))));

const spotMap=new Map();
for(const shard of shards){
  for(const spot of shard||[]){
    if(!spot?.id)continue;
    if(spotMap.has(spot.id))throw new Error("duplicate solver spot id: "+spot.id);
    spotMap.set(spot.id,spot);
  }
}
const postflop=[...spotMap.values()];

const matchupSet=new Set();
for(const manifest of manifests){
  for(const matchup of manifest?.postflop?.matchups||[])matchupSet.add(matchup);
}
const matchups=[...matchupSet];
const totalExpected=Math.max(...manifests.map(m=>Number(m?.postflop?.totalMatchups||0)));
if(totalExpected&&matchups.length!==totalExpected){
  throw new Error(`expected ${totalExpected} unique matchups, found ${matchups.length}`);
}

const template=manifests[0];
const manifest={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  solver:template.solver,
  preflop:{
    iterations:Number(template?.preflop?.iterations||0),
    spots:preflop.length,
    hands:preflop.reduce((n,s)=>n+(Array.isArray(s.strategy)?s.strategy.length:0),0),
    effectiveStackBb:Number(template?.preflop?.effectiveStackBb||100)
  },
  postflop:{
    iterations:Number(template?.postflop?.iterations||0),
    spots:postflop.length,
    matchupCount:matchups.length,
    matchups,
    potTypes:["SRP","3BET","4BET"],
    streets:["FLOP","TURN","RIVER"],
    boardsPerStreet:Number(template?.shard?.boardsPerStreet||1),
    shards:EXPECTED
  }
};

await writeFile(join(OUT,"preflop.json"),JSON.stringify(preflop),"utf8");
await writeFile(join(OUT,"postflop.json"),JSON.stringify(postflop),"utf8");
await writeFile(join(OUT,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");

console.log(JSON.stringify(manifest,null,2));
