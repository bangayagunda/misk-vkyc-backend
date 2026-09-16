const { createClient } = require("redis");
const env = require("../config/env");

const redis = createClient({
    url: env.redis.url
});

redis.on("error", (error) => {
    console.error("[REDIS ERROR]", error);
});

redis.on("connect", () => {
    console.log("[REDIS] Connecting...");
});

redis.on("ready", () => {
    console.log("[REDIS] Ready");
});

redis.on("reconnecting", () => {
    console.log("[REDIS] Reconnecting...");
});

async function connectRedis() {
    if (!redis.isOpen) {
        await redis.connect();
    }
}

async function closeRedis() {
    if (redis.isOpen) {
        await redis.quit();
    }
}

module.exports = {
    redis,
    connectRedis,
    closeRedis
};