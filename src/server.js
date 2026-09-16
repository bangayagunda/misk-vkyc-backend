const http = require("http");
const env = require("./config/env");
const {getPool,closeDatabase} = require("./database/mssql");
const { connectRedis,closeRedis} = require("./database/redis");
const {parseBody} = require("./core/http/body");
const {error} = require("./core/http/response");
const {handleAuthRoutes} = require("./modules/auth/auth.routes");
const {handleAgentRoutes} = require("./modules/agents/agent.routes");
const {handleKycRoutes} = require("./modules/kyc/kyc.routes");

const {setupWebSocketServer} = require("./realtime/websocket.server");
const {startCallbackWorker} = require("./modules/kyc/kyc.callback.worker");
const {startReconnectWorker,stopReconnectWorker} = require("./modules/calls/call.reconnect.worker");
const { handleAdminConfigRoutes } = require("./modules/admin/admin.config.routes");

const server = http.createServer(
    async (req, res) => {
        // --- CORS HEADERS FOR NATIVE HTTP SERVER ---
        res.setHeader("Access-Control-Allow-Origin", "*"); // Ya apne flutter web ka origin/domain de sakta hai
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        // Preflight OPTIONS request ko yahi se handle karke turant response bhej do
        if (req.method === "OPTIONS") {
            res.statusCode = 204;
            return res.end();
        }
        try {
            const url =new URL(req.url,`http://${req.headers.host || "localhost"}`);
            const pathname =url.pathname;

            /*
             * Health
             */

            if (req.method === "GET" && pathname === "/health") {
                res.statusCode = 200;
                res.setHeader("Content-Type","application/json; charset=utf-8");

                return res.end(JSON.stringify({
                        success: true,
                        service: "video-kyc-platform",
                        status: "healthy",
                        timestamp:
                            new Date().toISOString()
                    })
                );
            }


            /*
             * Parse body only
             * for methods which can contain body.
             */

            let body = {};

            if (req.method === "POST" ||
                req.method === "PUT" ||
                req.method === "PATCH") {
                body =await parseBody(req);
            }


            /*
             * Auth routes
             */

            const authHandled =await handleAuthRoutes(req,res,pathname,body);
            if (authHandled !== false) {
                return;
            }

            /*
             * Agent routes
             */

            const agentHandled =await handleAgentRoutes(req, res,pathname,body);
            if (agentHandled !== false) {
                return;
            }
            /*
             * Kyc routes
             */
            const kycHandled =await handleKycRoutes(req,res,pathname,body);
            if (kycHandled !== false) {
                return;
            }
            /*
             * admin routes
             */
            const adminHandled =await handleAdminConfigRoutes(req,res,pathname,body);
            if (adminHandled !== false) {
                return;
            }

            /*
             * 404
             */

            return error(res,404,"ROUTE_NOT_FOUND","Route not found");

        } catch (err) {
            console.error("[HTTP ERROR]",err);
            return error(res,err.statusCode || 500,err.code || "INTERNAL_ERROR",err.message ||
                    "Internal server error");
        }
    }
);

// setupWebSocketServer(
//     server
// );
async function bootstrap() {
    try {
        console.log("Starting Video KYC Platform...");
        await getPool();
        console.log("[MSSQL] Connected");
        await connectRedis();
        console.log("[REDIS] Connected");
        server.listen(env.port,env.host,() => {
                console.log(`Server running at http://${env.host}:${env.port}`);
                setupWebSocketServer(server);

                startCallbackWorker();
                startReconnectWorker();
            }
        );

    } catch (error) {
        console.error("Startup failed:",error);
        process.exit(1);
    }
}


async function shutdown(signal) {
    console.log(
        `${signal} received. Shutting down...`
    );

    server.close(
        async () => {
            try {
                await closeRedis();
                stopReconnectWorker();
                await closeDatabase();
                console.log("Shutdown complete.");
                process.exit(0);
            } catch (error) {
                console.error("Shutdown error:",error);
                process.exit(1);
            }
        }
    );
}


process.on("SIGTERM",() => shutdown("SIGTERM"));
process.on("SIGINT",() => shutdown("SIGINT"));
process.on("unhandledRejection",(error) => {
        console.error("Unhandled rejection:",error);
    }
);

process.on("uncaughtException",(error) => {
        console.error("Uncaught exception:",error);
        process.exit(1);
    }
);
bootstrap();

/*const http = require("http");

const env = require("./config/env");
const { getPool, closeDatabase } = require("./database/mssql");
const { connectRedis, closeRedis } = require("./database/redis");

const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/health") {
        return res.end(
            JSON.stringify({
                success: true,
                service: "video-kyc-platform",
                status: "healthy",
                timestamp: new Date().toISOString()
            })
        );
    }

    res.statusCode = 404;

    res.end(
        JSON.stringify({
            success: false,
            error: {
                code: "ROUTE_NOT_FOUND",
                message: "Route not found"
            }
        })
    );
});

async function bootstrap() {
    try {
        console.log("Starting Video KYC Platform...");

        await getPool();

        console.log("[MSSQL] Connected");

        await connectRedis();

        console.log("[REDIS] Connected");

        server.listen(env.port, env.host, () => {
            console.log(
                `Server running at http://${env.host}:${env.port}`
            );
        });
    } catch (error) {
        console.error("Startup failed:", error);

        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
        try {
            await closeRedis();
            await closeDatabase();

            console.log("Shutdown complete.");

            process.exit(0);
        } catch (error) {
            console.error("Shutdown error:", error);

            process.exit(1);
        }
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (error) => {
    console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
});

bootstrap();
*/