"""Generate reproducible, nonoverlapping opening splits for development and final testing."""
import argparse
import itertools
import json
import pathlib
import random
import re

HERE = pathlib.Path(__file__).resolve().parent


def key(state):
    homes = {}
    for row in state.strip().splitlines():
        m = re.fullmatch(r"\w+ \(([01]),\s*((?:[rygb][123]){2})\)\s*((?:[rygb]3)?)-((?:[rygb]3)?)", row.strip())
        if not m:
            raise ValueError(f"Not a two-home opening: {row}")
        p, stars, s0, s1 = m.groups()
        homes[int(p)] = (tuple(sorted(re.findall(r"..", stars))), s0 if p == "0" else s1)
    if set(homes) != {0, 1}:
        raise ValueError("Opening must include both players")
    # Reversed seats are the same opening, as are reordered binary stars.
    return tuple(sorted(homes.values()))


def generate(seed, counts, excluded):
    rng = random.Random(seed)
    homes = []
    for sizes in itertools.combinations("123", 2):
        for colors in itertools.permutations("rygb", 2):
            for ship in "rygb":
                if ship not in colors and "g" in (*colors, ship):
                    stars = "".join(c+s for c,s in zip(colors, sizes))
                    homes.append((stars, ship+"3"))
    # Each home has three different colors including green, two different
    # star sizes and one large ship. Each piece occurs at most twice total.
    eligible = []
    for a,b in itertools.combinations_with_replacement(homes,2):
        state=f"Alpha (0, {a[0]}) {a[1]}-\nBeta (1, {b[0]}) -{b[1]}\n"
        if key(state) not in excluded:
            eligible.append((a,b))
    rng.shuffle(eligible)
    if sum(counts.values())>len(eligible):
        raise ValueError("Not enough disjoint eligible openings")
    output={}
    cursor=0
    for name,n in counts.items():
        chosen=[]
        for a,b in eligible[cursor:cursor+n]:
            if rng.randrange(2):
                a,b=b,a
            chosen.append(f"Alpha (0, {a[0]}) {a[1]}-\nBeta (1, {b[0]}) -{b[1]}\n")
        output[name]=chosen
        cursor+=n
    keys=[key(s) for values in output.values() for s in values]
    assert len(set(keys))==len(keys) and not set(keys)&excluded
    return output


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--seed",type=int,default=20261121)
    p.add_argument("--train",type=int,default=24)
    p.add_argument("--validation",type=int,default=8)
    p.add_argument("--final",type=int,default=50)
    p.add_argument("--output",type=pathlib.Path,required=True)
    args=p.parse_args()
    counts={k:getattr(args,k) for k in ("train","validation","final")}
    if min(counts.values())<1:
        p.error("all split sizes must be positive")
    prior=HERE.parent/"tournaments/2026-10-25-quux-selfplay/protocol.json"
    historical=json.loads(prior.read_text())["openings"]
    previous=json.loads((HERE/"openings/pilot.json").read_text())
    excluded={key(s) for s in previous+[x["initial_state"] for x in historical]}
    openings=generate(args.seed,counts,excluded)
    args.output.mkdir(parents=True,exist_ok=False)
    for name,values in openings.items():
        (args.output/(name+".json")).write_text(json.dumps(values,indent=2)+"\n")
    (args.output/"manifest.json").write_text(json.dumps({
        "seed":args.seed,"counts":counts,"excluded_historical_and_pilot_keys":len(excluded),
        "method":"uniform shuffled sample without replacement; canonicalize reversed seats and star order; three different colors incl. green per home, distinct star sizes, large ship",
        "excluded_sources":["openings/pilot.json","../tournaments/2026-10-25-quux-selfplay/protocol.json"],
        "final_use":"held out until a candidate's weights are frozen"
    },indent=2)+"\n")
    print(counts)

if __name__=="__main__":
    main()
