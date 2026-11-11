/* Carousel Studio · cs-qa · public API (CS.qa)
 *
 * Assembles the module of CONTRACT 4.4 from the gate runners above. Scopes:
 *   runText      text      C1-C10, O1, N1, B1 (text), B2, SRC1, SEN1, D8  (any lane)
 *   runRendered  rendered  D1-D7, T1, B1 (rendered), A1              (needs a DOM)
 *   runExport    export    D1, V1, X1, A1                            (needs the files)
 * `run` merges the scopes that the given inputs allow and returns a QAReport.
 */

const TEXT_GATES = [
  ["C1", gateC1],
  ["C2", gateC2],
  ["C3", gateC3],
  ["C4", gateC4],
  ["C5", gateC5],
  ["C6", gateC6],
  ["C7", gateC7],
  ["C8", gateC8],
  ["C9", gateC9],
  ["C10", gateC10],
  ["O1", gateO1],
  ["N1", gateN1],
  ["B1", gateB1Text],
  ["B2", gateB2],
  ["SRC1", gateSRC1],
  ["SEN1", gateSEN1],
  ["D8", gateD8]
];

/** Post-process a scope's raw findings: dedupe, carry overrides, sort. */
function finishResults(ctx, raw, slideFilter) {
  let results = dedupeResults(raw);
  if (slideFilter) results = results.filter((f) => f.slide && slideFilter.has(f.slide));
  results = carryOverrides(ctx.R, ctx.spec, results);
  results = sortResults(ctx.R, ctx.spec, results);
  results.stats = ctx.stats;
  return results;
}

/** Counts executions, including clean runs; no module-global counters. */
function countGate(ctx, id) {
  ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + 1;
}

function extraGates(scope, ctx) {
  if (CS.qav && CS.qav.flush) CS.qav.flush();
  return QA.gates[scope].slice().filter((g) => !ctx.gates || [g.id].concat(g.ids || []).some((id) =>
    ctx.gates.has(id) || ctx.gates.has(id.split(".")[0])));
}

function runTextGates(input, opts) {
  const ctx = buildContext(input, opts);
  const out = [];
  TEXT_GATES.forEach((g) => {
    if (wantGate(ctx, g[0])) { countGate(ctx, g[0]); g[1](ctx, out); }
  });
  extraGates("text", ctx).forEach((g) => { countGate(ctx, g.id); out.push(...(g.run(ctx) || [])); });
  return finishResults(ctx, out, ctx.slideFilter);
}

async function runRenderedAll(input, opts) {
  const rc = await runRenderedGates(input, opts);
  return { results: finishResults(rc, rc.out, rc.slideFilter), rc };
}

function runExportAll(input, opts) {
  const sink = { videos: [] };
  const ec = runExportGates(Object.assign({}, input, { _sink: sink }), opts);
  return { results: finishResults(ec, ec.out, ec.slideFilter), sink };
}

const VIDEO_REPORT_KEYS = [
  "file", "width", "height", "fps", "seconds", "codec", "moovBeforeMdat", "keyframeAtZero", "closedGop",
  "audio", "loopSsim", "loopPsnr", "flashesPerSecondMax", "blankFrames", "stillShare", "thinRunSeconds"
];

function videoForReport(info) {
  const v = {};
  VIDEO_REPORT_KEYS.forEach((k) => {
    if (info[k] !== undefined && info[k] !== null && !(typeof info[k] === "number" && !isFinite(info[k]))) v[k] = info[k];
  });
  if (typeof v.fps === "number") v.fps = Math.round(v.fps * 100) / 100;
  if (typeof v.seconds === "number") v.seconds = Math.round(v.seconds * 1000) / 1000;
  return v;
}

function filesForReport(files) {
  return (files || []).map((f) => {
    const o = { path: String(f.path).slice(0, 200), bytes: f.bytes ? f.bytes.length : 0 };
    if (f.mime) o.mime = String(f.mime).slice(0, 60);
    const k = f.bytes ? fileKind(f).kind : "";
    if (k === "png") {
      const i = pngInfo(f.bytes);
      if (i.ok) {
        o.width = i.w;
        o.height = i.h;
      }
    } else if (k === "jpeg") {
      const i = jpegInfo(f.bytes);
      if (i.ok) {
        o.width = i.w;
        o.height = i.h;
      }
    }
    return o;
  });
}

async function runAll(input, opts) {
  opts = opts || {};
  if (!input || !isObj(input.spec)) throw qaError("E_USAGE", "CS.qa.run needs { spec }");
  const parts = [];
  const ran = { text: true, rendered: false, export: false };
  let ctx = null;
  let thumbnail = null;
  let fonts = null;
  let videos = [];

  ctx = buildContext(input, opts);
  const textResults = runTextGates(input, opts);
  ctx.stats = textResults.stats;
  textResults.forEach((f) => parts.push(f));
  if (input.deck) {
    const r = await runRenderedAll(input, opts);
    r.results.forEach((f) => parts.push(f));
    Object.keys(r.rc.stats.gates).forEach((id) => {
      ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + r.rc.stats.gates[id];
    });
    thumbnail = r.rc.thumbnail;
    fonts = r.rc.fontsUsed ? Array.from(r.rc.fontsUsed).filter(Boolean) : null;
    ran.rendered = true;
  }
  if (Array.isArray(input.files) && input.files.length) {
    const e = runExportAll(input, opts);
    e.results.forEach((f) => parts.push(f));
    Object.keys(e.results.stats.gates).forEach((id) => {
      ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + e.results.stats.gates[id];
    });
    videos = e.sink.videos;
    ran.export = true;
  }
  const results = finishResults(ctx, parts, null);
  const report = reportJSON(input.spec, results, {
    checkpoint: input.checkpoint,
    lane: input.lane,
    painter: input.painter || (ran.rendered ? "dom" : undefined),
    userAgent: input.includeUserAgent === true && typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    fonts,
    thumbnail,
    video: videos.length ? videoForReport(videos[0]) : undefined,
    files: ran.export ? filesForReport(input.files) : undefined,
    createdAt: opts.createdAt
  });
  if (typeof CS.emit === "function") CS.emit("cs:qa", { report });
  return report;
}

/* ----------------------------------------------- contrast / thumbnail API */

async function contrastMeasure(slideEl, tokens) {
  let p = { decile: 0.1, largeMinPx: 66, largeBoldMinPx: 52 };
  try {
    p = loadRules().checks["D4.contrast"].def.params;
  } catch (e) {
    /* rules not registered: platform defaults */
  }
  const S = slideInfo({ el: slideEl, id: slideEl.getAttribute("data-cs-slide") || "", tokens }, { spec: { canvas: {}, slides: [] }, tokens });
  const items = await measureSlide(S, p.decile);
  const byKey = {};
  items.forEach((it) => {
    if (!it.res) return;
    const cur = byKey[it.key];
    if (!cur || it.res.decile < cur.ratio) {
      byKey[it.key] = {
        key: it.key,
        ratio: Math.round(it.res.decile * 100) / 100,
        large: isLargeText(it.fontPx, it.weight, p),
        min: it.res.min
      };
    }
  });
  const list = Object.keys(byKey).map((k) => byKey[k]);
  return {
    ratioMin: list.length ? Math.round(Math.min.apply(null, list.map((x) => x.min)) * 100) / 100 : 0,
    worstDecile: list.length ? Math.min.apply(null, list.map((x) => x.ratio)) : 0,
    byElement: list.map((x) => ({ key: x.key, ratio: x.ratio, large: x.large }))
  };
}

/* ------------------------------------------------------------------ CS.qa */

CS.qa = {
  splitCover: splitCover,
  version: QA.ENGINE,
  _: { gates: QA.gates, slideFields },

  /** qa-rules.json with every $platform reference resolved. */
  rules() {
    return loadRules().doc;
  },

  runText(input, opts) {
    return runTextGates(input, opts);
  },

  async runRendered(input, opts) {
    return (await runRenderedAll(input, opts)).results;
  },

  async runExport(input, opts) {
    return runExportAll(input, opts).results;
  },

  run: runAll,

  summarize: summarizeResults,

  autofix: autofixSpec,

  override: overrideSpec,

  contrast: { measure: contrastMeasure },

  /** T1: hero size at 130 px wide and local contrast of a cover slide. */
  thumbnail(slideEl) {
    return thumbnailOf(slideEl, null, null);
  },

  /** V1 loop: frame 0 against the poster and the last frame against frame 0. */
  loopCheck: loopCheckOf,

  report: { toJSON: reportJSON, toMarkdown: reportMarkdown },

  /* ---- additions beyond CONTRACT 4.4 (documented in references/qa-gates.md) */

  /** The spec.qa block for a report: { status, runAt, engine, results (max 400) }. */
  specQa(report) {
    return { status: report.status, runAt: report.createdAt, engine: report.engine, results: report.results.slice(0, 400) };
  },

  /** Lint one text: ortho.json rules, built-in checks and dialect markers. */
  lintText,

  /** True when autofix can repair the finding. */
  isAutofixable,

  /** Rule definition for the Check screen: gate, severity, conditions, messages. */
  describe(ruleId) {
    const R = loadRules();
    const gateId = String(ruleId).split(".")[0];
    const dynamic = R.gates[gateId] && R.gates[gateId].dynamicRules === true;
    const e = R.checks[ruleId] || (dynamic ? R.checks[gateId + ".ortho"] : null);
    if (!e) return null;
    return {
      gate: e.gate.id,
      rule: ruleId,
      title: e.gate.title,
      sev: e.def.sev,
      overridable: isOverridableRule(R, ruleId),
      autofix: e.def.autofix || null,
      when: e.def.when,
      msg: e.def.msg,
      fix: e.def.fix || null
    };
  },

  /** The /audit report: seven verdicts and the slide count. */
  sevenErrors: sevenErrorsOf,

  /** Fill a VideoInfo from the bytes of an MP4 (box order, size, frames, keyframes). */
  inspectMp4: videoInfoFromMp4,

  metrics: { ssim: ssimOf, psnr: psnrOf }
};
