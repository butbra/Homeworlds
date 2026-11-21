"""Run reproducible, paired complete-turn tournaments; never score failures as wins."""
import argparse
import collections
import concurrent.futures
import hashlib
import json
import pathlib
import platform
import subprocess
import time

HERE = pathlib.Path(__file__).resolve().parent
BOT = HERE / "build" / "hwbot"
BASELINE = "10,5,12,8,18,2,1,14,4,3"


def invoke(args, state, timeout):
    start = time.perf_counter()
    result = subprocess.run([str(BOT), *map(str, args)], input=state,
                            text=True, capture_output=True, timeout=timeout, check=True)
    data = json.loads(result.stdout)
    return data, (time.perf_counter() - start) * 1000


def game(index, state, first, engines, config):
    player = first
    original = state
    key, _ = invoke(["key", player], state, 5)
    seen = collections.Counter({key: 1})
    turns = []
    winner = None
    status = "turn_limit"
    error = None
    for _ in range(config["max_turns"]):
        engine = engines[player]
        args = ["quux", player] if engine == "quux" else [
            "choose", player, config["search_ms"], config["max_depth"], engine]
        if engine != "quux" and config.get("generated_limit", 0):
            args.append(config["generated_limit"])
        try:
            data, wall_ms = invoke(args, state, config["hard_timeout_ms"] / 1000)
        except subprocess.TimeoutExpired:
            status, error = "timeout", f"player {player}"
            break
        except (subprocess.CalledProcessError, ValueError, KeyError) as exc:
            status, error = "engine_error", f"player {player}: {exc}"
            if isinstance(exc, subprocess.CalledProcessError):
                error += f"; stderr: {exc.stderr}"
            break
        turns.append({"turn": len(turns)+1, "player": player,
                      "engine": engine, "wall_ms": wall_ms, **data})
        state = data["state"]
        if data["outcome"] != -1:
            status = "draw" if data["outcome"] == 2 else "win"
            winner = None if status == "draw" else data["outcome"]
            break
        player = 1-player
        seen[data["key"]] += 1
        if seen[data["key"]] >= 3:
            status = "repetition"
            break
    return {"game": index, "opening": original, "first": first, "engines": engines,
            "status": status, "winner": winner, "error": error, "length": len(turns),
            "turns": turns}


def run(args):
    config = {"search_ms": args.search_ms, "hard_timeout_ms": args.hard_timeout_ms,
              "max_depth": args.depth, "max_turns": args.max_turns, "workers": args.workers,
              "engines": [args.player0, args.player1],
              "opening_file": str(args.openings), "repetition": 3,
              "platform": platform.platform(), "python": platform.python_version(),
              "binary_sha256": hashlib.sha256(BOT.read_bytes()).hexdigest(),
              "referee": "native Quux ApplyMove::Whole; not independently replayed yet"}
    openings = json.loads(args.openings.read_text())
    schedule = [(2*i+first+1, state, first, config["engines"], config)
                for i, state in enumerate(openings) for first in (0, 1)]
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / "protocol.json").write_text(json.dumps({**config, "openings": openings}, indent=2)+"\n")
    start = time.perf_counter()
    games = []
    # Save each completed game immediately, so a stopped long run retains evidence.
    with (args.output / "games.jsonl").open("w") as stream:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(game,*params) for params in schedule]
            for future in concurrent.futures.as_completed(futures):
                match = future.result()
                games.append(match)
                stream.write(json.dumps(match)+"\n")
                stream.flush()
    games.sort(key=lambda g:g["game"])
    counts = collections.Counter(g["status"] for g in games)
    wins = [sum(g["winner"] == p for g in games) for p in range(2)]
    successful = [t for g in games for t in g["turns"]]
    stats = []
    for p in range(2):
        ts = [t for t in successful if t["player"] == p]
        avg = lambda k: sum(t[k] for t in ts)/len(ts) if ts else None
        stats.append({"player": p, "wins": wins[p], "successful_turns": len(ts),
                      "average_search_ms": avg("elapsed_ms"),
                      "average_depth": None if config["engines"][p]=="quux" else avg("depth"),
                      "average_nodes": None if config["engines"][p]=="quux" else avg("nodes")})
    summary = {"scheduled_games": len(schedule), "statuses": dict(counts),
               "player_stats": stats, "average_length": sum(g["length"] for g in games)/len(games),
               "wall_seconds": time.perf_counter()-start,
               "per_game": [{k:v for k,v in g.items() if k!="turns"} for g in games]}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2)+"\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openings", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--player0", default=BASELINE, help="ten comma-separated weights or quux")
    parser.add_argument("--player1", default="quux", help="ten comma-separated weights or quux")
    parser.add_argument("--search-ms", type=int, default=200)
    parser.add_argument("--hard-timeout-ms", type=int, default=250,
                        help="same outer timeout for both native processes")
    parser.add_argument("--depth", type=int, default=8)
    parser.add_argument("--max-turns", type=int, default=400)
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    if not 0 < args.search_ms < args.hard_timeout_ms or min(args.workers,args.depth,args.max_turns)<1:
        parser.error("positive settings required; search-ms must be below hard-timeout-ms")
    run(args)
