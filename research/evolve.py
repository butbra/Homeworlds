"""Competitive evolution of evaluation weights with a fixed validation opponent."""
import argparse
import collections
import concurrent.futures
import gzip
import hashlib
import itertools
import json
import math
import pathlib
import platform
import random
import time
from make_openings import key
from tournament import BASELINE, BOT, game

BASE = tuple(map(float, BASELINE.split(",")))
FEATURES = ("ships","fleet_pips","home_defenders","home_max_size","home_invasion",
            "local_color_access","mobility","catastrophe_safety","enemy_home_pressure","build_access")


def json_save(path, data):
    # Write a complete checkpoint before replacing the previous snapshot.
    temporary=path.with_suffix(path.suffix+".tmp")
    temporary.write_text(json.dumps(data,indent=2)+"\n")
    temporary.replace(path)


def normalize(weights):
    if len(weights)!=len(BASE) or any(not math.isfinite(w) or w<=0 for w in weights):
        raise ValueError("weights must be ten finite positive values")
    scale=sum(BASE)/sum(weights)
    return [round(w*scale,6) for w in weights]


def engine(weights):
    return ",".join(map(str,weights))


def individual(id, weights, parents=()):
    return {"id":id,"weights":weights,"parents":list(parents)}


def opening_matches(a,b,state,opening_id):
    # Four games per pairing: both assignments to the fixed homeworlds and
    # both starting players. Neither seat nor first mover is confounded.
    return [{"opening":state,"opening_id":opening_id,"first":first,
             "players":[x,y],"engines":[engine(x["weights"]),engine(y["weights"])]}
            for x,y in ((a,b),(b,a)) for first in (0,1)]


def play_schedule(schedule, cfg, path, workers):
    def play(task):
        i,m=task
        result=game(i,m["opening"],m["first"],m["engines"],cfg)
        result.update({"identities":[p["id"] for p in m["players"]],
                       "opening_id":m["opening_id"]})
        return result
    games=[]
    with gzip.open(path,"wt",encoding="utf-8") as stream:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            futures=[pool.submit(play,item) for item in enumerate(schedule,1)]
            for f in concurrent.futures.as_completed(futures):
                match=f.result()
                stream.write(json.dumps(match,separators=(",",":"))+"\n")
                stream.flush()
                games.append({k:v for k,v in match.items() if k!="turns"})
    return sorted(games,key=lambda g:g["game"])


def fitness(games, ids):
    stats={i:collections.Counter(scheduled=0,wins=0,losses=0,draw=0,repetition=0,
                                  turn_limit=0,timeout=0,engine_error=0,points=0.0)
           for i in ids}
    for g in games:
        for p,identity in enumerate(g["identities"]):
            if identity not in stats:
                continue
            s=stats[identity]
            s["scheduled"]+=1
            if g["status"]=="win":
                if g["winner"]==p:
                    s["wins"]+=1
                    s["points"]+=1
                else:
                    s["losses"]+=1
            else:
                s[g["status"]]+=1
                # Nondecisive stops have a neutral training reward, but stay
                # separate outcome categories in all reported statistics.
                if g["status"] in ("draw","repetition","turn_limit"):
                    s["points"]+=0.5
    out={}
    for i,s in stats.items():
        valid=s["scheduled"]-s["timeout"]-s["engine_error"]
        out[i]={**s,"valid":valid,"fitness":s["points"]/valid if valid else None}
    return out


def summarize(games):
    return {"games":len(games),"outcomes":dict(collections.Counter(g["status"] for g in games)),
            "turns":sum(g["length"] for g in games),
            "average_length":sum(g["length"] for g in games)/len(games)}


def run(args):
    rng=random.Random(args.seed)
    train=json.loads(args.train.read_text())
    valid=json.loads(args.validation.read_text())
    tk=[key(s) for s in train]; vk=[key(s) for s in valid]
    if len(set(tk))!=len(tk) or len(set(vk))!=len(vk) or set(tk)&set(vk):
        raise ValueError("Training and validation must be disjoint and duplicate-free")
    if args.train_openings>len(train) or args.validation_openings>len(valid):
        raise ValueError("Not enough openings")
    validation_ids=list(range(args.validation_openings))
    cfg={"search_ms":0,"generated_limit":args.generated_limit,"max_depth":args.depth,
         "hard_timeout_ms":args.timeout_ms,"max_turns":args.max_turns,"workers":args.workers}
    args.output.mkdir(parents=True,exist_ok=False)
    json_save(args.output/"protocol.json",{"seed":args.seed,"population":args.population,
        "generations":args.generations,"elites":args.elites,"mutation_probability":args.mutation,
        "mutation_sigma":args.sigma,"initial_sigma":args.initial_sigma,
        "features":FEATURES,"baseline":BASE,"train_openings_per_pair":args.train_openings,
        "validation_ids":validation_ids,"training_pool":train,"validation_pool":valid,
        "hall_of_fame":"most recent generation winner; baseline is always an opponent",
        "selection":"rank by average training points; ties by wins then id; champion by fixed validation points, retain earlier on tie",
        "fitness":"win 1, loss 0, natural draw/repetition/turn limit 0.5, errors/timeouts excluded; abort on any failure",
        "search":cfg,"binary_sha256":hashlib.sha256(BOT.read_bytes()).hexdigest(),
        "python":platform.python_version(),"platform":platform.platform()})
    base=individual("baseline",list(BASE))
    population=[individual(f"g000-c{i:03}",normalize([w*math.exp(rng.gauss(0,args.initial_sigma)) for w in BASE]))
                for i in range(args.population)]
    previous=None
    champion=None
    history=[]
    started=time.perf_counter()
    for gen in range(args.generations):
        directory=args.output/f"generation-{gen:03}"
        directory.mkdir()
        begin=time.perf_counter()
        train_ids=rng.sample(range(len(train)),args.train_openings)
        pairings=list(itertools.combinations(population,2))
        for member in population:
            pairings.append((member,base))
            if previous:
                pairings.append((member,previous))
        schedule=[m for a,b in pairings for oid in train_ids
                  for m in opening_matches(a,b,train[oid],oid)]
        json_save(directory/"population.json",{"generation":gen,"population":population,
                  "previous_winner":previous,"training_ids":train_ids})
        games=play_schedule(schedule,cfg,directory/"training.jsonl.gz",args.workers)
        scores=fitness(games,[m["id"] for m in population])
        json_save(directory/"training-summary.json",{"fitness":scores,"summary":summarize(games)})
        if any(g["status"] in ("timeout","engine_error") for g in games):
            raise RuntimeError(f"Generation {gen} had failures; raw games and summary saved, not ranking.")
        ranked=sorted(population,key=lambda m:(-scores[m["id"]]["fitness"],-scores[m["id"]]["wins"],m["id"]))
        winner=ranked[0]
        schedule=[m for oid in validation_ids for m in opening_matches(winner,base,valid[oid],oid)]
        games_v=play_schedule(schedule,cfg,directory/"validation.jsonl.gz",args.workers)
        score_v=fitness(games_v,[winner["id"]])[winner["id"]]
        json_save(directory/"validation-summary.json",{"candidate":winner,"fitness":score_v,
                                                       "summary":summarize(games_v)})
        if any(g["status"] in ("timeout","engine_error") for g in games_v):
            raise RuntimeError(f"Generation {gen} validation had failures; do not select champion.")
        if champion is None or score_v["fitness"]>champion["validation"]["fitness"]:
            champion={"generation":gen,"candidate":winner,"validation":score_v}
        json_save(args.output/"champion.json",champion)
        entry={"generation":gen,"winner":winner,"training":scores[winner["id"]],
               "training_summary":summarize(games),"validation":score_v,
               "validation_summary":summarize(games_v),
               "best_validation_fitness":champion["validation"]["fitness"],
               "wall_seconds":time.perf_counter()-begin}
        history.append(entry)
        json_save(args.output/"history.json",history)
        print(f"gen {gen}: training {scores[winner['id']]['fitness']:.3f}, validation {score_v['fitness']:.3f}, "
              f"train {entry['training_summary']['outcomes']}, validation {entry['validation_summary']['outcomes']}, "
              f"{entry['wall_seconds']:.1f}s",flush=True)
        # Archive before changing IDs: even elites have new generation IDs,
        # allowing a genome to play its own predecessor without mixing scores.
        previous=individual(f"archive-g{gen:03}",winner["weights"],[winner["id"]])
        elite=ranked[:args.elites]
        next_population=[individual(f"g{gen+1:03}-c{i:03}",m["weights"],[m["id"]])
                         for i,m in enumerate(elite)]
        while len(next_population)<args.population:
            a,b=rng.choice(elite),rng.choice(elite)
            w=[rng.choice((x,y))*math.exp(rng.gauss(0,args.sigma) if rng.random()<args.mutation else 0)
               for x,y in zip(a["weights"],b["weights"])]
            next_population.append(individual(f"g{gen+1:03}-c{len(next_population):03}",normalize(w),[a["id"],b["id"]]))
        population=next_population
        json_save(directory/"checkpoint.json",{"next_population":population,"archive":previous,
                                                "champion":champion,"rng_state":rng.getstate()})
    json_save(args.output/"summary.json",{"history":history,"champion":champion,
        "wall_seconds":time.perf_counter()-started,"completed_generations":len(history),
        "note":"Development training; validation is not a held-out final test."})


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--train",type=pathlib.Path,required=True)
    p.add_argument("--validation",type=pathlib.Path,required=True)
    p.add_argument("--output",type=pathlib.Path,required=True)
    p.add_argument("--seed",type=int,default=123)
    p.add_argument("--population",type=int,default=8)
    p.add_argument("--generations",type=int,default=5)
    p.add_argument("--elites",type=int,default=3)
    p.add_argument("--mutation",type=float,default=.2)
    p.add_argument("--sigma",type=float,default=.4)
    p.add_argument("--initial-sigma",type=float,default=.8)
    p.add_argument("--train-openings",type=int,default=1)
    p.add_argument("--validation-openings",type=int,default=2)
    p.add_argument("--generated-limit",type=int,default=3000)
    p.add_argument("--depth",type=int,default=8)
    p.add_argument("--max-turns",type=int,default=160)
    p.add_argument("--timeout-ms",type=int,default=5000)
    p.add_argument("--workers",type=int,default=4)
    args=p.parse_args()
    if not 2<=args.elites<args.population or min(args.generations,args.train_openings,args.validation_openings,
       args.generated_limit,args.depth,args.max_turns,args.timeout_ms,args.workers)<1 or not 0<args.mutation<=1 or min(args.sigma,args.initial_sigma)<=0:
        p.error("invalid population or search settings")
    run(args)
