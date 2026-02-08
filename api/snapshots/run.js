const { runGlobalSnapshot } = require("../_lib/snapshotRunner");

const ensureAuth = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.query?.secret;
  return token === secret;
};

module.exports = async (req, res) => {
  if (!ensureAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const force = req.query?.force === "1" || req.query?.force === "true";

  try {
    const result = await runGlobalSnapshot({ force });
    res.status(200).json(result);
  } catch (err) {
    console.error("Snapshot run failed", err);
    res.status(500).json({ error: err?.message || "Snapshot run failed" });
  }
};
