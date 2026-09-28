"""The lab's investment doctrine and its library of return mechanisms.

Doctrine (the four rules every verdict is traced back to):

1. **Mechanism first.** A signal needs a reason to pay: compensation for risk,
   a predictable behavioral error protected by limits to arbitrage, or a
   structural friction (leverage constraints, liquidity provision, flows).
   Formulas without a story start from a zero-Sharpe prior.
2. **Bayesian skepticism.** A back-tested Sharpe is evidence, not a forecast.
   It is shrunk toward the population of everything the lab has tried; every
   extra attempt ("pull") raises the bar. Only the posterior — expected live
   Sharpe — ranks strategies.
3. **Implementation is the strategy.** Trade one bar late, pay spread, impact
   and borrow, respect capacity. A premium that exists only before costs does
   not exist.
4. **Portfolio, not heroes.** A strategy is worth what it adds to the fund
   (diversification, marginal Sharpe), not its standalone curve.
"""
from __future__ import annotations

from dataclasses import dataclass, field

MECHANISMS = {
    "risk_premium": {"prior": 0.30, "sd": 0.25, "zh": "风险溢价", "en": "Risk premium",
                     "desc_zh": "承担系统性风险的补偿——会在危机中亏钱，所以长期付钱。",
                     "desc_en": "Pay for bearing systematic risk; it hurts in crises, which is why it pays."},
    "behavioral": {"prior": 0.25, "sd": 0.25, "zh": "行为偏差", "en": "Behavioral",
                   "desc_zh": "投资者可预测的错误（反应不足、锚定、彩票偏好），受套利限制保护。",
                   "desc_en": "Predictable investor errors protected by limits to arbitrage."},
    "structural": {"prior": 0.30, "sd": 0.25, "zh": "结构性摩擦", "en": "Structural",
                   "desc_zh": "杠杆约束、流动性提供、资金流等制度性摩擦带来的收益。",
                   "desc_en": "Returns from leverage constraints, liquidity provision, and flows."},
    "statistical": {"prior": 0.0, "sd": 0.15, "zh": "纯统计规律", "en": "Statistical",
                    "desc_zh": "没有经济解释的数据规律——先验为零，要极强证据才能说服研究部。",
                    "desc_en": "A data pattern without a story: zero prior, needs overwhelming evidence."},
}


@dataclass
class Family:
    key: str
    zh: str
    en: str
    mechanism: str
    universe: str  # us | macro | sectors
    mode: str  # long_short | long_only | time_series
    templates: list[str]
    refs: list[str]
    story_zh: str
    story_en: str
    risk_zh: str = ""
    risk_en: str = ""
    neutralize: str | None = None
    rebalance: int | None = None
    tags: list[str] = field(default_factory=list)


FAMILIES: list[Family] = [
    Family("momentum", "截面动量", "Cross-sectional momentum", "behavioral", "us", "long_short",
           ["mom(252, 21)", "mom(126, 21)", "ts_decay(mom(252, 21), 10)"],
           ["Jegadeesh & Titman (1993)", "Asness, Moskowitz & Pedersen (2013)"],
           "过去一年的赢家继续赢：投资者对消息反应不足，信息慢慢扩散进价格。",
           "Past-year winners keep winning: investors underreact and news diffuses slowly.",
           "动量崩盘：熊市后的急反弹会让空头腿爆亏（Daniel & Moskowitz 2016）。",
           "Momentum crashes in sharp rebounds after bear markets (Daniel & Moskowitz 2016).",
           rebalance=21),
    Family("residual_momentum", "残差动量", "Residual momentum", "behavioral", "us", "long_short",
           ["resid_mom(252, 21)", "resid_mom(126, 21)"],
           ["Blitz, Huij & Martens (2011)", "Gutierrez & Pirinsky (2007)"],
           "剥掉市场贝塔后的个股动量：更纯的反应不足信号，崩盘风险小得多。",
           "Momentum in market-residual returns: purer underreaction with far smaller crashes.",
           "在单边牛市里跑输原始动量。", "Lags raw momentum in one-way bull markets.", rebalance=21),
    Family("industry_momentum", "行业动量", "Industry momentum", "behavioral", "us", "long_short",
           ["mom(126, 21) - group_demean(mom(126, 21))"],
           ["Moskowitz & Grinblatt (1999)"],
           "动量的很大一部分来自行业层面：行业消息扩散得更慢。",
           "Much of momentum lives at the industry level, where news diffuses slowly.",
           "行业集中度高，换手时成本大。", "Concentrated industry bets.", neutralize="market", rebalance=21),
    Family("reversal", "短期反转", "Short-term reversal", "structural", "us", "long_short",
           ["rev(5)", "rev(21)", "ts_decay(rev(5), 3)"],
           ["Jegadeesh (1990)", "Lehmann (1990)", "Nagel (2012)"],
           "为急于交易的人提供流动性：上周被抛售的股票会被买回来。",
           "Liquidity provision: last week's forced selling gets bought back.",
           "换手率极高，成本几乎吃光毛收益；危机中流动性溢价飙升也会亏。",
           "Very high turnover; costs eat most of the gross edge.", rebalance=5),
    Family("low_vol", "低波动异象", "Low volatility / betting against beta", "structural", "us", "long_short",
           ["-vol(252)", "-beta(252)", "-idio_vol(63)"],
           ["Ang, Hodrick, Xing & Zhang (2006)", "Frazzini & Pedersen (2014)", "Baker, Bradley & Wurgler (2011)"],
           "受杠杆约束的投资者追逐高贝塔股票，把它们推得太贵，低风险股票反而更划算。",
           "Leverage-constrained investors overpay for high-beta stocks; low risk earns more per unit risk.",
           "利率急升时低波动股票（类债券）会集体下跌。", "Bond-like low-vol stocks sell off when rates jump.",
           rebalance=21),
    Family("high52", "52 周新高锚定", "52-week-high anchoring", "behavioral", "us", "long_short",
           ["high52(252)"], ["George & Hwang (2004)"],
           "投资者把 52 周高点当锚，接近高点时不敢追，好消息被低估。",
           "Investors anchor on the 52-week high and underreact to good news near it.",
           rebalance=21),
    Family("lottery", "彩票偏好（MAX）", "Lottery demand (MAX)", "behavioral", "us", "long_short",
           ["-maxret(21)", "-ts_skew(returns, 63)"],
           ["Bali, Cakici & Whitelaw (2011)", "Amaya et al. (2015)"],
           "散户为'可能暴涨'的彩票型股票付出溢价，之后它们表现不佳。",
           "Investors overpay for lottery-like stocks, which then underperform.",
           rebalance=21),
    Family("seasonality", "同月季节性", "Return seasonality", "behavioral", "us", "long_short",
           ["seasonal(10)", "seasonal(5)"],
           ["Heston & Sadka (2008)", "Keloharju, Linnainmaa & Nyberg (2016)"],
           "股票在历年同一个月份的相对表现会重复出现。",
           "Stocks tend to repeat their relative performance in the same calendar month.",
           rebalance=21),
    Family("overnight", "隔夜-日内拉锯", "Overnight vs intraday tug of war", "structural", "us", "long_short",
           ["rank(overnight_ret(252)) - rank(intraday_ret(252))"],
           ["Lou, Polk & Skouras (2019)"],
           "隔夜与日内是两类不同的投资者，各自的收益会各自延续。",
           "Different clienteles trade overnight vs intraday; each leg's returns persist.",
           rebalance=21),
    Family("illiquidity", "非流动性溢价", "Illiquidity premium", "risk_premium", "us", "long_short",
           ["amihud(63)", "-log(ts_mean(dollar_volume, 63))"],
           ["Amihud (2002)", "Pastor & Stambaugh (2003)"],
           "持有难以交易的股票需要补偿。",
           "Holding hard-to-trade stocks demands compensation.",
           "流动性危机中亏损；且免费数据缺少已退市的小公司，回测会系统性高估它。",
           "Loses in liquidity crises; free data lacks delisted small names, so backtests overstate it.",
           rebalance=21),
    Family("tsmom", "时间序列动量", "Time-series momentum", "risk_premium", "macro", "time_series",
           ["tsmom(252)", "tsmom(126)", "(tsmom(63) + tsmom(126) + tsmom(252)) / 3"],
           ["Moskowitz, Ooi & Pedersen (2012)", "Hurst, Ooi & Pedersen (2017)"],
           "跨资产的趋势会延续：对冲需求与反应不足。一个世纪的数据都成立，且在危机中常常赚钱。",
           "Trends persist across asset classes for a century of data, often paying in crises.",
           "趋势反转、震荡市里反复止损。", "Whipsaws in choppy, trendless markets.", neutralize="none"),
    Family("trend_filter", "均线趋势过滤", "Moving-average trend filter", "behavioral", "macro", "time_series",
           ["where(close > ts_mean(close, 200), 1, 0)", "where(trend(210) > 0, 1, 0)"],
           ["Faber (2007)", "Brock, Lakonishok & LeBaron (1992)"],
           "价格在长期均线之上就持有，之下就回到现金：简单却能躲开大部分熊市。",
           "Hold above the long moving average, cash below: sidesteps most bear markets.",
           neutralize="none"),
    Family("risk_parity", "风险平价", "Risk parity", "risk_premium", "macro", "time_series",
           ["sign(close)"], ["Asness, Frazzini & Pedersen (2012)", "Qian (2005)"],
           "按风险而不是资金分配：低风险资产占比更高，组合更均衡。",
           "Allocate by risk, not dollars: a more balanced, diversified portfolio.",
           "股债同跌（如 2022）时失效。", "Fails when stocks and bonds fall together (2022).",
           neutralize="none"),
    Family("cross_asset_momentum", "跨资产轮动", "Cross-asset momentum rotation", "behavioral", "macro", "long_only",
           ["mom(252, 21)", "mom(126, 0)"],
           ["Asness, Moskowitz & Pedersen (2013)", "Faber (2010)"],
           "持有过去表现最强的几类资产，定期轮换。",
           "Hold the strongest asset classes, rotating periodically.", neutralize="none", rebalance=21),
    Family("sector_rotation", "行业轮动", "Sector rotation", "behavioral", "sectors", "long_only",
           ["mom(126, 21)", "resid_mom(126, 21)"],
           ["Moskowitz & Grinblatt (1999)", "Faber (2010)"],
           "持有近期最强的几个行业 ETF。", "Hold the strongest sector ETFs.", neutralize="none", rebalance=21),
    Family("vol_managed", "波动率管理", "Volatility-managed exposure", "structural", "macro", "time_series",
           ["inv(vol(21))", "where(trend(200) > 0, inv(vol(21)), 0)"],
           ["Moreira & Muir (2017)", "Harvey et al. (2018)"],
           "高波动期风险补偿并不同比例上升，所以高波动时降仓、低波动时加仓能提升夏普。",
           "Risk compensation doesn't rise with volatility, so de-risking in high vol lifts Sharpe.",
           neutralize="none"),
]

FAMILY_BY_KEY = {f.key: f for f in FAMILIES}


def doctrine(lang: str = "zh") -> list[dict]:
    if lang == "zh":
        return [
            {"k": "机制优先", "v": "每个信号必须说清楚'为什么会赚钱'：风险补偿、行为偏差或结构性摩擦。没有故事的公式先验夏普为 0。"},
            {"k": "贝叶斯怀疑", "v": "回测夏普只是证据，不是预测。它会被向研究部所有尝试的总体收缩——每多抽一次卡，门槛就更高。只有'预期实盘夏普'决定稀有度。"},
            {"k": "落地为王", "v": "信号次日开盘才能成交，付点差、冲击成本和融券费，尊重容量。只在成本前存在的溢价就是不存在。"},
            {"k": "组合为王", "v": "策略的价值是它给基金带来的边际贡献（分散化、边际夏普），不是它单独的漂亮曲线。"},
        ]
    return [
        {"k": "Mechanism first", "v": "Every signal must say why it pays: risk, behavior, or structure. Formulas without a story start at a zero-Sharpe prior."},
        {"k": "Bayesian skepticism", "v": "A backtested Sharpe is evidence, not a forecast. It is shrunk toward everything the lab has tried — every extra pull raises the bar. Only expected live Sharpe sets rarity."},
        {"k": "Implementation is the strategy", "v": "Trade at the next open, pay spread, impact and borrow, respect capacity. A premium that exists only before costs does not exist."},
        {"k": "Portfolio, not heroes", "v": "A strategy is worth its marginal contribution to the fund, not its standalone curve."},
    ]


def library_brief(universe: str | None = None) -> str:
    lines = []
    for f in FAMILIES:
        if universe and f.universe != universe:
            continue
        lines.append(f"- {f.key} [{f.mechanism}, {f.universe}/{f.mode}]: {f.story_en} e.g. {f.templates[0]} ({'; '.join(f.refs)})")
    return "\n".join(lines)
