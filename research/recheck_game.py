"""Rerun a specific archived game after a rule adapter fix, preserving original data."""
import argparse
import gzip
import hashlib
import json
import pathlib
import subprocess
from tournament import BOT, game

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("--source",type=pathlib.Path,required=True)
p.add_argument("--game",type=int,required=True)
p.add_argument("--protocol",type=pathlib.Path,required=True)
p.add_argument("--output",type=pathlib.Path,required=True)
args=p.parse_args()
if args.source.suffix==".gz":
    raw=gzip.open(args.source,"rt").read()
elif args.source.suffix==".zst":
    raw=subprocess.check_output(["zstd","-q","-dc",str(args.source)],text=True)
else:
    raw=args.source.read_text()
original=next(g for g in map(json.loads,raw.splitlines()) if g["game"]==args.game)
cfg=json.loads(args.protocol.read_text())["search"]
recheck=game(original["game"],original["opening"],original["first"],original["engines"],cfg)
recheck.update({k:original[k] for k in ("identities","opening_id") if k in original})
args.output.mkdir(parents=True,exist_ok=False)
with (args.output/"game.jsonl").open("x") as f:
    f.write(json.dumps(recheck)+"\n")
original_moves=[t["move"] for t in original["turns"]]
new_moves=[t["move"] for t in recheck["turns"]]
summary={"original_source":str(args.source),"game":args.game,
    "original_status":original["status"],"original_winner":original["winner"],
    "rechecked_status":recheck["status"],"rechecked_winner":recheck["winner"],
    "original_length":original["length"],"rechecked_length":recheck["length"],
    "unchanged_prior_moves":original_moves[:-1]==new_moves[:-1],
    "original_last_move":original_moves[-1],"rechecked_last_move":new_moves[-1],
    "binary_sha256":hashlib.sha256(BOT.read_bytes()).hexdigest()}
with (args.output/"summary.json").open("x") as f:
    json.dump(summary,f,indent=2); f.write("\n")
print(json.dumps(summary,indent=2))
