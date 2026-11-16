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
    "BOT_TOKEN", "APP_URL", "TELEGRAM_WEBHOOK_SECRET",
    "CHANNEL_ID", "CHANNEL_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) return res.status(400).json({ error: "Missing environment variables", missing });

  try {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const me = await bot.telegram.getMe();
    const channel = await bot.telegram.getChat(process.env.CHANNEL_ID);
    const botMember = await bot.telegram.getChatMember(process.env.CHANNEL_ID, me.id);
    const canPost = botMember.status === "creator" ||
      botMember.status === "administrator" && botMember.can_post_messages === true;
    if (!canPost) {
      return res.status(400).json({
        error: "Bot must be a channel administrator with permission to post messages",
        botUsername: me.username,
        channelTitle: channel.title || channel.username || null,
        botStatus: botMember.status,
        canPostMessages: botMember.can_post_messages === true
      });
    }

    const webhookUrl = process.env.APP_URL.replace(/\/+$/, "") + "/api/webhook";
    const result = await bot.telegram.setWebhook(webhookUrl, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false
    });
    return res.status(200).json({
      ok: result,
      bot: "@" + me.username,
      channel: channel.title || channel.username,
      webhookUrl,
      note: "Webhook configured and channel posting permission verified."
    });
  } catch (error) {
    console.error("Webhook setup failed:", error);
    return res.status(500).json({ error: "Webhook setup failed", message: error.message });
  }
};
