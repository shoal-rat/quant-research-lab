import { afterEach, describe, expect, it } from "vitest";
import { normalizeResearchedFamily } from "./strategyResearch";
import { getAllFamilies, getFamily, getResearchedFamilies, setResearchedFamilies, STRATEGY_FAMILIES } from "./strategyKnowledge";

afterEach(() => setResearchedFamilies([])); // keep the global registry clean between tests

const validRaw = {
  key: "idio-vol-discount",
  name: "Idiosyncratic Volatility Discount",
  factorKind: "low_volatility",
  rationaleKind: "behavioral",
  rationale: "High idiosyncratic vol names are overpriced lottery tickets and underperform.",
  construction: "Short the top idio-vol decile, long the bottom, rebalance monthly.",
  signalSpec: "idio_vol: negative residual stdev of daily returns vs the market over a 60-bar window.",
  holdingPeriods: [20],
  netSharpe: [0.3, 0.7],
  costSensitivity: "low",
  crowdingRisk: "medium",
  failureModes: ["Fails in junk rallies"],
  parameters: [{ name: "window", min: 20, max: 120, default: 60, step: 10 }],
  keyPapers: ["Ang, Hodrick, Xing, Zhang (2006)"],
  references: ["https://example.com/ang-2006"]
};

describe("strategy research", () => {
  it("normalizes a well-formed agent family into a full StrategyFamily", () => {
    const fam = normalizeResearchedFamily(validRaw, new Set());
    expect(fam).not.toBeNull();
    expect(fam!.key).toBe("idio-vol-discount".replace(/[^a-z0-9]+/g, "_"));
    expect(fam!.origin).toBe("researched");
    expect(fam!.bridgeOnly).toBe(true);
    expect(fam!.priceComputable).toBe(true);
    expect(fam!.signalSpec && fam!.signalSpec.length).toBeGreaterThan(8);
    expect(fam!.parameters.length).toBeGreaterThan(0);
    expect(fam!.references).toContain("https://example.com/ang-2006");
  });

  it("rejects families with no usable signal formula", () => {
    expect(normalizeResearchedFamily({ ...validRaw, signalSpec: "" }, new Set())).toBeNull();
    expect(normalizeResearchedFamily({ name: "x" }, new Set())).toBeNull();
    expect(normalizeResearchedFamily(null, new Set())).toBeNull();
  });

  it("falls back to a valid factorKind and never collides with built-in keys", () => {
    const weird = normalizeResearchedFamily({ ...validRaw, factorKind: "not_a_real_kind" }, new Set());
    expect(weird!.factorKind).toBe("momentum");
    const collide = normalizeResearchedFamily({ ...validRaw, key: "xs_momentum" }, new Set(["xs_momentum"]));
    expect(collide!.key).not.toBe("xs_momentum");
  });

  it("registers researched families into the global registry, built-ins win collisions", () => {
    const fam = normalizeResearchedFamily(validRaw, new Set())!;
    setResearchedFamilies([fam, { ...fam, key: "xs_momentum" }]);
    const all = getAllFamilies();
    expect(all.length).toBe(STRATEGY_FAMILIES.length + 1); // the xs_momentum collision is dropped
    expect(getResearchedFamilies().length).toBe(1);
    expect(getFamily(fam.key).key).toBe(fam.key);
    // a built-in is unchanged
    expect(getFamily("xs_momentum").name).toBe("Cross-Sectional Momentum");
  });
});
