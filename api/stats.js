const { getStats } = require("../lib/store");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  const secret = process.env.SETUP_SECRET;
  if (!secret || !safeEqual(req.headers.authorization || "", "Bearer " + secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const stats = await getStats();
    return res.status(200).json({ ok: true, ...stats, timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Stats unavailable", message: error.message });
  }
};
