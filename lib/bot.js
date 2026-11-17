const { Telegraf, Markup } = require("telegraf");
const { getLatestProxies, saveUser, saveProxy, getStats, setFavorite, getFavorites } = require("./store");
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
    const connect = "tg://proxy?server=" + encodeURIComponent(proxy.host) +
      "&port=" + proxy.port + "&secret=" + encodeURIComponent(proxy.secret || "");
    const share = "https://t.me/share/url?url=" + encodeURIComponent(connect) +
      "&text=" + encodeURIComponent("بروكسي تيليجرام MTProto");
    return Markup.inlineKeyboard([
      [Markup.button.url("🔗 اتصال ببروكسي MTProto", connect)],
      [Markup.button.callback("⭐ أضف للمفضلة", "FAV:" + encodeURIComponent(proxy.id))],
      [Markup.button.url("📤 مشاركة مع الأصدقاء", share)]
    ]);
  }

  async function deliverProxies(ctx, order = "latency_ms.asc") {
    const proxies = (await getLatestProxies(10, order)).filter(proxy => proxy.type === "mtproto" && proxy.secret);
    if (!proxies.length) {
      return ctx.reply("لا توجد بروكسيات MTProto متاحة حالياً. حاول لاحقاً أو تابع القناة للتحديثات.", {
        ...Markup.inlineKeyboard([[Markup.button.url("📢 فتح القناة", channelUrl)]])
      });
    }
    await ctx.reply("⚡ أحدث البروكسيات التي اجتازت الفحص الأولي. قد تتغير حالتها حسب مزود الإنترنت:");
    for (const proxy of proxies) {
      const mtproto = proxy.type === "mtproto";
      const body = [
        "🚀 <b>بروكسي تيليجرام</b>",
        "🛡 النوع: <b>MTProto</b>",
        "🌐 الخادم: <code>" + proxy.host + "</code>",
        "🔌 المنفذ: <code>" + proxy.port + "</code>",
        "🔑 المفتاح: <code>" + proxy.secret + "</code>",
        "⚡ زمن الفحص: <b>" + proxy.latency + " ms</b>",
        "🟡 فُحص اتصال TCP فقط، وليس مصافحة MTProto كاملة.",
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
    await ctx.reply("أهلاً بك في مركز بروكسيات MTProto 🇮🇶\nاختر الخدمة:", {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚡ أسرع البروكسيات", "GET_PROXIES"), Markup.button.callback("🆕 أحدث البروكسيات", "GET_NEWEST")],
        [Markup.button.callback("⭐ المفضلة", "MY_FAVORITES"), Markup.button.callback("📊 الإحصائيات", "PUBLIC_STATS")],
        [Markup.button.callback("🔍 طريقة فحص بروكسي", "HOW_TO_CHECK")],
        [Markup.button.url("📢 قناة التحديثات", channelUrl)]
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

  bot.action("GET_NEWEST", async ctx => {
    await ctx.answerCbQuery();
    if (!(await subscribed(ctx.from.id))) return ctx.reply("🔒 اشترك بالقناة أولاً.", joinKeyboard());
    return deliverProxies(ctx, "checked_at.desc");
  });

  bot.action("HOW_TO_CHECK", async ctx => {
    await ctx.answerCbQuery();
    return ctx.reply("أرسل الأمر /check متبوعاً برابط MTProto. الفحص الحالي يقيس استجابة منفذ TCP فقط ولا يثبت نجاح مصافحة MTProto كاملة.");
  });

  bot.action("PUBLIC_STATS", async ctx => {
    await ctx.answerCbQuery();
    try {
      const s = await getStats();
      return ctx.reply("📊 إحصائيات البوت\n👥 المستخدمون: " + s.users + "\n⚡ بروكسيات MTProto النشطة: " + s.activeProxies);
    } catch (e) { return ctx.reply("تعذر جلب الإحصائيات حالياً."); }
  });

  bot.action("MY_FAVORITES", async ctx => {
    await ctx.answerCbQuery();
    try {
      const ids = await getFavorites(ctx.from.id);
      const all = await getLatestProxies(10);
      const found = all.filter(p => ids.includes(p.id));
      if (!found.length) return ctx.reply("لا توجد بروكسيات مفضلة نشطة حالياً.");
      for (const p of found) await ctx.reply("⭐ " + p.host + ":" + p.port + " — " + p.latency + " ms", { ...proxyKeyboard(p) });
    } catch (e) { return ctx.reply("تعذر تحميل المفضلة. قد تحتاج إلى تطبيق تحديث قاعدة البيانات."); }
  });

  bot.action(/^FAV:(.+)$/, async ctx => {
    try {
      await setFavorite(ctx.from.id, decodeURIComponent(ctx.match[1]));
      await ctx.answerCbQuery("⭐ تمت الإضافة للمفضلة");
    } catch (e) {
      console.error("Favorite save failed:", e.message);
      await ctx.answerCbQuery("تعذر حفظ المفضلة، حاول لاحقاً", { show_alert: true });
    }
  });

  bot.action("GET_PROXIES", async ctx => {
    await ctx.answerCbQuery();
    await register(ctx);
    if (!(await subscribed(ctx.from.id))) {
      return ctx.reply("🔒 يجب الاشتراك بالقناة أولاً.", joinKeyboard());
    }
    return deliverProxies(ctx);
  });

  bot.command("check", async ctx => {
    await register(ctx);
    const raw = (ctx.message.text || "").replace(/^\/check\s*/i, "").trim();
    const proxy = parseMtprotoLine(raw);
    if (!proxy) return ctx.reply("صيغة غير صحيحة. أرسل /check ثم رابط بروكسي MTProto.");
    const result = await checkMtprotoProxy(proxy);
    return ctx.reply(result
      ? "🟡 منفذ الخادم يستجيب عبر TCP: " + result.host + ":" + result.port + "\nالزمن: " + result.latency + " ms\nهذا ليس اختبار مصافحة MTProto كاملة."
      : "❌ المنفذ لا يستجيب أو تجاوز المهلة.");
  });

  bot.command("admin", async ctx => {
    const admins = String(process.env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!admins.includes(String(ctx.from.id))) return ctx.reply("هذا الأمر مخصص للمالك.");
    try {
      const s = await getStats();
      return ctx.reply("🛠 لوحة المالك\nالمستخدمون: " + s.users + "\nبروكسيات MTProto النشطة: " + s.activeProxies);
    } catch (e) { return ctx.reply("تعذر تحميل الإحصائيات."); }
  });

  bot.catch((error, ctx) => {
    console.error("Bot update error:", error.message);
    if (ctx && ctx.chat) return ctx.reply("حدث خطأ مؤقت. حاول مرة أخرى.").catch(() => {});
  });

  instance = bot;
  return bot;
}

module.exports = { getBot };
