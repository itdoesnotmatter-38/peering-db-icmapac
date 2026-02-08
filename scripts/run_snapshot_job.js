#!/usr/bin/env node

const { runGlobalSnapshot } = require("../api/_lib/snapshotRunner");

const args = new Set(process.argv.slice(2));
const force = args.has("--force") || args.has("-f");

(async () => {
  try {
    const result = await runGlobalSnapshot({ force });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  }
})();
