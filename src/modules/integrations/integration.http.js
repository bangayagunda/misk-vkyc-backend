const {
    parseJson
} = require("./integration.utils");


async function requestExternalApi({ url, method = "POST", headers = {}, body = null, timeoutMs = 10000 }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const options = { method, headers, signal: controller.signal };
        if (body !== null && method !== "GET" && method !== "HEAD") {
            options.body = typeof body === "string" ? body : JSON.stringify(body);
        }
        const response = await fetch(url, options);
        const contentType = response.headers.get("content-type") || "";
        if (contentType.toLowerCase().startsWith("image/")) {
            const bytes = Buffer.from(await response.arrayBuffer());
            return {
                ok: response.ok, status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                data: { contentType: contentType.split(";")[0], base64: bytes.toString("base64") }
            };
        }
        const raw = await response.text();
        const data = parseJson(raw, raw);
        return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), data };
    } finally {
        clearTimeout(timeout);
    }
}


module.exports = {
    requestExternalApi
};