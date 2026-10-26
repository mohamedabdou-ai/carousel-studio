// tests/parity/lib/studio.mjs · open the real Studio page of ANY copy of the repository, optionally with some runtime chunks swapped (round 3, package F1).
//
//   const s = await openRoot({ root, runtime });          // s.page is the ready Studio page (CS.automation on), s.showcase the spec it holds
//   try { ... await s.page.evaluate(...) ... } finally { await s.close(); }
//
//   root     the repository whose skill, styles, templates and runtime chunks are measured (default: the repository this file lives in).
//            A pristine 1.0 extraction is a perfectly good root: only its files are read, nothing in it is written.
//   runtime  a folder of privately built chunks (node tools/build.mjs --module paint --out DIR). Every cs-*.js in it replaces the same-named
//            chunk of the root's runtime/ in a throw-away copy of the skill folder; the root itself is never modified. This is how a builder
//            measures a source change without running `npm run build` on the shared tree.
//   spec     a spec object or a path (default: tools/examples/showcase.spec.json of the root);  brand: a path (default: tests/fixtures/brand.eg.creator.json).
//   A page that does not boot (a source tree whose templates are ahead of its runtime chunks, say) is an error after 90 s (opts.timeout), not a hang.
//
// Playwright, Chromium and the loopback server come from cover_video.mjs of THIS repository (infrastructure, not under test). Temporary
// files go to $CS_TMP when it is set, else the operating system's temporary folder, and are removed on close().
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findPython, launchChromium, openStudio } from "../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const SKILL_REL = "plugins/carousel-studio/skills/carousel-design";
export const PRESETS = ["swiss", "creator", "notebook", "poster", "interface", "heritage"];

export function tempDir(prefix) {
  const base = process.env.CS_TMP || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

/** --root DIR, --runtime DIR, --chromium PATH, --preset a,b out of an argv list (the three tools of this folder share them). */
export function cliOptions(argv) {
  const get = (name) => { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
  const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
  return { root: get("root") ? path.resolve(get("root")) : REPO, runtime: get("runtime") ? path.resolve(get("runtime")) : null, chromium: get("chromium"), presets: list(get("preset") || get("presets")) };
}

/** Builds studio.html for `root` into `work`; with `runtime`, from a copy of the skill folder whose chunks are overlaid. Returns the file. */
export function buildStudioFor({ root, runtime, specFile, brandFile, work }) {
  const skill = path.join(root, SKILL_REL), script = path.join(skill, "scripts", "build_studio.py");
  if (!fs.existsSync(script)) throw new Error("no build_studio.py under " + skill);
  let skillRoot = null;
  if (runtime) {
    skillRoot = path.join(work, "skill");
    fs.cpSync(skill, skillRoot, { recursive: true });
    let swapped = 0;
    for (const f of fs.readdirSync(runtime)) if (/^cs-[a-z0-9-]+\.js$/.test(f)) { fs.copyFileSync(path.join(runtime, f), path.join(skillRoot, "runtime", f)); swapped++; }
    if (!swapped) throw new Error("--runtime " + runtime + " holds no cs-*.js chunk");
  }
  const py = findPython(), out = path.join(work, "studio.html");
  const args = [...py.slice(1), "-X", "utf8", script, "--spec", specFile, "--view", "design", "--standalone", "--out", out];
  if (brandFile) args.push("--brand", brandFile);
  if (skillRoot) args.push("--skill-root", skillRoot);
  const r = spawnSync(py[0], args, { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: "1", CS_ALL_PRESETS: "1" } });   // also the presets held back for a later release
  if (r.status !== 0) throw new Error("build_studio.py failed (exit " + r.status + "): " + String(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | "));
  return out;
}

export async function openRoot(opts = {}) {
  const root = path.resolve(opts.root || REPO), work = tempDir("cs-f1-");
  const specPath = typeof opts.spec === "string" ? opts.spec : path.join(root, "tools/examples/showcase.spec.json");
  const showcase = opts.spec && typeof opts.spec === "object" ? opts.spec : JSON.parse(fs.readFileSync(specPath, "utf8"));
  const specFile = path.join(work, "spec.json");
  fs.writeFileSync(specFile, JSON.stringify(showcase));
  const brandFile = opts.brand || path.join(root, "tests/fixtures/brand.eg.creator.json");
  let browser = null, studio = null;
  const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* a locked temp file is not a test failure */ } };
  try {
    const studioFile = buildStudioFor({ root, runtime: opts.runtime || null, specFile, brandFile, work });
    browser = await launchChromium({ chromium: opts.chromium });
    studio = await openStudio({ browser, studioFile, timeout: opts.timeout || 90000 });
  } catch (e) { if (browser) await browser.close().catch(() => {}); cleanup(); throw e; }
  return { page: studio.page, errors: studio.errors, showcase, root, work, async close() { await studio.close().catch(() => {}); await browser.close().catch(() => {}); cleanup(); } };
}
