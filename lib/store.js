const axios = require("axios");

const memorySeen = new Map();
const TTL_SECONDS = 60 * 60 * 24 * 7;

async function redisCommand(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const response = await axios.post(url, [command, ...args], {
    headers: { Authorization: "Bearer " + token },
    timeout: 5000
  });
  return response.data && response.data.result;
}

async function hasPublished(id) {
  try {
    const result = await redisCommand("EXISTS", "proxy:" + id);
    if (result !== null) return Number(result) === 1;
  } catch (error) {
    console.error("Redis read failed:", error.message);
  }
  const expires = memorySeen.get(id);
  if (!expires) return false;
  if (expires < Date.now()) {
    memorySeen.delete(id);
    return false;
  }
  return true;
}

async function markPublished(id) {
  try {
    const result = await redisCommand("SET", "proxy:" + id, "1", "EX", TTL_SECONDS);
    if (result !== null) return true;
  } catch (error) {
    console.error("Redis write failed:", error.message);
  }
  memorySeen.set(id, Date.now() + TTL_SECONDS * 1000);
  return false;
}

module.exports = { hasPublished, markPublished };
