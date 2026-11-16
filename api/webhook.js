const { getBot } = require("../lib/bot");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = req.headers["x-telegram-bot-api-secret-token"];
  if (!expected || !received || received !== expected) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const bot = getBot();
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook handler failed:", error);
    return res.status(500).send("Webhook processing failed");
  }
};
