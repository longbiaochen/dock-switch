const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const { app, screen } = require("electron");

const logLines = [];
function log(s) {
  const line = `[${new Date().toISOString()}] ${s}`;
  logLines.push(line);
  try { console.log(line); } catch (_) {}
}

function run(cmd, timeout = 15000) {
  log(`RUN: ${cmd}`);
  const out = cp.execSync(cmd, { encoding: "utf8", timeout }).trim();
  log(`OK: ${cmd}`);
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function screenshot(name) {
  const out = path.join(process.cwd(), "dist", name);
  run(`mkdir -p ${JSON.stringify(path.dirname(out))}`);
  run(`screencapture -x ${JSON.stringify(out)}`);
  return out;
}

function waitFocused(addon, appName, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const n = String(addon.getFocusedApplicationName() || "").trim();
      if (n.toLowerCase() === appName.toLowerCase()) return true;
    } catch (_) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  }
  return false;
}

async function main() {
  const result = { ok: false, before: null, after: null, beforeShot: null, afterShot: null, error: null };
  try {
    const addonPath = path.join(process.cwd(), "native", "dock-query", "build", "Release", "dock_query.node");
    const addon = require(addonPath);
    log(`Loaded addon: ${addonPath}`);

    run("open -a Safari");
    await sleep(700);
    waitFocused(addon, "Safari", 3000);

    addon.moveApplicationWindow({ name: "Safari", x: 120, y: 140, w: 900, h: 600 });
    await sleep(250);

    result.before = addon.getApplicationWindowBounds({ name: "Safari" });
    result.beforeShot = screenshot("ax_before.png");

    const center = {
      x: result.before.x + Math.floor(result.before.w / 2),
      y: result.before.y + Math.floor(result.before.h / 2)
    };
    const d = screen.getDisplayNearestPoint(center);
    const wa = d.workArea || d.bounds;
    const target = { x: wa.x, y: wa.y, w: wa.width, h: wa.height };
    log(`Calling moveFocusedWindowAndMaximize ${JSON.stringify(target)}`);
    const moved = addon.moveFocusedWindowAndMaximize(target);
    log(`moveFocusedWindowAndMaximize returned ${String(moved)}`);
    await sleep(350);

    result.after = addon.getApplicationWindowBounds({ name: "Safari" });
    result.afterShot = screenshot("ax_after.png");
    result.ok = Boolean(moved);
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
    log(`ERROR: ${result.error}`);
  }

  const outDir = path.join(process.cwd(), "dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ax_result.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outDir, "ax_result.log"), logLines.join("\n") + "\n");
  console.log(JSON.stringify(result));
}

app.whenReady().then(async () => {
  const timer = setTimeout(() => app.exit(2), 45000);
  await main();
  clearTimeout(timer);
  app.exit(0);
});
