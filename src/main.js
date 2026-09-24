import {
  DEFAULT_CONFIG,
  buildHistogram,
  buildTrials,
  combineSummaries,
  feedbackForOutcome,
  randomWait,
  summarizeResults,
} from "./game.js";

const APP_BASE_URL = new URL(import.meta.env.BASE_URL, document.baseURI);
const appAssetUrl = (path) => new URL(path, APP_BASE_URL).href;

// Every supplied photograph is one stimulus. The source folder includes files
// with missing or misleading extensions, so all browser-facing copies are
// normalized to WebP during import.
const FACE_GROUPS = [
  { slug: "rania", name: "Rania", count: 14, isTarget: true, numberFirst: true },
  { slug: "aysha", name: "Aysha", count: 2 },
  { slug: "birol", name: "Birol", count: 7 },
  { slug: "dana", name: "Dana", count: 2 },
  { slug: "gaya", name: "Gaya", count: 4 },
  { slug: "hadi", name: "Hadi", count: 8 },
  { slug: "haidee", name: "Haidee", count: 7 },
  { slug: "hamster", name: "Hamster", count: 1 },
  { slug: "hannah", name: "Hannah", count: 5 },
  { slug: "hilton", name: "Hilton", count: 3 },
  { slug: "jenna", name: "Jenna", count: 2 },
  { slug: "karima", name: "Karima", count: 4 },
  { slug: "lexi", name: "Lexi", count: 3 },
  { slug: "maitha", name: "Maitha", count: 3 },
  { slug: "michele", name: "Michele", count: 1 },
  { slug: "noha", name: "Noha", count: 2 },
  { slug: "puti", name: "Puti", count: 7, photoNumbers: [1, 2, 3, 4, 6, 8, 9] },
  { slug: "raphael", name: "Raphael", count: 4 },
  { slug: "shanshan", name: "Shanshan", count: 3 },
  { slug: "soumen", name: "Soumen", count: 7 },
  { slug: "steve", name: "Steve", count: 4 },
  { slug: "teo", name: "Teo", count: 9 },
  { slug: "toni", name: "Toni", count: 3 },
  { slug: "victor", name: "Victor", count: 2 },
  { slug: "zinong", name: "Zinong", count: 2 },
];

const PEOPLE = FACE_GROUPS.flatMap(
  ({ slug, name, count, photoNumbers, isTarget = false, numberFirst = false }) =>
    (photoNumbers ?? Array.from({ length: count }, (_, index) => index + 1)).map(
      (photoNumber) => {
        const fileSuffix = photoNumber === 1 && !numberFirst ? "" : photoNumber;
        return {
          id: `${slug}-${photoNumber}`,
          name,
          image: `faces/${slug}${fileSuffix}.webp`,
          isTarget,
        };
      },
    ),
);

const targetPhotoCount = PEOPLE.filter((person) => person.isTarget).length;
const config = DEFAULT_CONFIG;
const FACE_ASSET_VERSION = "photos-5";
const RUN_HISTORY_KEY = "rania-radar-run-history-v3";
const RUN_HISTORY_VERSION = 3;

if (targetPhotoCount < config.targetTrials) {
  throw new Error("The photo library does not contain enough target images for one run.");
}

const screens = {
  welcome: document.querySelector("#welcome-screen"),
  game: document.querySelector("#game-screen"),
  results: document.querySelector("#results-screen"),
};

const elements = {
  startButton: document.querySelector("#start-button"),
  restartButton: document.querySelector("#restart-button"),
  shareButton: document.querySelector("#share-button"),
  installButton: document.querySelector("#install-button"),
  trialLabel: document.querySelector("#trial-label"),
  progressPercent: document.querySelector("#progress-percent"),
  progressBar: document.querySelector("#progress-bar"),
  cue: document.querySelector("#cue"),
  faceFrame: document.querySelector("#face-frame"),
  faceImage: document.querySelector("#face-image"),
  gameStatus: document.querySelector("#game-status"),
  detectButton: document.querySelector("#detect-button"),
  resultRunLabel: document.querySelector("#result-run-label"),
  resultHeadline: document.querySelector("#result-headline"),
  runStatGrid: document.querySelector("#run-stat-grid"),
  cumulativeStatGrid: document.querySelector("#cumulative-stat-grid"),
  cumulativeRunCount: document.querySelector("#cumulative-run-count"),
  histogram: document.querySelector("#histogram"),
  chartNote: document.querySelector("#chart-note"),
  toast: document.querySelector("#toast"),
  stimulusCount: document.querySelector("#stimulus-count"),
  estimatedDuration: document.querySelector("#estimated-duration"),
  targetCount: document.querySelector("#target-count"),
};

let installPrompt = null;
let toastTimer = null;
let runHistory = loadRunHistory();
let session = createEmptySession();

function createEmptySession() {
  return {
    runId: 0,
    trials: [],
    currentIndex: 0,
    results: [],
    falseStarts: 0,
    phase: "idle",
    shownAt: null,
    response: null,
    timer: null,
    lastSummary: null,
    lastCumulativeSummary: null,
    completedRunNumber: null,
  };
}

function isStoredRunSummary(summary) {
  const numericFields = [
    "hits",
    "misses",
    "falseAlarms",
    "falseStarts",
    "correctRejections",
    "total",
  ];
  return (
    summary !== null &&
    typeof summary === "object" &&
    Array.isArray(summary.reactionTimes) &&
    summary.reactionTimes.every((time) => Number.isFinite(time) && time >= 0) &&
    numericFields.every((field) => Number.isFinite(summary[field]) && summary[field] >= 0)
  );
}

function loadRunHistory() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RUN_HISTORY_KEY));
    if (stored?.version !== RUN_HISTORY_VERSION || !Array.isArray(stored.runs)) return [];
    return stored.runs.filter(isStoredRunSummary);
  } catch {
    return [];
  }
}

function saveRunHistory() {
  try {
    window.localStorage.setItem(
      RUN_HISTORY_KEY,
      JSON.stringify({ version: RUN_HISTORY_VERSION, runs: runHistory }),
    );
  } catch {
    // Results still remain cumulative for the lifetime of this open app.
  }
}

function recordCompletedRun(summary) {
  runHistory.push({
    ...summary,
    completedAt: new Date().toISOString(),
  });
  saveRunHistory();
  return {
    runNumber: runHistory.length,
    cumulativeSummary: combineSummaries(runHistory),
  };
}

function getPerson(id) {
  return PEOPLE.find((person) => person.id === id);
}

function avatarSource(person) {
  return `${appAssetUrl(person.image)}?v=${FACE_ASSET_VERSION}`;
}

function mountExperimentSummary() {
  const averageTrialMs =
    (config.minWaitMs + config.maxWaitMs) / 2 + config.displayMs + 300;
  const estimatedMinutes = Math.max(
    1,
    Math.round((averageTrialMs * config.totalTrials) / 60_000),
  );
  elements.stimulusCount.textContent = String(config.totalTrials);
  elements.estimatedDuration.textContent = `~${estimatedMinutes} min`;
  elements.targetCount.textContent = String(config.targetTrials);
}

function mountWelcomeAvatars() {
  document.querySelectorAll("[data-person]").forEach((slot) => {
    const person = getPerson(slot.dataset.person);
    const image = new Image();
    image.src = avatarSource(person);
    image.alt = slot.closest(".target-card") ? `${person.name}, the target face` : "";
    image.draggable = false;
    slot.replaceChildren(image);
  });
}

async function preloadAvatars(people) {
  await Promise.all(
    people.map((person) => {
      const image = new Image();
      image.src = avatarSource(person);
      return image.decode?.().catch(() => undefined) ?? Promise.resolve();
    }),
  );
}

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, screen]) => {
    screen.hidden = screenName !== name;
  });
  document.body.dataset.screen = name;
  document.body.classList.toggle("is-playing", name === "game");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function clearSessionTimer() {
  if (session.timer) window.clearTimeout(session.timer);
  session.timer = null;
}

function resetFixationFeedback() {
  elements.cue.classList.remove("is-correct", "is-incorrect");
}

function showFixationFeedback(outcome, message) {
  const feedback = feedbackForOutcome(outcome);
  elements.cue.classList.toggle("is-correct", feedback.isCorrect);
  elements.cue.classList.toggle("is-incorrect", !feedback.isCorrect);
  elements.cue.hidden = false;
  elements.cue.textContent = "+";
  elements.gameStatus.textContent = message ?? feedback.message;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function startExperiment() {
  const runId = session.runId + 1;
  clearSessionTimer();
  session = {
    ...createEmptySession(),
    runId,
    trials: buildTrials({
      people: PEOPLE,
      isTarget: (person) => person.isTarget,
      totalTrials: config.totalTrials,
      targetTrials: config.targetTrials,
    }),
    phase: "loading",
  };

  showScreen("game");
  elements.faceFrame.classList.remove("is-visible");
  elements.detectButton.setAttribute("aria-disabled", "false");
  elements.progressBar.style.width = "0%";
  elements.progressPercent.textContent = "0%";
  elements.trialLabel.textContent = "Loading faces";
  elements.gameStatus.textContent = "Remember: tap only for Rania";
  elements.cue.hidden = false;
  elements.cue.textContent = "+";
  resetFixationFeedback();

  await preloadAvatars(session.trials.map((trial) => getPerson(trial.personId)));
  if (session.runId !== runId) return;

  session.phase = "countdown";
  elements.trialLabel.textContent = "Get ready";
  for (const count of [3, 2, 1]) {
    elements.cue.textContent = count;
    elements.cue.classList.remove("is-popping");
    void elements.cue.offsetWidth;
    elements.cue.classList.add("is-popping");
    await delay(650);
    if (session.runId !== runId) return;
  }

  prepareTrial(runId);
}

function prepareTrial(runId = session.runId) {
  if (runId !== session.runId) return;
  clearSessionTimer();

  if (session.currentIndex >= session.trials.length) {
    finishExperiment();
    return;
  }

  const faceNumber = session.currentIndex + 1;
  const percent = Math.round((session.currentIndex / session.trials.length) * 100);
  session.phase = "waiting";
  session.shownAt = null;
  session.response = null;
  elements.faceFrame.classList.remove("is-visible");
  elements.detectButton.setAttribute("aria-disabled", "false");
  resetFixationFeedback();
  elements.cue.hidden = false;
  elements.cue.textContent = "+";
  elements.gameStatus.textContent = "Keep your eyes on the fixation cross";
  elements.trialLabel.textContent = `Face ${faceNumber} of ${session.trials.length}`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;

  session.timer = window.setTimeout(() => showStimulus(runId), randomWait(config));
}

function showStimulus(runId) {
  if (runId !== session.runId || session.phase !== "waiting") return;
  const trial = session.trials[session.currentIndex];
  const person = getPerson(trial.personId);

  elements.faceImage.src = avatarSource(person);
  elements.cue.hidden = false;
  elements.cue.textContent = "+";
  elements.gameStatus.textContent = "";
  elements.faceFrame.classList.add("is-visible");

  window.requestAnimationFrame(() => {
    if (runId !== session.runId || session.phase !== "waiting") return;
    session.phase = "stimulus";
    session.shownAt = performance.now();
    session.timer = window.setTimeout(() => {
      const response = session.response;
      completeTrial(
        response?.outcome ?? (trial.isTarget ? "miss" : "correct-rejection"),
        response?.reactionMs ?? null,
      );
    }, config.displayMs);
  });
}

function handleDetection() {
  if (session.phase === "waiting") {
    registerFalseStart("Response too early. Wait for a face.");
    return;
  }

  if (session.phase !== "stimulus" || session.response) return;

  const trial = session.trials[session.currentIndex];
  const reactionMs = performance.now() - session.shownAt;

  if (reactionMs < config.minValidReactionMs) {
    session.falseStarts += 1;
    session.response = { outcome: "anticipation", reactionMs };
    showFixationFeedback("anticipation", "Response too early");
    elements.detectButton.setAttribute("aria-disabled", "true");
    return;
  }

  session.response = {
    outcome: trial.isTarget ? "hit" : "false-alarm",
    reactionMs,
  };
  showFixationFeedback(session.response.outcome);
  elements.detectButton.setAttribute("aria-disabled", "true");
}

function registerFalseStart(message) {
  const runId = session.runId;
  clearSessionTimer();
  session.phase = "feedback";
  session.falseStarts += 1;
  elements.faceFrame.classList.remove("is-visible");
  showFixationFeedback("anticipation", message);
  elements.detectButton.setAttribute("aria-disabled", "true");
  session.timer = window.setTimeout(() => prepareTrial(runId), 650);
}

function completeTrial(outcome, reactionMs = null) {
  if (session.phase !== "stimulus") return;
  const runId = session.runId;
  const trial = session.trials[session.currentIndex];
  clearSessionTimer();
  session.phase = "feedback";
  elements.faceFrame.classList.remove("is-visible");
  showFixationFeedback(outcome);
  elements.detectButton.setAttribute("aria-disabled", "true");

  session.results.push({
    trialId: trial.id,
    personId: trial.personId,
    isTarget: trial.isTarget,
    outcome,
    reactionMs: outcome === "hit" ? reactionMs : null,
  });
  session.currentIndex += 1;

  const completedPercent = Math.round((session.currentIndex / session.trials.length) * 100);
  elements.progressBar.style.width = `${completedPercent}%`;
  elements.progressPercent.textContent = `${completedPercent}%`;

  session.timer = window.setTimeout(() => prepareTrial(runId), 300);
}

function finishExperiment() {
  if (session.phase === "complete") return;
  clearSessionTimer();
  session.phase = "complete";
  session.lastSummary = summarizeResults(session.results, session.falseStarts);
  const { runNumber, cumulativeSummary } = recordCompletedRun(session.lastSummary);
  session.lastCumulativeSummary = cumulativeSummary;
  session.completedRunNumber = runNumber;
  renderResults(session.lastSummary, cumulativeSummary, runNumber);
  showScreen("results");
}

function renderStatGrid(grid, summary) {
  const stats = [
    { value: summary.medianMs ? `${summary.medianMs} ms` : "—", label: "Median time" },
    { value: summary.bestMs ? `${summary.bestMs} ms` : "—", label: "Fastest response" },
    { value: `${summary.hitRate}%`, label: "Target hit rate" },
    { value: String(summary.falseAlarms), label: "False alarms" },
  ];

  grid.replaceChildren(
    ...stats.map((stat) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const value = document.createElement("strong");
      value.textContent = stat.value;
      const label = document.createElement("span");
      label.textContent = stat.label;
      card.append(value, label);
      return card;
    }),
  );
}

function renderResults(runSummary, cumulativeSummary, runNumber) {
  elements.resultRunLabel.textContent = `Run ${runNumber} complete`;
  elements.resultHeadline.textContent = runSummary.medianMs
    ? `This run’s median response time was ${runSummary.medianMs} ms.`
    : "No valid target responses were recorded.";
  elements.cumulativeRunCount.textContent = `${runNumber} run${runNumber === 1 ? "" : "s"}`;

  renderStatGrid(elements.runStatGrid, runSummary);
  renderStatGrid(elements.cumulativeStatGrid, cumulativeSummary);

  renderHistogram(cumulativeSummary.reactionTimes);
  const mistakeBits = [];
  if (cumulativeSummary.falseAlarms > 0) {
    mistakeBits.push(
      `${cumulativeSummary.falseAlarms} false alarm${cumulativeSummary.falseAlarms === 1 ? "" : "s"}`,
    );
  }
  if (cumulativeSummary.falseStarts > 0) {
    mistakeBits.push(
      `${cumulativeSummary.falseStarts} premature response${cumulativeSummary.falseStarts === 1 ? "" : "s"}`,
    );
  }
  elements.chartNote.textContent =
    cumulativeSummary.reactionTimes.length < 3
      ? "Fewer than three cumulative target responses were recorded; interpret the distribution cautiously."
      : mistakeBits.length > 0
        ? `Across ${runNumber} completed run${runNumber === 1 ? "" : "s"}: ${mistakeBits.join("; ")}.`
        : `No false alarms or premature responses across ${runNumber} completed run${runNumber === 1 ? "" : "s"}.`;
}

function renderHistogram(reactionTimes) {
  const bins = buildHistogram(reactionTimes);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const chartLabel = reactionTimes.length
    ? `Cumulative histogram of ${reactionTimes.length} reaction times in milliseconds.`
    : "No valid cumulative reaction times to chart.";
  elements.histogram.setAttribute("aria-label", chartLabel);

  elements.histogram.replaceChildren(
    ...bins.map((bin, index) => {
      const column = document.createElement("div");
      column.className = "histogram__column";
      column.style.setProperty("--delay", `${index * 55}ms`);

      const count = document.createElement("span");
      count.className = "histogram__count";
      count.textContent = String(bin.count);

      const barTrack = document.createElement("div");
      barTrack.className = "histogram__track";
      const bar = document.createElement("span");
      bar.className = "histogram__bar";
      bar.style.setProperty("--height", `${(bin.count / maxCount) * 100}%`);
      barTrack.append(bar);

      const label = document.createElement("span");
      label.className = "histogram__label";
      label.textContent = bin.label;
      column.append(count, barTrack, label);
      return column;
    }),
  );
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

async function shareResults() {
  const runSummary = session.lastSummary;
  const cumulativeSummary = session.lastCumulativeSummary;
  if (!runSummary || !cumulativeSummary) return;
  const runSpeed = runSummary.medianMs
    ? `${runSummary.medianMs} ms median`
    : "no valid target time";
  const cumulativeSpeed = cumulativeSummary.medianMs
    ? `${cumulativeSummary.medianMs} ms cumulative median`
    : "no cumulative target time yet";
  const text = `Rania Detection Task run ${session.completedRunNumber}: ${runSpeed} and ${runSummary.hitRate}% hits. After ${session.completedRunNumber} run${session.completedRunNumber === 1 ? "" : "s"}: ${cumulativeSpeed}. We’ll miss you, Rania.`;

  try {
    if (navigator.share) {
      await navigator.share({ title: "Rania Radar", text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast("Result copied to your clipboard");
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Couldn’t share — try again in a moment");
  }
}

function handleVisibilityChange() {
  if (!document.hidden || !["waiting", "stimulus"].includes(session.phase)) return;
  const runId = session.runId;
  clearSessionTimer();
  session.phase = "paused";
  elements.faceFrame.classList.remove("is-visible");
  resetFixationFeedback();
  elements.cue.hidden = false;
  elements.cue.textContent = "Paused";
  elements.gameStatus.textContent = "Come back when you’re ready";

  const resume = () => {
    document.removeEventListener("visibilitychange", resume);
    if (session.runId !== runId) return;
    elements.gameStatus.textContent = "Welcome back — get ready";
    session.timer = window.setTimeout(() => prepareTrial(runId), 700);
  };
  document.addEventListener("visibilitychange", resume, { once: true });
}

elements.startButton.addEventListener("click", startExperiment);
elements.restartButton.addEventListener("click", startExperiment);
elements.shareButton.addEventListener("click", shareResults);
elements.detectButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  handleDetection();
});
elements.detectButton.addEventListener("click", (event) => {
  if (event.detail === 0) handleDetection();
});
document.addEventListener("keydown", (event) => {
  if (screens.game.hidden || event.repeat || ![" ", "Enter"].includes(event.key)) return;
  event.preventDefault();
  handleDetection();
});
document.addEventListener("visibilitychange", handleVisibilityChange);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  elements.installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  elements.installButton.hidden = true;
  showToast("Rania Radar installed 💛");
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register(appAssetUrl("sw.js"), {
      scope: APP_BASE_URL.href,
    }),
  );
}

mountExperimentSummary();
mountWelcomeAvatars();
