const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const { app, screen } = require("electron");
const { resolveBoundsForAction, getDisplayForRect } = require("../src/window-control");

const logLines = [];
function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  logLines.push(msg);
  try { console.log(msg); } catch (_) {}
}

function run(command, timeout = 15000) {
  log(`RUN: ${command}`);
  const output = cp.execSync(command, { encoding: "utf8", timeout }).trim();
  log(`OK: ${command}`);
  return output;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function screenshot(name) {
  const file = path.join(process.cwd(), "dist", name);
  run(`mkdir -p ${JSON.stringify(path.dirname(file))}`);
  run(`screencapture -x ${JSON.stringify(file)}`);
  return file;
}

function toAction(key) {
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "\\") return "fill";
  return null;
}

async function main() {
  const arrowKey = process.argv[2] || "ArrowRight";
  const action = toAction(arrowKey);
  const out = {
    ok: false,
    arrowKey,
    action,
    before: null,
    after: null,
    target: null,
    beforeShot: null,
    afterShot: null,
    error: null
  };

  try {
    const addonPath = path.join(process.cwd(), "native", "dock-query", "build", "Release", "dock_query.node");
    const addon = require(addonPath);
    if (!action) throw new Error(`unsupported key: ${arrowKey}`);

    run("open -a Safari");
    await sleep(700);
    addon.moveApplicationWindow({ name: "Safari", x: 120, y: 140, w: 900, h: 600 });
    await sleep(200);

    out.before = addon.getApplicationWindowBounds({ name: "Safari" });
    out.beforeShot = screenshot("arrow_before.png");

    const displays = screen.getAllDisplays();
    const current = getDisplayForRect(displays, out.before);
    out.target = resolveBoundsForAction(action, displays, screen.getPrimaryDisplay(), current);
    log(`Applying ${action} -> ${JSON.stringify(out.target)}`);
    const moved = addon.moveApplicationWindow({ name: "Safari", ...out.target });
    log(`moveApplicationWindow returned ${String(moved)}`);
    await sleep(300);

    out.after = addon.getApplicationWindowBounds({ name: "Safari" });
    out.afterShot = screenshot("arrow_after.png");
    out.ok = Boolean(moved && out.after);
  } catch (e) {
    out.error = String(e && e.message ? e.message : e);
    log(`ERROR: ${out.error}`);
  }

  const distDir = path.join(process.cwd(), "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "arrow_visual_result.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(distDir, "arrow_visual_result.log"), logLines.join("\n") + "\n");
  console.log(JSON.stringify(out));
}

app.whenReady().then(async () => {
  const timer = setTimeout(() => app.exit(2), 45000);
  await main();
  clearTimeout(timer);
  app.exit(0);
});
