import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadValidator } from "./_engine-bridge.mjs";

const {
  DEFAULT_VALIDATION_TRIALS,
  MIN_VALIDATION_TRIALS,
  deploymentGateReasons,
  resolveValidationTrials,
  validateConfig,
  validateMomentum
} = await loadValidator();

const marketFile = fileURLToPath(new URL("../public/assets/data/market-real.json", import.meta.url));

function passingMetrics(overrides = {}) {
  return {
    oosSharpe: 1.2,
    fullSharpe: 1.3,
    returnAfterCosts: 0.08,
    deflatedSharpe: 0.8,
    oosICt: 1.6,
    oosICobs: 10,
    walkForwardPassRate: 0.75,
    randomBaselineSharpe: 0.1,
    maxDrawdown: -0.2,
    trials: DEFAULT_VALIDATION_TRIALS,
    ...overrides
  };
}

test("validation trials default conservatively and enforce a floor", () => {
  assert.equal(resolveValidationTrials(), DEFAULT_VALIDATION_TRIALS);
  assert.equal(resolveValidationTrials(1), MIN_VALIDATION_TRIALS);
  assert.equal(resolveValidationTrials(73.9), 73);
});

test("a deployment pass requires candidate status and the displayed HAC OOS IC evidence", () => {
  assert.deepEqual(deploymentGateReasons({ labStatus: "candidate", metrics: passingMetrics() }), []);

  const sparse = deploymentGateReasons({
    labStatus: "candidate",
    metrics: passingMetrics({ oosICobs: 9 })
  });
  assert.ok(sparse.some((reason) => reason.includes("OOS IC observations")));

  const weakHac = deploymentGateReasons({
    labStatus: "candidate",
    metrics: passingMetrics({ oosICt: 1.49 })
  });
  assert.ok(weakHac.some((reason) => reason.includes("HAC OOS IC t-stat")));
});

test("force waives only candidate status, never the direct HAC IC gate", () => {
  const blocked = deploymentGateReasons({ labStatus: "retest_needed", metrics: passingMetrics() });
  assert.ok(blocked.some((reason) => reason.includes("not candidate")));

  assert.deepEqual(deploymentGateReasons({ labStatus: "retest_needed", metrics: passingMetrics(), force: true }), []);
  const stillBlocked = deploymentGateReasons({
    labStatus: "retest_needed",
    metrics: passingMetrics({ oosICt: null }),
    force: true
  });
  assert.ok(stillBlocked.some((reason) => reason.includes("HAC OOS IC t-stat")));
});

test("both public validators execute end to end on the bundled market data", () => {
  const momentum = validateMomentum(marketFile, { top: 3, trials: MIN_VALIDATION_TRIALS });
  assert.equal(typeof momentum.passed, "boolean");
  assert.match(momentum.dataRange, /^\d{4}-\d{2}-\d{2} -> \d{4}-\d{2}-\d{2}$/);
  assert.ok(momentum.targets.length <= 3);

  const configured = validateConfig(marketFile, {
    familyKey: "xs_momentum",
    top: 3,
    trials: MIN_VALIDATION_TRIALS
  });
  assert.equal(configured.familyKey, "xs_momentum");
  assert.equal(typeof configured.passed, "boolean");
  assert.match(configured.dataRange, /^\d{4}-\d{2}-\d{2} -> \d{4}-\d{2}-\d{2}$/);
  assert.ok(configured.targets.length <= 3);
});
