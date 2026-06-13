"""Resolve the trailer timeline from measured VO durations so nothing is ever
clipped. Writes work/timeline.json and prints the total length."""
import json
import os

def _find_root(p):
    p = os.path.dirname(os.path.abspath(p))
    while p != os.path.dirname(p):
        if os.path.exists(os.path.join(p, "package.json")):
            return p
        p = os.path.dirname(p)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = _find_root(__file__)
SPEC = os.environ.get("QRL_SPEC", os.path.join(ROOT, "work", "trailer_spec.json"))
VODUR = os.environ.get("QRL_VODUR", os.path.join(ROOT, "work", "audio", "vo_durations.json"))
TIMELINE = os.environ.get("QRL_TIMELINE", os.path.join(ROOT, "work", "timeline.json"))
spec = json.load(open(SPEC, encoding="utf-8"))
vodur = {d["id"]: d["dur"] for d in json.load(open(VODUR, encoding="utf-8-sig"))}

LEAD = 0.18   # silence before a VO line starts inside its segment
TAIL = 0.30   # breath after a VO line ends
# durations for VO-free segments
FIXED = {"s01": 4.2, "s16": 1.9, "s17": 0.9, "s18": 0.9}

timeline = []
t = 0.0
for seg in spec["segments"]:
    sid = seg["id"]
    vo = seg["vo"].strip()
    if vo:
        d = LEAD + vodur[sid] + TAIL
        vo_at = round(t + LEAD, 3)
    else:
        d = FIXED.get(sid, 1.5)
        vo_at = None
    d = round(d, 3)
    timeline.append({
        "id": sid,
        "source": seg["source"],
        "closeupOf": seg.get("closeupOf", ""),
        "title": seg["title"],
        "subtitle": seg["subtitle"],
        "transition": seg["transition"],
        "start": round(t, 3),
        "dur": d,
        "end": round(t + d, 3),
        "vo": vo,
        "voAt": vo_at,
        "voDur": vodur.get(sid, 0.0),
    })
    t += d

total = round(t, 3)
out = {"total": total, "fps": 30, "width": 1280, "height": 720, "segments": timeline}
json.dump(out, open(TIMELINE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
for s in timeline:
    print(f"{s['start']:>6.2f}-{s['end']:<6.2f} ({s['dur']:>4.1f}s) [{s['source']:<14}] {s['id']}")
print(f"TOTAL {total:.2f}s  ({int(total//60)}:{total%60:04.1f})")
