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
  const mtproto = proxy.type === "mtproto";
  return [
    "🚀 <b>بروكسي تيليجرام جديد</b>",
    "",
    "🛡 <b>النوع:</b> " + (mtproto ? "MTProto" : "SOCKS5"),
    "🌐 <b>الخادم:</b> <code>" + proxy.host + "</code>",
    "🔌 <b>المنفذ:</b> <code>" + proxy.port + "</code>",
    mtproto ? "🔑 <b>المفتاح:</b> <code>" + proxy.secret + "</code>" : "",
    "⚡ <b>زمن اتصال TCP:</b> " + proxy.latency + " ms",
    "",
    mtproto
      ? "🟡 تم التحقق من فتح منفذ TCP فقط؛ لم يتم إثبات نجاح مصافحة MTProto."
      : "🟢 نجح اختبار SOCKS5 إلى نقطة اتصال تيليجرام وقت الفحص.",
    "⚠️ بروكسي عام من طرف ثالث؛ لا تستخدمه للمعلومات الحساسة."
  ].filter(Boolean).join("\n");
}

function keyboard(proxy) {
  const connect = proxy.type === "mtproto"
    ? "tg://proxy?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port + "&secret=" + encodeURIComponent(proxy.secret)
    : "tg://socks?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port;
  const share = "https://t.me/share/url?url=" + encodeURIComponent(connect) +
    "&text=" + encodeURIComponent("جرب بروكسي تيليجرام " + proxy.type.toUpperCase());
  return Markup.inlineKeyboard([
    [Markup.button.url("🔗 اتصال بالبروكسي", connect)],
    [Markup.button.url("📤 مشاركة مع الأصدقاء", share)]
  ]);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.authorization || "", "Bearer " + secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const required = ["BOT_TOKEN", "CHANNEL_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) return res.status(500).json({ error: "Missing environment variables", missing });

  try {
    const working = await collectWorkingProxies();
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const maxPosts = Math.max(1, Math.min(10, Number(process.env.MAX_PROXIES_PER_POST || 5)));
    let published = 0;
    for (const proxy of [...working.mtproto, ...working.socks5].sort((a, b) => a.latency - b.latency)) {
      if (published >= maxPosts) break;
      if (await hasPublished(proxy.id)) continue;
      await bot.telegram.sendMessage(process.env.CHANNEL_ID, message(proxy), {
        parse_mode: "HTML",
        ...keyboard(proxy)
      });
      await markPublished(proxy);
      published++;
    }
    return res.status(200).json({
      ok: true,
      candidatesPassed: { mtproto: working.mtproto.length, socks5: working.socks5.length },
      published,
      checkedAt: new Date().toISOString(),
      note: "MTProto entries passed a TCP reachability check only, not a full protocol handshake."
    });
  } catch (error) {
    console.error("Cron scan failed:", error);
    return res.status(500).json({ error: "Scan failed", message: error.message });
  }
};
