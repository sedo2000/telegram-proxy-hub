const axios = require("axios");

function config() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return { url, key };
}

async function db(method, table, params, data) {
  const { url, key } = config();
  const response = await axios({
    method,
    url: url + "/rest/v1/" + table + (params ? "?" + params : ""),
    data,
    timeout: 10000,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=exact" : "resolution=merge-duplicates,return=representation"
    }
  });
  return response.data;
}

async function hasPublished(id) {
  const rows = await db("GET", "proxies",
    "select=id&proxy_key=eq." + encodeURIComponent(id) + "&limit=1");
  return Array.isArray(rows) && rows.length > 0;
}

async function saveProxy(proxy) {
  if (!proxy || proxy.type !== "mtproto" || !proxy.secret) return;
  await db("POST", "proxies", "on_conflict=proxy_key", {
    proxy_key: proxy.id, type: proxy.type || "mtproto", host: proxy.host, port: proxy.port,
    secret: proxy.secret || null, latency_ms: proxy.latency,
    checked_at: proxy.checkedAt || new Date().toISOString(), active: true
  });
}

async function markPublished(proxy) {
  if (!proxy || proxy.type !== "mtproto" || !proxy.secret) return;
  await db("POST", "proxies", "on_conflict=proxy_key", {
    proxy_key: proxy.id,
    type: "mtproto",
    host: proxy.host,
    port: proxy.port,
    secret: proxy.secret || null,
    latency_ms: proxy.latency,
    checked_at: proxy.checkedAt || new Date().toISOString(),
    published_at: new Date().toISOString(),
    active: true
  });
}

async function getLatestProxies(limit = 5, order = "latency_ms.asc") {
  const rows = await db("GET", "proxies",
    "select=proxy_key,type,host,port,secret,latency_ms,checked_at&active=eq.true&type=eq.mtproto&secret=not.is.null&order=" + (order === "checked_at.desc" ? "checked_at.desc" : "latency_ms.asc") + "&limit=" +
    Math.max(1, Math.min(50, Number(limit) || 5)));
  return (rows || []).filter(row => row.type === "mtproto" && row.secret).map(row => ({
    id: row.proxy_key,
    type: row.type,
    host: row.host,
    port: row.port,
    secret: row.secret,
    latency: row.latency_ms,
    checkedAt: row.checked_at
  }));
}

async function saveUser(user) {
  if (!user || !user.id) return;
  await db("POST", "users", "on_conflict=telegram_id", {
    telegram_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    last_seen_at: new Date().toISOString()
  });
}

async function getStats() {
  const { url, key } = config();
  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
    Prefer: "count=exact",
    Range: "0-0"
  };
  const [users, proxies] = await Promise.all([
    axios.get(url + "/rest/v1/users?select=telegram_id", { headers, timeout: 8000 }),
    axios.get(url + "/rest/v1/proxies?select=id&active=eq.true", { headers, timeout: 8000 })
  ]);
  const count = response => {
    const range = response.headers["content-range"] || "";
    const total = range.split("/")[1];
    return total && total !== "*" ? Number(total) : (response.data || []).length;
  };
  return { users: count(users), activeProxies: count(proxies) };
}


async function setFavorite(userId, proxyKey) {
  await db("POST", "favorites", "on_conflict=telegram_id,proxy_key", { telegram_id: userId, proxy_key: proxyKey });
}
async function getFavorites(userId) {
  const rows = await db("GET", "favorites", "select=proxy_key&telegram_id=eq." + encodeURIComponent(userId) + "&order=created_at.desc&limit=50");
  return (rows || []).map(row => row.proxy_key);
}
module.exports = { hasPublished, markPublished, saveProxy, getLatestProxies, saveUser, getStats, setFavorite, getFavorites };

