const axios = require("axios");
const { SocksClient } = require("socks");
const net = require("net");

const MAX_LATENCY = Number(process.env.MAX_LATENCY_MS || 1500);
const MAX_CANDIDATES = Number(process.env.MAX_SCAN_CANDIDATES || 100);

function isPublicIPv4(host) {
  if (net.isIP(host) !== 4) return false;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0 && Number(host.split(".")[2]) === 2) return false;
  if (a === 203 && b === 0 && Number(host.split(".")[2]) === 113) return false;
  if (a === 198 && b === 51 && Number(host.split(".")[2]) === 100) return false;
  return true;
}

function parseProxyLine(line) {
  const value = String(line || "").trim();
  if (!value || value.startsWith("#")) return null;
  const match = value.match(/^(?:socks5:\/\/)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/i);
  if (!match) return null;
  const host = match[1];
  const port = Number(match[2]);
  if (!isPublicIPv4(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { id: host + ":" + port, type: "socks5", host, port };
}

async function fetchSource(url) {
  const response = await axios.get(url, {
    timeout: 12000,
    responseType: "text",
    maxContentLength: 3 * 1024 * 1024,
    headers: { "User-Agent": "Telegram-Proxy-Hub/1.0" }
  });
  return String(response.data).split(/\r?\n/).map(parseProxyLine).filter(Boolean);
}

function testSocksProxy(proxy) {
  return new Promise(resolve => {
    const started = Date.now();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 4500);
    SocksClient.createConnection({
      proxy: { host: proxy.host, port: proxy.port, type: 5 },
      command: "connect",
      destination: { host: "149.154.167.51", port: 443 },
      timeout: 4000
    }).then(result => {
      const latency = Date.now() - started;
      result.socket.destroy();
      if (latency > MAX_LATENCY) return finish(null);
      finish({ ...proxy, latency, checkedAt: new Date().toISOString() });
    }).catch(() => finish(null));
  });
}

async function mapLimit(items, limit, worker) {
  const output = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        const result = await worker(items[index]);
        if (result) output.push(result);
      } catch (_) {}
    }
  });
  await Promise.all(workers);
  return output;
}

async function collectWorkingProxies() {
  const sources = String(process.env.PROXY_SOURCES || "")
    .split(",").map(x => x.trim()).filter(Boolean);
  if (!sources.length) throw new Error("PROXY_SOURCES is empty");

  const sourceResults = await Promise.all(sources.map(async url => {
    try { return await fetchSource(url); }
    catch (error) {
      console.error("Proxy source failed:", url, error.message);
      return [];
    }
  }));

  const unique = new Map();
  for (const list of sourceResults) {
    for (const proxy of list) unique.set(proxy.id, proxy);
  }

  const candidates = [...unique.values()].slice(0, MAX_CANDIDATES);
  const tested = await mapLimit(candidates, 15, testSocksProxy);
  return tested.sort((a, b) => a.latency - b.latency);
}

module.exports = { collectWorkingProxies };
