import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  buildHistogram,
  buildTrials,
  combineSummaries,
  feedbackForOutcome,
  median,
  summarizeResults,
} from "../src/game.js";

const people = [
  { id: "rania" },
  { id: "friend-1" },
  { id: "friend-2" },
  { id: "friend-3" },
];

function seededRandom(seed = 42) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

test("buildTrials creates the requested balanced sequence", () => {
  const trials = buildTrials({
    people,
    targetId: "rania",
    totalTrials: 24,
    targetTrials: 8,
    random: seededRandom(),
  });

  assert.equal(trials.length, 24);
  assert.equal(trials.filter((trial) => trial.isTarget).length, 8);

  trials.forEach((trial, index) => {
    const threeTargets = trial.isTarget && trials[index - 1]?.isTarget && trials[index - 2]?.isTarget;
    assert.equal(Boolean(threeTargets), false);
  });
});

test("buildTrials uses every supplied stimulus when counts match", () => {
  const stimuli = [
    { id: "rania-1", isTarget: true },
    { id: "rania-2", isTarget: true },
    { id: "friend-1", isTarget: false },
    { id: "friend-2", isTarget: false },
    { id: "friend-3", isTarget: false },
  ];
  const trials = buildTrials({
    people: stimuli,
    isTarget: (person) => person.isTarget,
    totalTrials: 5,
    targetTrials: 2,
    random: seededRandom(7),
  });

  assert.deepEqual(
    new Set(trials.map((trial) => trial.personId)),
    new Set(stimuli.map((stimulus) => stimulus.id)),
  );
});

test("buildTrials selects 25 unique photos from the larger stimulus library", () => {
  const stimuli = [
    ...Array.from({ length: 14 }, (_, index) => ({
      id: `rania-${index + 1}`,
      isTarget: true,
    })),
    ...Array.from({ length: 95 }, (_, index) => ({
      id: `friend-${index + 1}`,
      isTarget: false,
    })),
  ];
  const trials = buildTrials({
    people: stimuli,
    isTarget: (person) => person.isTarget,
    totalTrials: 25,
    targetTrials: 5,
    random: seededRandom(19),
  });

  assert.equal(trials.length, 25);
  assert.equal(trials.filter((trial) => trial.isTarget).length, 5);
  assert.equal(trials.filter((trial) => !trial.isTarget).length, 20);
  assert.equal(new Set(trials.map((trial) => trial.personId)).size, 25);
});

test("stimuli are displayed for exactly 500 milliseconds", () => {
  assert.equal(DEFAULT_CONFIG.displayMs, 500);
});

test("outcome feedback distinguishes correct and incorrect responses", () => {
  assert.deepEqual(feedbackForOutcome("hit"), {
    isCorrect: true,
    message: "Correct — Rania detected",
  });
  assert.deepEqual(feedbackForOutcome("correct-rejection"), {
    isCorrect: true,
    message: "Correct — not Rania",
  });
  assert.equal(feedbackForOutcome("false-alarm").isCorrect, false);
  assert.equal(feedbackForOutcome("miss").isCorrect, false);
  assert.equal(feedbackForOutcome("anticipation").isCorrect, false);
});

test("buildTrials remains bounded with a non-random generator", () => {
  const trials = buildTrials({
    people,
    targetId: "rania",
    totalTrials: 12,
    targetTrials: 4,
    random: () => 0,
  });

  assert.equal(trials.length, 12);
  assert.equal(trials.filter((trial) => trial.isTarget).length, 4);
});

test("median handles odd, even, and empty collections", () => {
  assert.equal(median([500, 300, 400]), 400);
  assert.equal(median([300, 450, 600, 700]), 525);
  assert.equal(median([]), null);
});

test("summarizeResults reports timing and response rates", () => {
  const summary = summarizeResults(
    [
      { outcome: "hit", reactionMs: 410, isTarget: true },
      { outcome: "hit", reactionMs: 350, isTarget: true },
      { outcome: "miss", reactionMs: null, isTarget: true },
      { outcome: "correct-rejection", reactionMs: null, isTarget: false },
      { outcome: "false-alarm", reactionMs: null, isTarget: false },
    ],
    2,
  );

  assert.equal(summary.medianMs, 380);
  assert.equal(summary.bestMs, 350);
  assert.equal(summary.hits, 2);
  assert.equal(summary.misses, 1);
  assert.equal(summary.falseAlarms, 1);
  assert.equal(summary.falseStarts, 2);
  assert.equal(summary.hitRate, 67);
  assert.equal(summary.falseAlarmRate, 50);
});

test("combineSummaries produces cumulative timing and accuracy", () => {
  const firstRun = summarizeResults(
    [
      { outcome: "hit", reactionMs: 300, isTarget: true },
      { outcome: "hit", reactionMs: 500, isTarget: true },
      { outcome: "miss", reactionMs: null, isTarget: true },
      { outcome: "false-alarm", reactionMs: null, isTarget: false },
      { outcome: "correct-rejection", reactionMs: null, isTarget: false },
    ],
    1,
  );
  const secondRun = summarizeResults(
    [
      { outcome: "hit", reactionMs: 400, isTarget: true },
      { outcome: "correct-rejection", reactionMs: null, isTarget: false },
    ],
    2,
  );

  const cumulative = combineSummaries([firstRun, secondRun]);

  assert.deepEqual(cumulative.reactionTimes, [300, 500, 400]);
  assert.equal(cumulative.medianMs, 400);
  assert.equal(cumulative.bestMs, 300);
  assert.equal(cumulative.hits, 3);
  assert.equal(cumulative.misses, 1);
  assert.equal(cumulative.hitRate, 75);
  assert.equal(cumulative.falseAlarms, 1);
  assert.equal(cumulative.falseAlarmRate, 33);
  assert.equal(cumulative.falseStarts, 3);
  assert.equal(cumulative.total, 7);
});

test("buildHistogram places edge values in the correct buckets", () => {
  const bins = buildHistogram([250, 299, 300, 449, 450, 599, 600, 749, 750, 1150]);
  assert.deepEqual(
    bins.map((bin) => bin.count),
    [2, 2, 2, 2, 2],
  );
});
