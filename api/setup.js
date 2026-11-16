const { Telegraf } = require("telegraf");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const secret = process.env.SETUP_SECRET;
  if (!secret || !safeEqual(req.headers.authorization || "", "Bearer " + secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const required = [
    "BOT_TOKEN",
    "APP_URL",
    "TELEGRAM_WEBHOOK_SECRET",
    "CHANNEL_ID",
    "CHANNEL_URL",
    "CHANNEL_USERNAME"
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) return res.status(400).json({ error: "Missing environment variables", missing });

  try {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const webhookUrl = process.env.APP_URL.replace(/\/+$/, "") + "/api/webhook";
    const result = await bot.telegram.setWebhook(webhookUrl, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false
    });
    return res.status(200).json({
      ok: result,
      webhookUrl,
      note: "Telegram webhook configured. Keep SETUP_SECRET private."
    });
  } catch (error) {
    console.error("Webhook setup failed:", error);
    return res.status(500).json({ error: "Webhook setup failed", message: error.message });
  }
};
