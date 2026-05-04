#!/usr/bin/env node

const { runGlobalSnapshot } = require("../api/_lib/snapshotRunner");

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const force = args.has("--force") || args.has("-f");
const snapshotDateArg = rawArgs
  .find((arg) => arg.startsWith("--snapshot-date="))
  ?.slice("--snapshot-date=".length);

(async () => {
  try {
    const result = await runGlobalSnapshot({
      force,
      config: {
        snapshotDate: snapshotDateArg || process.env.SNAPSHOT_DATE_OVERRIDE || "",
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  }
})();
