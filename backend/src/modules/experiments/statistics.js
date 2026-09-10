const { canonicalDigest } = require('../privacy/privacy-utils');

// Peter J. Acklam's rational approximation of the inverse normal CDF. The
// configured alpha is bounded before persistence, so p is always inside (0, 1).
const normalQuantile = (p) => {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5; const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};
const criticalValue = (alpha) => normalQuantile(1 - alpha / 2);

const wilson = (successes, total, z = 1.959963984540054) => {
  if (!total) return { low: 0, high: 0 };
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = (rate + (z * z) / (2 * total)) / denominator;
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * total)) / total) / denominator;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
};
const poissonRateInterval = (events, exposures, z = 1.959963984540054) => {
  if (!exposures) return { low: 0, high: 0 };
  const margin = z * Math.sqrt(events) / exposures;
  const rate = events / exposures;
  return { low: Math.max(0, rate - margin), high: rate + margin };
};

const analyzeMetric = ({ metric, variants, controlKey, z }) => {
  const control = variants.find((item) => item.key === controlKey);
  return variants.map((item) => {
    const denominator = item.denominator ?? item.exposures;
    const controlDenominator = control?.denominator ?? control?.exposures;
    const rate = denominator ? item.conversions / denominator : 0;
    const controlRate = controlDenominator ? control.conversions / controlDenominator : 0;
    const absoluteDifference = rate - controlRate;
    const confidenceInterval = metric.aggregation === 'EVENT_RATE' ? poissonRateInterval(item.conversions, denominator, z) : wilson(item.conversions, denominator, z);
    return { ...item, denominator, rate, absoluteDifference, relativeDifference: controlRate ? absoluteDifference / controlRate : null, confidenceInterval, sampleSufficient: denominator >= metric.minimumSampleSize };
  });
};

const summarizeAnalysis = ({ metrics, counts, minimumSampleSize, significanceAlpha = 0.05, analysisAt, now }) => {
  const controlKey = counts.find((item) => item.isControl)?.key;
  const z = criticalValue(significanceAlpha);
  const metricResults = metrics.map((metric) => ({ key: metric.key, role: metric.role, eventName: metric.eventName, aggregation: metric.aggregation, direction: metric.direction, variants: analyzeMetric({ metric, variants: counts.map((count) => ({ ...count, conversions: count.conversions[metric.key] || 0, denominator: count.denominators?.[metric.key] ?? count.exposures })), controlKey, z }) }));
  const sampleReady = counts.every((item) => item.exposures >= minimumSampleSize);
  const timeReady = !analysisAt || now >= analysisAt;
  const guardrailBlocked = metricResults.some((metric) => metric.role === 'GUARDRAIL' && metric.variants.some((item) => {
    const definition = metrics.find((candidate) => candidate.key === metric.key);
    if (item.isControl || definition.guardrailThreshold == null) return false;
    const deterioration = definition.direction === 'DECREASE'
      ? item.absoluteDifference
      : -item.absoluteDifference;
    return deterioration > definition.guardrailThreshold;
  }));
  const status = guardrailBlocked ? 'GUARDRAIL_BLOCKED' : sampleReady && timeReady ? 'READY' : 'INCONCLUSIVE';
  const results = { method: 'fixed-horizon-wilson-binomial-and-poisson-rate', significanceAlpha, confidenceLevel: 1 - significanceAlpha, criticalValue: z, earlyStopping: false, controlKey, sampleReady, timeReady, guardrailBlocked, metrics: metricResults };
  return { status, results, inputDigest: canonicalDigest({ metrics, counts, minimumSampleSize, significanceAlpha, analysisAt }) };
};

module.exports = { analyzeMetric, criticalValue, normalQuantile, poissonRateInterval, summarizeAnalysis, wilson };
