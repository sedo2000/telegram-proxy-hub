const { getStats } = require("../lib/store");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  const secret = process.env.SETUP_SECRET;
  if (!secret || !safeEqual(req.headers.authorization || "", "Bearer " + secret)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const stats = await getStats();
    return res.status(200).json({ ok: true, service: "MTProto Proxy Hub", mode: "MTProto only", ...stats, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Admin stats failed:", error.message);
    return res.status(500).json({ error: "Admin stats unavailable" });
  }
};
