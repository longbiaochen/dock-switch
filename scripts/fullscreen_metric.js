const path = require("path");
const cp = require("child_process");
const { app } = require("electron");

const addonPath = path.join(process.cwd(), "native", "dock-query", "build", "Release", "dock_query.node");
const addon = require(addonPath);

function run(cmd, timeout = 20000) {
  return cp.execSync(cmd, { encoding: "utf8", timeout }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBounds(b) {
  if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return null;
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
}

async function main() {
  const appOpenName = process.argv[2] || "Google Chrome";
  const processName = process.argv[3] || appOpenName;

  run(`open -a ${JSON.stringify(appOpenName)}`);
  await sleep(800);

  let resetOk = false;
  try {
    resetOk = !!addon.moveApplicationWindow({ name: processName, x: 120, y: 100, w: 1100, h: 700 });
  } catch (_) {}
  await sleep(250);

  const before = {
    fullscreen: !!addon.isApplicationWindowFullscreen({ name: processName }),
    bounds: normalizeBounds(addon.getApplicationWindowBounds({ name: processName }))
  };

  const triggerOk = !!addon.fullscreenApplicationWindow({ name: processName });
  await sleep(1500);

  const after = {
    fullscreen: !!addon.isApplicationWindowFullscreen({ name: processName }),
    bounds: normalizeBounds(addon.getApplicationWindowBounds({ name: processName }))
  };

  const result = {
    appOpenName,
    processName,
    resetOk,
    triggerOk,
    before,
    after,
    pass: Boolean(triggerOk && after.fullscreen)
  };
  console.log(JSON.stringify(result, null, 2));
}

app.whenReady().then(async () => {
  try {
    await main();
  } finally {
    app.exit(0);
  }
});
