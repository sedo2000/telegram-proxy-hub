const { Telegraf, Markup } = require("telegraf");
const { getLatestProxies, saveUser, saveProxy } = require("./store");
const { parseMtprotoLine, checkMtprotoProxy } = require("./proxies");

let instance;

function getBot() {
  if (instance) return instance;
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is not configured");

  const bot = new Telegraf(process.env.BOT_TOKEN);
  const channelId = process.env.CHANNEL_ID;
  const channelUrl = process.env.CHANNEL_URL;
  if (!channelId || !channelUrl) throw new Error("CHANNEL_ID and CHANNEL_URL are required");

  async function subscribed(userId) {
    try {
      const member = await bot.telegram.getChatMember(channelId, userId);
      return ["creator", "administrator", "member"].includes(member.status) ||
        (member.status === "restricted" && member.is_member === true);
    } catch (error) {
      console.error("Membership check failed:", error.message);
      return false;
    }
  }

  function joinKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.url("📢 اشترك بالقناة", channelUrl)],
      [Markup.button.callback("✅ تحققت من الاشتراك", "CHECK_SUBSCRIPTION")]
    ]);
  }

  function proxyKeyboard(proxy) {
    const connect = proxy.type === "mtproto"
      ? "tg://proxy?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port + "&secret=" + encodeURIComponent(proxy.secret || "")
      : "tg://socks?server=" + encodeURIComponent(proxy.host) + "&port=" + proxy.port;
    const share = "https://t.me/share/url?url=" + encodeURIComponent(connect) +
      "&text=" + encodeURIComponent("بروكسي تيليجرام " + String(proxy.type || "socks5").toUpperCase());
    return Markup.inlineKeyboard([
      [Markup.button.url("🔗 اتصال بالبروكسي", connect)],
      [Markup.button.url("📤 مشاركة مع الأصدقاء", share)]
    ]);
  }

  async function deliverProxies(ctx) {
    const proxies = await getLatestProxies(10);
    if (!proxies.length) {
      return ctx.reply("لا توجد بروكسيات محفوظة حالياً. حاول لاحقاً أو تابع القناة للتحديثات.", {
        ...Markup.inlineKeyboard([[Markup.button.url("📢 فتح القناة", channelUrl)]])
      });
    }
    await ctx.reply("⚡ أحدث البروكسيات التي اجتازت الفحص الأولي. قد تتغير حالتها حسب مزود الإنترنت:");
    for (const proxy of proxies) {
      const mtproto = proxy.type === "mtproto";
      const body = [
        "🚀 <b>بروكسي تيليجرام</b>",
        "🛡 النوع: <b>" + (mtproto ? "MTProto" : "SOCKS5") + "</b>",
        "🌐 الخادم: <code>" + proxy.host + "</code>",
        "🔌 المنفذ: <code>" + proxy.port + "</code>",
        mtproto ? "🔑 المفتاح: <code>" + (proxy.secret || "") + "</code>" : "",
        "⚡ زمن الفحص: <b>" + proxy.latency + " ms</b>",
        mtproto ? "🟡 فُحص اتصال TCP فقط، وليس مصافحة MTProto كاملة." : "🟢 اجتاز اختبار اتصال SOCKS5 إلى تيليجرام.",
        "⚠️ بروكسي عام من طرف ثالث؛ لا تستخدمه للمعلومات الحساسة."
      ].filter(Boolean).join("\n");
      await ctx.reply(body, { parse_mode: "HTML", ...proxyKeyboard(proxy) });
    }
  }

  async function register(ctx) {
    if (ctx.from) {
      try { await saveUser(ctx.from); }
      catch (error) { console.error("User save failed:", error.message); }
    }
  }


  // Ingest MTProto links posted in the configured source channel.
  bot.on("channel_post", async ctx => {
    const sourceUsername = String(process.env.SOURCE_CHANNEL_USERNAME || "I5I5Ie").replace(/^@/, "").toLowerCase();
    const chat = ctx.channelPost && ctx.channelPost.chat;
    if (!chat || String(chat.username || "").toLowerCase() !== sourceUsername) return;
    const content = [ctx.channelPost.text, ctx.channelPost.caption].filter(Boolean).join("\n");
    const candidates = [...content.matchAll(/(?:https?:\/\/)?t\.me\/proxy\?[^\s<>()]+|tg:\/\/proxy\?[^\s<>()]+|[^\s:]+:\d{1,5}:[a-z0-9_-]{16,64}/gi)].map(match => match[0].replace(/[),.;]+$/, ""));
    let saved = 0;
    for (const candidate of candidates.slice(0, 20)) {
      const proxy = parseMtprotoLine(candidate);
      if (!proxy) continue;
      const checked = await checkMtprotoProxy(proxy);
      if (!checked) continue;
      await saveProxy(checked);
      saved++;
    }
    console.log("Source channel MTProto ingest:", { channel: chat.username, saved });
  });

  bot.start(async ctx => {
    await register(ctx);
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply(
        "أهلاً بك في Telegram Proxy Hub 🇮🇶\n\nاشترك بالقناة أولاً ثم اضغط تحقق الاشتراك للحصول على البروكسيات.",
        joinKeyboard()
      );
    }
    await ctx.reply("أهلاً بك! تم التحقق من اشتراكك. اضغط للحصول على أحدث البروكسيات.", {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚡ أرسل لي البروكسيات", "GET_PROXIES")],
        [Markup.button.url("📢 القناة", channelUrl)]
      ])
    });
  });

  bot.command("latest", async ctx => {
    await register(ctx);
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("🔒 اشترك بالقناة أولاً للحصول على البروكسيات.", joinKeyboard());
    }
    return deliverProxies(ctx);
  });

  bot.action("CHECK_SUBSCRIPTION", async ctx => {
    await ctx.answerCbQuery();
    await register(ctx);
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("لم يظهر اشتراكك بعد. اشترك بالقناة ثم أعد التحقق.", joinKeyboard());
    }
    return ctx.reply("✅ تم التحقق من اشتراكك. اضغط للحصول على البروكسيات.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("⚡ الحصول على البروكسيات", "GET_PROXIES")]])
    });
  });

  bot.action("GET_PROXIES", async ctx => {
    await ctx.answerCbQuery();
    await register(ctx);
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("🔒 يجب الاشتراك بالقناة أولاً.", joinKeyboard());
    }
    return deliverProxies(ctx);
  });

  bot.catch((error, ctx) => {
    console.error("Bot update error:", error.message);
    if (ctx && ctx.chat) return ctx.reply("حدث خطأ مؤقت. حاول مرة أخرى.").catch(() => {});
  });

  instance = bot;
  return bot;
}

module.exports = { getBot };
