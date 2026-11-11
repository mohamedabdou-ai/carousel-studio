// Run browser suites without external requests: NODE_OPTIONS=--import=<this file's file: URL>.
// An existing, pinned ESM bundle may be supplied as CS_TEST_MEDIABUNNY; nothing is downloaded.
import fs from "node:fs";
import { chromium } from "playwright-core";
const original = chromium.launch.bind(chromium);
chromium.launch = async function (options) {
  const browser = await original(options), newContext = browser.newContext.bind(browser);
  async function isolate(context) {
    await context.route(/^https?:\/\//, async route => {
      const url = new URL(route.request().url());
      if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return route.continue();
      if (url.href === "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm" && process.env.CS_TEST_MEDIABUNNY) {
        return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(process.env.CS_TEST_MEDIABUNNY), headers: { "access-control-allow-origin": "*" } });
      }
      return route.abort("blockedbyclient");
    });
    return context;
  }
  browser.newContext = async options => isolate(await newContext(options));
  browser.newPage = async options => (await browser.newContext(options)).newPage();
  return browser;
};
