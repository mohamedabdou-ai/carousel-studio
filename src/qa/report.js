/* Carousel Studio · cs-qa · summary, report and the seven errors
 *
 * summarizeResults decides pass / fix / block and the CLI exit code (0, 1, 2).
 * reportJSON builds qa-report.json; reportMarkdown renders the same report
 * for people. The Markdown template is fixed (see references/qa-gates.md) so
 * the Python engine can produce byte-identical output.
 */

const isOverriddenBy = (r, list) =>
  isObj(r.overridden) ||
  (list || []).some((o) => isObj(o) && (o.gate === r.gate || o.rule === r.rule) && (!o.slide || o.slide === r.slide));

function summarizeResults(results, overrides) {
  let R = null;
  try {
    R = loadRules();
  } catch (e) {
    R = null;
  }
  const counts = { block: 0, fix: 0, note: 0 };
  results.forEach((r) => {
    const ext = (overrides || []).length && (!R || isOverridableRule(R, r.rule)) ? isOverriddenBy(r, overrides) : isObj(r.overridden);
    if (ext) return;
    counts[String(r.sev).toLowerCase()]++;
  });
  const status = counts.block ? "block" : counts.fix ? "fix" : "pass";
  return { status, counts, exitCode: counts.block ? 2 : counts.fix ? 1 : 0 };
}

const CAP_RESULTS = 600;

/** qa-report.json (qa-report.schema.json). `env` may carry: checkpoint, lane,
 *  painter, userAgent, fonts, thumbnail, video, files, createdAt. */
function reportJSON(spec, results, env) {
  env = env || {};
  const sum = summarizeResults(results);
  const rep = {
    schemaVersion: 1,
    specId: spec.id,
    rev: spec.rev,
    engine: QA.ENGINE
  };
  rep.createdAt = env.createdAt || new Date().toISOString();
  const checkpoint = env.checkpoint || spec.checkpoint;
  if (checkpoint) rep.checkpoint = checkpoint;
  if (env.lane) rep.lane = env.lane;
  rep.status = sum.status;
  rep.exitCode = sum.exitCode;
  rep.counts = sum.counts;
  rep.results = results.slice(0, CAP_RESULTS).map((r) => deepClone(r));
  rep.stats = deepClone(results.stats || env.stats || { gates: {} });
  if (results.stats) rep.results.stats = deepClone(results.stats);
  const ov = results
    .filter((r) => isObj(r.overridden))
    .map((r) => {
      const o = { gate: r.gate };
      if (r.slide) o.slide = r.slide;
      o.reason = r.overridden.reason;
      o.at = r.overridden.at;
      return o;
    })
    .slice(0, 100);
  if (ov.length) rep.overrides = ov;
  const e = {};
  if (["svg", "replay", "dom"].indexOf(env.painter) >= 0) e.painter = env.painter;
  if (nonEmpty(env.userAgent)) e.userAgent = String(env.userAgent).slice(0, 300);
  if (Array.isArray(env.fonts) && env.fonts.length) e.fonts = env.fonts.slice(0, 20).map((f) => String(f).slice(0, 80));
  if (spec.locale && spec.locale.dialect) e.dialect = spec.locale.dialect;
  if (spec.locale && spec.locale.digits) e.digits = spec.locale.digits;
  if (Object.keys(e).length) rep.environment = e;
  if (isObj(env.thumbnail)) {
    rep.thumbnail = { heroPx: env.thumbnail.heroPx, pass: !!env.thumbnail.pass, localContrast: env.thumbnail.localContrast };
  }
  if (isObj(env.video)) rep.video = env.video;
  if (Array.isArray(env.files) && env.files.length) rep.files = env.files.slice(0, 200);
  return rep;
}

const MD_LABELS = {
  ar: {
    title: "تقرير الجودة",
    status: "الحالة",
    rev: "المراجعة",
    checkpoint: "المرحلة",
    level: "المستوى",
    count: "العدد",
    none: "لا توجد ملاحظات.",
    overrides: "تجاوزات",
    environment: "البيئة",
    painter: "الرس\u0651ام",
    dialect: "اللهجة",
    digits: "الأرقام",
    fonts: "الخطوط",
    statusText: { pass: "ناجح", fix: "يحتاج تعديلات", block: "محظور" },
    digitNames: { western: "غربية (123)", "arabic-indic": "هندية (١٢٣)" }
  },
  en: {
    title: "QA report",
    status: "Status",
    rev: "Revision",
    checkpoint: "Checkpoint",
    level: "Level",
    count: "Count",
    none: "No findings.",
    overrides: "Overrides",
    environment: "Environment",
    painter: "Painter",
    dialect: "Dialect",
    digits: "Digits",
    fonts: "Fonts",
    statusText: { pass: "Pass", fix: "Needs fixes", block: "Blocked" },
    digitNames: { western: "Western (123)", "arabic-indic": "Arabic-Indic (١٢٣)" }
  }
};

/** qa-report.md. Same report, same lang -> same bytes. */
function reportMarkdown(report, lang) {
  const L = MD_LABELS[lang === "en" ? "en" : "ar"];
  const code = lang === "en" ? "en" : "ar";
  const lines = [];
  lines.push("# " + L.title + " — " + report.specId);
  lines.push("");
  let head = "**" + L.status + ":** " + L.statusText[report.status] + " · **" + L.rev + ":** " + report.rev;
  if (report.checkpoint) head += " · **" + L.checkpoint + ":** " + report.checkpoint;
  lines.push(head);
  lines.push("");
  lines.push("| " + L.level + " | " + L.count + " |");
  lines.push("|---|---|");
  lines.push("| BLOCK | " + report.counts.block + " |");
  lines.push("| FIX | " + report.counts.fix + " |");
  lines.push("| NOTE | " + report.counts.note + " |");
  lines.push("");
  const open = report.results.filter((r) => !isObj(r.overridden));
  if (!open.length) {
    lines.push(L.none);
    lines.push("");
  }
  ["BLOCK", "FIX", "NOTE"].forEach((sev) => {
    const list = open.filter((r) => r.sev === sev);
    if (!list.length) return;
    lines.push("## " + sev);
    lines.push("");
    list.forEach((r) => {
      let s = "- " + (r.slide || "—") + " · " + r.rule + " · " + r.msg[code];
      if (r.fix) s += " — " + r.fix[code];
      lines.push(s);
    });
    lines.push("");
  });
  const ov = report.overrides || [];
  if (ov.length) {
    lines.push("## " + L.overrides);
    lines.push("");
    ov.forEach((o) => lines.push("- " + o.gate + " · " + (o.slide || "—") + " · " + o.reason + " (" + o.at + ")"));
    lines.push("");
  }
  const env = report.environment || {};
  const envLines = [];
  if (env.painter) envLines.push("- " + L.painter + ": " + env.painter);
  if (env.dialect) envLines.push("- " + L.dialect + ": " + env.dialect);
  if (env.digits) envLines.push("- " + L.digits + ": " + (L.digitNames[env.digits] || env.digits));
  if (env.fonts && env.fonts.length) envLines.push("- " + L.fonts + ": " + env.fonts.join(", "));
  if (envLines.length) {
    lines.push("## " + L.environment);
    lines.push("");
    envLines.forEach((l) => lines.push(l));
    lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

/* ----------------------------------------------------------- seven errors */

const SEVEN_ERRORS = [
  { id: "small-text", title: { ar: "خط صغير", en: "Small text" }, rules: ["D3.body-floor", "D3.meta-floor", "D3.hero-floor", "T1.hero-small"], scope: "rendered" },
  { id: "wrong-ratio", title: { ar: "نسبة أبعاد خاطئة", en: "Wrong ratio" }, gates: ["D1"], scope: "rendered" },
  { id: "generic-design", title: { ar: "تصميم عام بلا هوية", en: "Generic design" }, gates: ["D7", "D8", "D9"], scope: "rendered" },
  { id: "crowding", title: { ar: "ازدحام", en: "Crowding" }, gates: ["C2", "D6"], scope: "text" },
  { id: "static-cover", title: { ar: "غلاف ثابت", en: "Static cover" }, gates: ["V1"], scope: "export" },
  {
    id: "random-structure",
    title: { ar: "بنية عشوائية", en: "Random structure" },
    rules: ["C5.skeleton", "C5.bridge", "C5.voice-drift", "C6.list-count", "C6.slide2-promise"],
    scope: "text"
  },
  { id: "repeated-cta", title: { ar: "دعوة مكررة", en: "Repeated CTA" }, rules: ["C7.cta-repeat", "C4.multiple"], scope: "text" }
];
const SLIDE_COUNT_RULES = ["C5.slide-count", "C5.slide-count-low", "C5.slide-count-range"];

const SEV_TO_STATUS = { BLOCK: "block", FIX: "fix", NOTE: "note" };

/** The /audit report: one verdict per error plus the slide count. `ran` tells
 *  which scopes were run; an error whose scope was not run reports "n/a". */
function sevenErrorsOf(results, spec, ran) {
  ran = Object.assign({ text: true, rendered: true, export: true }, ran || {});
  const open = results.filter((r) => !isObj(r.overridden));
  const verdict = (list) => {
    if (!list.length) return "pass";
    return SEV_TO_STATUS[list.slice().sort((a, b) => QA.SEV_RANK[a.sev] - QA.SEV_RANK[b.sev])[0].sev];
  };
  const errors = SEVEN_ERRORS.map((e) => {
    const findings = open.filter((r) => (e.gates && e.gates.indexOf(r.gate) >= 0) || (e.rules && e.rules.indexOf(r.rule) >= 0));
    const na = !ran[e.scope] && !findings.length;
    return { id: e.id, title: e.title, status: na ? "n/a" : verdict(findings), findings };
  });
  const countFindings = open.filter((r) => SLIDE_COUNT_RULES.indexOf(r.rule) >= 0);
  return {
    errors,
    slideCount: { n: ((spec && spec.slides) || []).length, status: ran.text ? verdict(countFindings) : "n/a", findings: countFindings }
  };
}
