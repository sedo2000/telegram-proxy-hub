const { collectWorkingProxies } = require("../lib/proxies");
const { hasPublished, markPublished } = require("../lib/store");
const { Telegraf, Markup } = require("telegraf");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function message(proxy) {
  return [
    "🚀 <b>بروكسي تيليجرام جديد</b>",
    "",
    "🛡 <b>النوع:</b> SOCKS5",
    "🌐 <b>IP:</b> <code>" + proxy.host + "</code>",
    "🔌 <b>Port:</b> <code>" + proxy.port + "</code>",
    "⚡ <b>زمن الاتصال:</b> " + proxy.latency + " ms",
    "",
    "🟢 نجح اختبار اتصال SOCKS5 إلى نقطة اتصال تيليجرام وقت الفحص.",
    "⚠️ بروكسي عام؛ لا تستخدمه للمعلومات الحساسة."
  ].join("\n");
}

function keyboard(proxy) {
  const connect = "tg://socks?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port;
  const share = "https://t.me/share/url?url=" + encodeURIComponent(connect) +
    "&text=" + encodeURIComponent("جرب بروكسي تيليجرام");
  return Markup.inlineKeyboard([
    [Markup.button.url("🔗 اتصال بالبروكسي", connect)],
    [Markup.button.url("📤 مشاركة مع الأصدقاء", share)]
  ]);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || "";
  if (!secret || !safeEqual(authorization, "Bearer " + secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.BOT_TOKEN || !process.env.CHANNEL_ID) {
    return res.status(500).json({ error: "BOT_TOKEN or CHANNEL_ID is missing" });
  }

  try {
    const working = await collectWorkingProxies();
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const maxPosts = Math.max(1, Number(process.env.MAX_PROXIES_PER_POST || 5));
    let published = 0;

    for (const proxy of working) {
      if (published >= maxPosts) break;
      if (await hasPublished(proxy.id)) continue;

      await bot.telegram.sendMessage(
        process.env.CHANNEL_ID,
        message(proxy),
        { parse_mode: "HTML", ...keyboard(proxy) }
      );

      await markPublished(proxy.id);
      published++;
    }

    return res.status(200).json({
      ok: true,
      tested: working.length,
      published,
      checkedAt: new Date().toISOString(),
      persistence: Boolean(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      )
    });
  } catch (error) {
    console.error("Cron scan failed:", error);
    return res.status(500).json({ error: "Scan failed", message: error.message });
  }
};
