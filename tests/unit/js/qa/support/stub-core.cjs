"use strict";
/*
 * Test support for the QA unit tests: the rule bundle read from the plugin's
 * data folder and the stubbed CS.core libraries (see stub-lib.js).
 */

const fs = require("fs");
const path = require("path");
const { text, color } = require("./stub-lib.js");

const REPO = path.resolve(__dirname, "../../../../..");
const DESIGN = path.join(REPO, "plugins/carousel-studio/skills/carousel-design");

/* -------------------------------------------------------------- registry */
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function loadBundle(overrides) {
  const d = (f) => readJson(path.join(DESIGN, "data", f));
  const exists = (p) => fs.existsSync(p);
  const dialects = {};
  ["eg", "gulf", "levant", "msa-white", "en"].forEach((k) => {
    const p = path.join(DESIGN, "data/dialects", k + ".json");
    dialects[k] = exists(p) ? readJson(p) : { deny: [], warn: [] };
  });
  const copyPath = path.join(DESIGN, "data/rules/copy.json");
  const orthoPath = path.join(DESIGN, "data/rules/ortho.json");
  return Object.assign(
    {
      qaRules: d("qa-rules.json"),
      copy: exists(copyPath) ? readJson(copyPath) : { lists: {} },
      ortho: exists(orthoPath) ? readJson(orthoPath) : { clitics: [], rules: [] },
      dialects,
      platform: d("platform-instagram.json"),
      locale: d("locale-defaults.json")
    },
    overrides || {}
  );
}

module.exports = { text, color, loadBundle, REPO, DESIGN };
