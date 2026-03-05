const path = require("path");
const cp = require("child_process");
const { app, screen } = require("electron");
const { getDisplayForRect, resolveBoundsForAction } = require("../src/window-control");

const addonPath = path.join(process.cwd(), "native", "dock-query", "build", "Release", "dock_query.node");
const addon = require(addonPath);

function run(cmd, timeout = 20000) {
  return cp.execSync(cmd, { encoding: "utf8", timeout }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const trials = Number(process.argv[2] || 12);
  const appOpenName = process.argv[3] || "Safari";
  const processName = process.argv[4] || appOpenName;
  return { trials, appOpenName, processName };
}

function resetWindow(processName) {
  addon.moveApplicationWindow({ name: processName, x: 120, y: 140, w: 900, h: 600 });
}

function getBounds(processName) {
  const b = addon.getApplicationWindowBounds({ name: processName });
  if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return null;
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.w),
    h: Math.round(b.h)
  };
}

function intersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return w * h;
}

function metric(target, actual) {
  const targetArea = target.w * target.h;
  const actualArea = actual.w * actual.h;
  const inter = intersectionArea(target, actual);
  const coverage = targetArea > 0 ? inter / targetArea : 0;
  const spill = actualArea > 0 ? (actualArea - inter) / actualArea : 1;
  const posErr = Math.abs(actual.x - target.x) + Math.abs(actual.y - target.y);
  const sizeErr = Math.abs(actual.w - target.w) + Math.abs(actual.h - target.h);
  const normErr = (posErr + sizeErr) / Math.max(1, target.w + target.h);
  const score = Math.max(0, 1 - normErr) * 0.55 + coverage * 0.35 + (1 - Math.min(1, spill)) * 0.10;
  return { score, coverage, spill, posErr, sizeErr };
}

function isPass(m) {
  return m.score >= 0.97 && m.coverage >= 0.985 && m.spill <= 0.02;
}

function actionList() {
  return ["left", "right", "up", "down"];
}

async function runActionTrials(action, trials, processName) {
  const details = [];
  let pass = 0;

  for (let i = 0; i < trials; i++) {
    resetWindow(processName);
    await sleep(150);

    const before = getBounds(processName);
    if (!before) {
      details.push({ action, ok: false, reason: "no_before_bounds" });
      continue;
    }

    const displays = screen.getAllDisplays();
    const current = getDisplayForRect(displays, before);
    const target = resolveBoundsForAction(action, displays, screen.getPrimaryDisplay(), current);
    if (!target) {
      details.push({ action, ok: false, reason: "no_target_bounds" });
      continue;
    }

    const moved = addon.moveApplicationWindow({ name: processName, ...target });
    await sleep(220);
    const after = getBounds(processName);
    if (!after) {
      details.push({ action, ok: false, reason: "no_after_bounds" });
      continue;
    }

    const m = metric(target, after);
    const ok = Boolean(moved) && isPass(m);
    if (ok) pass++;
    details.push({ action, ok, before, target, after, metric: m });
  }

  return { action, pass, trials, passRate: pass / Math.max(1, trials), details };
}

async function main() {
  const { trials, appOpenName, processName } = parseArgs();
  run(`open -a ${JSON.stringify(appOpenName)}`);
  await sleep(700);

  const result = {
    trialsPerAction: trials,
    appOpenName,
    processName
  };

  for (const action of actionList()) {
    const r = await runActionTrials(action, trials, processName);
    result[action] = { pass: r.pass, passRate: r.passRate };
    result[`${action}Details`] = r.details;
  }

  console.log(JSON.stringify(result, null, 2));
}

app.whenReady().then(async () => {
  try {
    await main();
  } finally {
    app.exit(0);
  }
});
