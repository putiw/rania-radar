export const DEFAULT_CONFIG = Object.freeze({
  totalTrials: 25,
  targetTrials: 5,
  minWaitMs: 700,
  maxWaitMs: 1400,
  displayMs: 500,
  minValidReactionMs: 120,
});

const OUTCOME_FEEDBACK = Object.freeze({
  hit: Object.freeze({ isCorrect: true, message: "Correct — Rania detected" }),
  "correct-rejection": Object.freeze({ isCorrect: true, message: "Correct — not Rania" }),
  "false-alarm": Object.freeze({ isCorrect: false, message: "Incorrect — not Rania" }),
  miss: Object.freeze({ isCorrect: false, message: "Missed Rania" }),
  anticipation: Object.freeze({ isCorrect: false, message: "Too early" }),
});

export function feedbackForOutcome(outcome) {
  return OUTCOME_FEEDBACK[outcome] ?? { isCorrect: false, message: "Incorrect" };
}

function shuffled(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function buildTrials({
  people,
  targetId,
  isTarget = (person) => person.id === targetId,
  totalTrials = DEFAULT_CONFIG.totalTrials,
  targetTrials = DEFAULT_CONFIG.targetTrials,
  random = Math.random,
}) {
  const targets = people.filter(isTarget);
  const distractors = people.filter((person) => !isTarget(person));

  if (targets.length === 0 || distractors.length === 0) {
    throw new Error("A target and at least one distractor are required.");
  }

  if (targetTrials < 1 || totalTrials <= targetTrials) {
    throw new Error("The trial count must include targets and distractors.");
  }

  const makePool = (items, count) => {
    const pool = [];
    while (pool.length < count) pool.push(...shuffled(items, random));
    return pool.slice(0, count);
  };

  const targetPool = makePool(targets, targetTrials);
  const distractorPool = makePool(distractors, totalTrials - targetTrials);
  let flags = null;

  // Allow targets anywhere, including first or back-to-back, but avoid an
  // unlikely run of three targets that would make the short gift task lopsided.
  for (let attempt = 0; attempt < 100 && !flags; attempt += 1) {
    const candidate = shuffled(
      [
        ...Array.from({ length: targetTrials }, () => true),
        ...Array.from({ length: totalTrials - targetTrials }, () => false),
      ],
      random,
    );
    const hasThreeTargets = candidate.some(
      (flag, index) => flag && candidate[index - 1] && candidate[index - 2],
    );
    if (!hasThreeTargets) flags = candidate;
  }

  // Deterministic fallback for injected/non-random generators used in tests.
  if (!flags) {
    flags = Array.from({ length: totalTrials }, () => false);
    for (let index = 0; index < targetTrials; index += 1) {
      flags[Math.floor(((index + 0.5) * totalTrials) / targetTrials)] = true;
    }
  }

  let targetIndex = 0;
  let distractorIndex = 0;

  return Array.from({ length: totalTrials }, (_, index) => {
    const trialIsTarget = flags[index];
    const person = trialIsTarget
      ? targetPool[targetIndex++]
      : distractorPool[distractorIndex++];

    return {
      id: `trial-${index + 1}`,
      personId: person.id,
      isTarget: trialIsTarget,
    };
  });
}

export function randomWait(config = DEFAULT_CONFIG, random = Math.random) {
  const range = config.maxWaitMs - config.minWaitMs;
  return Math.round(config.minWaitMs + random() * range);
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function summarizeResults(results, falseStarts = 0) {
  const reactionTimes = results
    .filter((result) => result.outcome === "hit" && Number.isFinite(result.reactionMs))
    .map((result) => Math.round(result.reactionMs));
  const hits = results.filter((result) => result.outcome === "hit").length;
  const targetResults = results.filter((result) => result.isTarget);
  const distractorResults = results.filter((result) => !result.isTarget);
  const misses = targetResults.filter((result) => result.outcome !== "hit").length;
  const falseAlarms = results.filter((result) => result.outcome === "false-alarm").length;
  const correctRejections = results.filter(
    (result) => result.outcome === "correct-rejection",
  ).length;

  return {
    reactionTimes,
    medianMs: median(reactionTimes),
    bestMs: reactionTimes.length > 0 ? Math.min(...reactionTimes) : null,
    hits,
    misses,
    falseAlarms,
    falseStarts,
    hitRate: targetResults.length > 0 ? Math.round((hits / targetResults.length) * 100) : 0,
    falseAlarmRate:
      distractorResults.length > 0
        ? Math.round((falseAlarms / distractorResults.length) * 100)
        : 0,
    total: results.length,
  };
}

export function combineSummaries(summaries) {
  const reactionTimes = summaries.flatMap((summary) => summary.reactionTimes);
  const hits = summaries.reduce((total, summary) => total + summary.hits, 0);
  const misses = summaries.reduce((total, summary) => total + summary.misses, 0);
  const falseAlarms = summaries.reduce(
    (total, summary) => total + summary.falseAlarms,
    0,
  );
  const falseStarts = summaries.reduce(
    (total, summary) => total + summary.falseStarts,
    0,
  );
  const correctRejections = summaries.reduce(
    (total, summary) => total + summary.correctRejections,
    0,
  );
  const total = summaries.reduce((count, summary) => count + summary.total, 0);
  const targetTrials = hits + misses;
  const distractorTrials = total - targetTrials;

  return {
    reactionTimes,
    medianMs: median(reactionTimes),
    bestMs: reactionTimes.length > 0 ? Math.min(...reactionTimes) : null,
    hits,
    misses,
    falseAlarms,
    falseStarts,
    correctRejections,
    hitRate: targetTrials > 0 ? Math.round((hits / targetTrials) * 100) : 0,
    falseAlarmRate:
      distractorTrials > 0 ? Math.round((falseAlarms / distractorTrials) * 100) : 0,
    total,
  };
}

const HISTOGRAM_BINS = [
  { min: 0, max: 300, label: "<300" },
  { min: 300, max: 450, label: "300–449" },
  { min: 450, max: 600, label: "450–599" },
  { min: 600, max: 750, label: "600–749" },
  { min: 750, max: Number.POSITIVE_INFINITY, label: "750+" },
];

export function buildHistogram(reactionTimes) {
  return HISTOGRAM_BINS.map((bin) => ({
    ...bin,
    count: reactionTimes.filter((time) => time >= bin.min && time < bin.max).length,
  }));
}
