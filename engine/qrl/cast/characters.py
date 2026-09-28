"""The Quant Research Club of Stellar Orbit Academy (星轨学园 · 量化研究部).

Six members, one job each in the research pipeline. The player is the club's
faculty Advisor (顾问).
"""

CAST = {
    "akari": {
        "zh": "星野灯", "en": "Hoshino Akari", "short_zh": "灯", "short_en": "Akari",
        "role_zh": "假说研究员", "role_en": "Hypothesis Researcher", "color": "#FF8A3D",
        "grade_zh": "一年级", "grade_en": "1st year",
        "bio_zh": "元气满满的一年级生，每天读论文、刷新闻，脑子里永远有下一个假说。对自己的点子过于执着，被驳回会哭，但第二天又会带着新想法冲进部室。",
        "bio_en": "A first-year who reads papers and news all day and always has the next hypothesis. Gets too attached to her ideas; cries when rejected, bursts in with a new one the next morning.",
        "motto_zh": "我有个假说！", "motto_en": "I've got a hypothesis!",
        "special": "spark",
    },
    "shiori": {
        "zh": "白石栞", "en": "Shiraishi Shiori", "short_zh": "栞", "short_en": "Shiori",
        "role_zh": "数据管理员", "role_en": "Data Keeper", "color": "#A78BFA",
        "grade_zh": "二年级", "grade_en": "2nd year",
        "bio_zh": "沉默寡言的数据管理员，随身带着一块旧怀表。对时间戳有近乎偏执的执念——任何偷看未来的信号都逃不过她的前视测试。",
        "bio_en": "A quiet data keeper with an antique pocket watch, obsessive about timestamps. No signal that peeks at the future gets past her look-ahead test.",
        "motto_zh": "……这条数据，来自未来。", "motto_en": "...This data point is from the future.",
        "special": "fluster",
    },
    "ren": {
        "zh": "九条莲", "en": "Kujo Ren", "short_zh": "莲", "short_en": "Ren",
        "role_zh": "回测工程师", "role_en": "Backtest Engineer", "color": "#3B82F6",
        "grade_zh": "二年级", "grade_en": "2nd year",
        "bio_zh": "靠能量饮料续命的天才工程师，永远睡不醒。回测引擎是他写的：次日开盘成交、点差、冲击成本、融券费，一个都不少。喜欢猫。",
        "bio_en": "A genius engineer running on energy drinks, permanently sleepy. He wrote the backtester: next-open fills, spread, impact, borrow — nothing skipped. Likes cats.",
        "motto_zh": "跑完了。……我去睡了。", "motto_en": "It ran. ...I'm going to sleep.",
        "special": "yawn",
    },
    "saki": {
        "zh": "绯村纱季", "en": "Himura Saki", "short_zh": "纱季", "short_en": "Saki",
        "role_zh": "风控官", "role_en": "Risk Officer", "color": "#EF4444",
        "grade_zh": "二年级", "grade_en": "2nd year",
        "bio_zh": "风纪委员出身的风控官，腰间别着一枚红色印章。成本、回撤、容量、稳定性——不合格的策略一律盖章驳回。嘴上很凶，其实只是不想看大家亏钱。",
        "bio_en": "A former disciplinary-committee member with a red stamp at her hip. Costs, drawdown, capacity, stability — anything that fails gets stamped. Harsh words; she just doesn't want anyone to lose money.",
        "motto_zh": "成本！你算成本了吗！", "motto_en": "Costs! Did you even count the costs?!",
        "special": "tsun",
    },
    "iori": {
        "zh": "黑羽伊织", "en": "Kurobane Iori", "short_zh": "伊织", "short_en": "Iori",
        "role_zh": "统计审查官", "role_en": "Statistics Skeptic", "color": "#D4A017",
        "grade_zh": "三年级", "grade_en": "3rd year",
        "bio_zh": "自称能用右眼看穿过拟合的中二病学长。说话夸张，但他的每一句都有数学支撑：收缩夏普、紧缩夏普、多重检验、因子归因。",
        "bio_en": "A chuunibyou senior who claims his right eye sees through overfitting. Dramatic, but every line is backed by math: shrunk Sharpe, deflated Sharpe, multiple testing, factor attribution.",
        "motto_zh": "多重检验的诅咒……又吞噬了一个灵魂。", "motto_en": "The curse of multiple testing claims another soul.",
        "special": "smug",
    },
    "mio": {
        "zh": "水无月澪", "en": "Minazuki Mio", "short_zh": "澪", "short_en": "Mio",
        "role_zh": "部长 · 组合经理", "role_en": "President · Portfolio Manager", "color": "#14B8A6",
        "grade_zh": "三年级", "grade_en": "3rd year",
        "bio_zh": "从容优雅的部长，掌管部费基金。只看一件事：这个策略加进组合后，基金是不是更好了。温柔的笑容下是毫不留情的决断。",
        "bio_en": "The composed club president who runs the club fund. She asks one thing: does the fund get better with this strategy in it? A gentle smile over merciless decisions.",
        "motto_zh": "数字不会说谎——但会撒娇。", "motto_en": "Numbers don't lie — but they do flirt.",
        "special": "serious",
    },
}

ORDER = ["akari", "shiori", "ren", "saki", "iori", "mio"]
