"""Command line: ``qrl serve`` · ``qrl data fetch <universe>`` · ``qrl eval "<expr>"``."""
from __future__ import annotations

import argparse
import json
import sys


def _fetch(args):
    from .data.universe import SPECS, fetch_universe

    names = list(SPECS) if args.universe == "all" else [args.universe]
    for n in names:
        last = [0]

        def prog(done, total, t):
            pct = int(100 * done / total)
            if pct != last[0]:
                last[0] = pct
                print(f"\r[{n}] {done}/{total} {t:<8}", end="", file=sys.stderr, flush=True)

        out = fetch_universe(n, progress=prog)
        print(f"\n[{n}] {json.dumps(out)}", file=sys.stderr)


def _eval(args):
    from .research.evaluate import evaluate_expression

    res = evaluate_expression(args.expr, universe=args.universe, mode=args.mode)
    print(json.dumps(res.summary(), indent=2, ensure_ascii=False, default=str))


def _serve(args):
    import uvicorn

    uvicorn.run("qrl.server.app:app", host=args.host, port=args.port, log_level="info")


def main(argv=None):
    p = argparse.ArgumentParser(prog="qrl")
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("data")
    dsub = d.add_subparsers(dest="dcmd", required=True)
    f = dsub.add_parser("fetch")
    f.add_argument("universe", default="all", nargs="?")
    f.set_defaults(fn=_fetch)
    e = sub.add_parser("eval")
    e.add_argument("expr")
    e.add_argument("--universe", default="us")
    e.add_argument("--mode", default="long_short")
    e.set_defaults(fn=_eval)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8765)
    s.set_defaults(fn=_serve)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
