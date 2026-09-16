function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk.toString();

            // 1 MB request limit
            if (body.length > 1024 * 1024) {
                reject(new Error("REQUEST_BODY_TOO_LARGE"));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!body) {
                return resolve({});
            }

            try {
                const parsed = JSON.parse(body);
                resolve(parsed);
            } catch (error) {
                reject(new Error("INVALID_JSON"));
            }
        });

        req.on("error", reject);
    });
}

module.exports = {
    parseBody
};