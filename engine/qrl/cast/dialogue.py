"""Turns research events into lines for the club (zh + en).

A *beat* is one line of the storyboard:
    {"who": "saki", "zh": "...", "en": "...", "face": "angry", "act": "angry",
     "emote": "anger", "shot": "vn"}

face  -> VN portrait expression: base joy angry shock sad special
act   -> chibi action:           idle think write present drink read type sig
                                 joy angry cry shock blush dizzy victory
emote -> balloon over the chibi: ! ? anger sweat sparkle heart zzz note idea gloom
shot  -> director hint:          wide (diorama bubble) | vn (dialogue box) |
                                 reveal (result card) | cutin (verdict stamp)

Every number in a line comes from the audit itself, never from the script.
"""
from __future__ import annotations

import random

from .characters import CAST

SOURCE = {
    "llm": ("灯的灵感", "Akari's idea"),
    "library": ("经典文献", "the literature"),
    "miner": ("遗传挖掘", "the genetic miner"),
    "refine": ("候补改良", "a refinement"),
    "boss": ("顾问的指示", "the Advisor's order"),
}

GATE_TEXT = {
    "parse": ("公式语法错误", "the formula doesn't parse"),
    "integrity": ("数据完整性不合格", "failed data integrity"),
    "signal": ("没有可交易的信号", "no tradable signal"),
    "evidence": ("证据不足（t 值太低）", "not enough evidence (t-stat too low)"),
    "consistency": ("前后两段不一致", "train and validation disagree"),
    "costs": ("成本吃掉了收益", "costs eat the edge"),
    "stability": ("收益不稳定", "unstable across years"),
    "deflation": ("没能跨过多重检验的门槛", "fails the multiple-testing bar"),
    "posterior": ("预期实盘夏普太低", "expected live Sharpe too low"),
    "novelty": ("和基金里已有的策略太像", "too similar to a fund member"),
    "survivorship": ("收益可能来自幸存者偏差", "returns may come from survivorship bias"),
    "lockbox": ("在保险箱数据上失效", "fails in the lockbox"),
}


def b(who, zh, en, face="base", act="idle", emote=None, shot="wide", **extra):
    return {"who": who, "zh": zh, "en": en, "face": face, "act": act, "emote": emote, "shot": shot, **extra}


def pick(rng, *opts):
    return rng.choice(opts)


def episode_start(n: int, source: str, rng: random.Random) -> list[dict]:
    s_zh, s_en = SOURCE.get(source, SOURCE["library"])
    return [pick(rng,
                 b("mio", f"第 {n} 次研究会议，开始。今天的提案来自{s_zh}。", f"Research meeting #{n}. Today's proposal comes from {s_en}.", "base", "present"),
                 b("mio", f"那么——第 {n} 轮。{s_zh}，请。", f"Well then — round {n}. {s_en.capitalize()}, go ahead.", "joy", "present"))]


def thinking(source: str, rng: random.Random, directive: str | None = None) -> list[dict]:
    if source == "llm":
        return [pick(rng,
                     b("akari", "等等……我好像想到了什么！", "Wait... I think I've got something!", "special", "think", "idea"),
                     b("akari", "我刚读到一篇论文，让我想想怎么写成公式！", "I just read a paper — let me turn it into a formula!", "joy", "write", "note"))]
    if source == "miner":
        return [b("ren", "让遗传算法跑一会儿……我先眯一下。", "Letting the genetic miner run... I'll nap meanwhile.", "special", "sig", "zzz")]
    if source == "refine":
        return [b("akari", "上次那个候补，只差一点点！我再改改！", "That reserve was so close! Let me tweak it!", "base", "write", "note")]
    if source == "boss":
        d = (directive or "")[:40]
        return [b("akari", f"顾问的指示收到！「{d}」", f"Advisor's order received! \"{d}\"", "joy", "joy", "!")]
    return [b("akari", "我去资料室翻翻经典文献！", "Off to the archive for the classics!", "base", "read", "note")]


def proposal(c: dict, rng: random.Random) -> list[dict]:
    t_zh = c.get("title_zh") or c.get("expr")
    t_en = c.get("title_en") or c.get("expr")
    out = [b("akari", f"我的假说是——「{t_zh}」！{c.get('thesis_zh') or ''}",
             f"My hypothesis: \"{t_en}\"! {c.get('thesis_en') or ''}", "special", "present", "sparkle", "vn",
             card="proposal")]
    if c.get("mechanism") == "statistical":
        out.append(b("iori", "没有经济逻辑的公式……先验夏普是零。你得拿出压倒性的证据。",
                     "A formula without an economic story... its prior Sharpe is zero. Bring overwhelming evidence.",
                     "special", "sig", None, "vn"))
    else:
        out.append(pick(rng,
                        b("iori", "哼……有故事的信号，至少值得我睁开右眼。", "Hmph... a signal with a story is worth opening my right eye for.", "special", "sig", None, "vn"),
                        b("saki", "先说好，成本和回撤我会一个一个查。", "Just so you know, I'll check every cost and drawdown.", "base", "write", None, "vn")))
    return out


def stage(st: dict, rng: random.Random) -> list[dict]:
    k, s = st["key"], st["status"]
    if k == "parse":
        if s == "fail":
            return [b("ren", f"……语法错了：{st.get('error')}", f"...Syntax error: {st.get('error')}", "angry", "type", "anger")]
        if st.get("duplicate_of"):
            return [b("shiori", "这个公式……以前测过了。重复的抽卡也会被计数。", "This formula... was tested before. Duplicate pulls still count.", "base", "read", "?")]
        return [b("ren", "公式编译通过。开始算。", "Formula compiles. Computing.", "base", "type")]
    if k == "integrity":
        if s == "fail":
            la = st.get("lookahead", {})
            if not la.get("ok", True):
                return [b("shiori", "这条信号……看到了未来。驳回。", "This signal... can see the future. Rejected.", "shock", "shock", "!", "vn")]
            return [b("shiori", f"数据覆盖只有 {st.get('coverage', 0):.0%}……太稀疏了。", f"Coverage is only {st.get('coverage', 0):.0%}... too sparse.", "sad", "read", "gloom")]
        return [pick(rng,
                     b("shiori", f"时间戳对齐完毕。前视模糊测试：通过。覆盖率 {st.get('coverage', 0):.0%}。", f"Timestamps aligned. Look-ahead fuzz test: passed. Coverage {st.get('coverage', 0):.0%}.", "base", "sig"),
                     b("shiori", "我把历史截断了两次重算……过去没有变。它没有偷看未来。", "I truncated history twice and recomputed... the past didn't change. No peeking.", "base", "sig"))]
    if k == "signal":
        ic = (st.get("ic") or {}).get(21) or (st.get("ic") or {}).get("21")
        if not ic:
            return []
        good = ic["t"] >= 2
        return [b("akari", f"IC 均值 {ic['mean']:.3f}，t 值 {ic['t']:.1f}！" + ("五分位几乎单调！" if st.get("monotonic", 0) > 0.8 else ""),
                  f"Mean IC {ic['mean']:.3f}, t = {ic['t']:.1f}!" + (" Quintiles nearly monotonic!" if st.get("monotonic", 0) > 0.8 else ""),
                  "joy" if good else "sad", "joy" if good else "think", "sparkle" if good else "sweat")]
    if k == "backtest":
        sr, g = st.get("sharpe", 0), st.get("gross_sharpe", 0)
        face = "joy" if sr > 0.5 else ("base" if sr > 0 else "sad")
        return [b("ren", f"跑完了。扣成本后夏普 {sr:.2f}（毛 {g:.2f}），最大回撤 {st.get('max_dd', 0):.0%}。",
                  f"Done. Net Sharpe {sr:.2f} (gross {g:.2f}), max drawdown {st.get('max_dd', 0):.0%}.",
                  face, "type", "!" if sr > 0.5 else None, "reveal", card="backtest")]
    if k == "risk":
        flags = st.get("flags", [])
        keep = st.get("cost_keep", 0)
        if "costs" in flags:
            return [b("saki", f"成本！换手 {st.get('turnover', 0):.0f} 倍/年，吃掉了 {max(0, 1 - keep):.0%} 的收益！这种策略我绝对不签字！",
                      f"Costs! {st.get('turnover', 0):.0f}x turnover a year eats {max(0, 1 - keep):.0%} of the edge! I will NOT sign this!",
                      "angry", "sig", "anger", "vn")]
        if "one_year_wonder" in flags:
            return [b("saki", "去掉最好的那一年就不赚钱了——这是一年奇迹，不是策略！", "Drop its best year and it stops making money — a one-year wonder, not a strategy!", "angry", "angry", "anger", "vn")]
        if "drawdown" in flags:
            return [b("saki", f"最大回撤 {st.get('max_dd', 0):.0%}……你想让顾问睡不着吗？", f"A {st.get('max_dd', 0):.0%} drawdown... do you want the Advisor losing sleep?", "angry", "write", "sweat", "vn")]
        if "stability" in flags:
            return [b("saki", f"只有 {st.get('pos_years', 0):.0%} 的年份赚钱。不够稳。", f"Only {st.get('pos_years', 0):.0%} of years are positive. Not stable enough.", "base", "write", "sweat")]
        return [pick(rng,
                     b("saki", f"成本 {st.get('cost_bps', 0):.0f}bp/年，回撤 {st.get('max_dd', 0):.0%}……哼，勉强合格。才、才不是在夸你！",
                       f"Costs {st.get('cost_bps', 0):.0f}bp/yr, drawdown {st.get('max_dd', 0):.0%}... hmph, acceptable. N-not that I'm praising you!",
                       "special", "blush", "heart", "vn"),
                     b("saki", "风控这关……过了。别得意忘形。", "Risk review... passed. Don't get cocky.", "special", "write", None, "vn"))]
    if k == "skeptic":
        post = st.get("posterior", {})
        lines = [b("iori", f"这是研究部的第 {st.get('trials', 0)} 抽。经验贝叶斯把它收缩了 {post.get('shrink', 0):.0%}——预期实盘夏普只剩 {post.get('mean', 0):.2f}。",
                   f"This is the club's pull #{st.get('trials', 0)}. Empirical Bayes shrinks it {post.get('shrink', 0):.0%} — expected live Sharpe: {post.get('mean', 0):.2f}.",
                   "special", "sig", None, "vn", card="skeptic")]
        attr = st.get("attribution") or {}
        loads = attr.get("loadings") or {}
        big = [f for f, v in loads.items() if f != "MKT" and abs(v.get("t", 0)) > 8 and abs(v.get("beta", 0)) > 0.4]
        if big:
            f = big[0]
            lines.append(b("iori", f"我的右眼看穿了……它不过是穿了马甲的 {f} 因子。", f"My right eye sees through it... just the {f} factor in disguise.", "special", "sig", "!", "vn"))
        if st.get("size_tilt"):
            lines.append(b("iori", "它押的是小而冷门的股票……可惜那些后来消失的公司，根本不在我们的数据里。幸存者的亡魂在替它说话。",
                           "It leans on small, quiet stocks... and the ones that later vanished aren't in our data. The ghosts of survivorship are speaking for it.",
                           "special", "sig", "gloom", "vn"))
        if st["status"] == "fail":
            lines.append(b("iori", "多重检验的诅咒……它没能逃脱。", "The curse of multiple testing... it could not escape.", "joy", "sig", "gloom", "vn"))
        elif st.get("pool_corr", 0) > 0.7:
            lines.append(b("iori", "和基金里的某位成员长得太像了。双胞胎不需要两个席位。", "It looks too much like a fund member. Twins don't need two seats.", "special", "read", "?", "vn"))
        return lines
    if k == "verdict":
        v = st["status"]
        tier = st.get("tier", "N")
        if v == "promote":
            return [b("mio", f"采用。编入基金——稀有度 {tier}。", f"Adopted. Into the fund — rarity {tier}.", "joy", "present", "sparkle", "cutin", stamp="adopt", tier=tier)]
        if v == "reserve":
            soft = st.get("soft_fail") or []
            why = GATE_TEXT.get(soft[0], ("", ""))if soft else ("", "")
            return [b("mio", f"保留为候补。{why[0]}。", f"Kept in reserve. {why[1].capitalize()}.", "base", "write", None, "cutin", stamp="reserve", tier=tier)]
        hard = st.get("hard_fail") or ["evidence"]
        why = GATE_TEXT.get(hard[0], GATE_TEXT["evidence"])
        return [b("mio", f"驳回。理由：{why[0]}。", f"Rejected. Reason: {why[1]}.", "special", "sig", None, "cutin", stamp="reject", tier=tier)]
    return []


def reaction(verdict: str, tier: str, rng: random.Random, lockbox_fail: bool = False) -> list[dict]:
    if lockbox_fail:
        return [b("shiori", "保险箱里的最近两年……它失效了。回测再漂亮也没用。", "The last two years in the lockbox... it broke. A pretty backtest means nothing.", "shock", "shock", "!", "vn"),
                b("akari", "呜……明明前面都过了……", "Waah... it passed everything else...", "sad", "cry", "gloom")]
    if verdict == "promote":
        out = [b("akari", "太好了——！我的假说活下来了！", "Yesss! My hypothesis survived!", "joy", "joy", "heart")]
        if tier in ("SR", "SSR"):
            out.append(b("ren", "……稀有度这么高，罕见。今晚不睡了。", "...A rarity this high is rare. No sleep tonight.", "joy", "victory", "sparkle"))
        return out
    if verdict == "reserve":
        return [b("akari", "就差一点！我会让它变得更独特的！", "So close! I'll make it more unique!", "base", "think", "sweat")]
    return [pick(rng,
                 b("akari", "呜……下次一定！", "Waah... next time for sure!", "sad", "cry", "gloom"),
                 b("akari", "被驳回了……但我学到了东西！记下来！", "Rejected... but I learned something! Writing it down!", "sad", "write", "sweat"),
                 b("ren", "……别哭。下一个会更好。", "...Don't cry. The next one will be better.", "base", "idle", None))]


def lesson_text(family: str | None, verdict: str, reasons: list[dict]) -> tuple[str, str]:
    failed = [r["gate"] for r in reasons if not r.get("pass")]
    if verdict == "promote":
        return f"{family or '新信号'}：通过全部门槛。", f"{family or 'new signal'}: passed every gate."
    g = failed[0] if failed else "evidence"
    z, e = GATE_TEXT.get(g, GATE_TEXT["evidence"])
    return f"{family or '新信号'}：{z}。", f"{family or 'new signal'}: {e}."


def idle_chatter(rng: random.Random) -> list[dict]:
    pool = [
        [b("ren", "……有人看见我的能量饮料了吗。", "...Has anyone seen my energy drink.", "special", "drink", "?"),
         b("shiori", "在你左手。", "In your left hand.", "base", "read")],
        [b("akari", "顾问！今天市场怎么样？", "Advisor! How's the market today?", "joy", "joy", "!"),
         b("mio", "别盯盘，灯。我们做的是几年尺度的研究。", "Don't stare at ticks, Akari. We research on a years-long horizon.", "base", "drink")],
        [b("iori", "你知道吗？每一次回测，都是在向过拟合之魔献祭。", "Did you know? Every backtest is an offering to the demon of overfitting.", "special", "sig", None),
         b("saki", "说人话。", "Speak like a human.", "angry", "angry", "anger")],
        [b("saki", "我、我只是顺路买了咖啡而已，才不是给你们的！", "I-I just happened to buy coffee, it's not for you guys!", "special", "blush", "heart"),
         b("akari", "谢谢纱季学姐！", "Thank you, Saki!", "joy", "joy", "heart")],
        [b("shiori", "……幸存者偏差。消失的公司不会出现在数据里。", "...Survivorship bias. Companies that vanished never show up in the data.", "base", "read"),
         b("iori", "被遗忘的亡魂啊……", "The forgotten souls...", "special", "sig")],
        [b("mio", "一个策略的价值，是它让基金变得更好了多少。", "A strategy is worth how much better it makes the fund.", "base", "drink"),
         b("akari", "记下来！组合为王！", "Writing it down! Portfolio first!", "joy", "write", "note")],
        [b("ren", "zzz……", "zzz...", "special", "sig", "zzz")],
        [b("akari", "抽卡次数越多，门槛越高……这游戏好难！", "The more pulls, the higher the bar... this game is hard!", "sad", "think", "sweat"),
         b("iori", "市场没有保底。", "The market has no pity system.", "special", "sig")],
    ]
    return rng.choice(pool)


def interaction(who: str, kind: str, rng: random.Random) -> dict:
    c = CAST[who]
    if kind == "pat":
        lines = {
            "akari": ("诶嘿嘿……顾问，我会想出更好的假说的！", "Ehehe... Advisor, I'll come up with even better hypotheses!"),
            "shiori": ("……数据显示，我的心率上升了 12%。", "...Data shows my heart rate rose 12%."),
            "ren": ("……再摸一下我就要睡着了。", "...One more pat and I'll fall asleep."),
            "saki": ("你、你干什么！……下不为例。", "Wh-what are you doing! ...Just this once."),
            "iori": ("吾之封印……竟被如此温柔地触碰……", "My seal... touched so gently..."),
            "mio": ("呵呵，顾问今天心情很好呢。", "Ara, the Advisor is in a good mood today."),
        }
        z, e = lines[who]
        return b(who, z, e, "special" if who in ("shiori", "saki") else "joy", "blush", "heart")
    lines = {
        "akari": ("好痛！……我、我会更严谨的！", "Ow! ...I-I'll be more rigorous!"),
        "shiori": ("……记录：被敲。原因不明。", "...Logged: bonked. Reason unknown."),
        "ren": ("醒了醒了……", "I'm awake, I'm awake..."),
        "saki": ("哈？！……好，那我审查得更严格！", "Huh?! ...Fine, I'll review even stricter!"),
        "iori": ("这点疼痛……不过是觉醒的前奏！", "This pain... merely the prelude to my awakening!"),
        "mio": ("……顾问，下次请提前预约。", "...Advisor, please book an appointment next time."),
    }
    z, e = lines[who]
    return b(who, z, e, "angry" if who != "mio" else "special", "dizzy", "anger")
