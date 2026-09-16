const { getPool, sql } = require("../../database/mssql");
const callLifecycle = require("./call.lifecycle.service");
const matcher = require("../kyc/kyc.matcher");
const { getStatus } = require("../agents/agent.presence");
const publisher = require("../../realtime/websocket.publisher");
const { WEBRTC_EVENT } = require("../../realtime/webrtc.events");

const RECONNECT_GRACE_SECONDS = 30;
const WORKER_INTERVAL_MS = 5000;

let timer = null;
let running = false;

async function processExpiredReconnectSessions() {
    if (running) return;
    running = true;

    try {
        const pool = await getPool();
        const request = pool.request();
        request.input("graceSeconds", sql.Int, RECONNECT_GRACE_SECONDS);

        const result = await request.query(`
            SELECT TOP 50
                id,
                company_id,
                assigned_agent_id,
                status
            FROM kyc_sessions
            WHERE
                status = 'RECONNECTING'
                AND updated_at <= DATEADD(
                    SECOND,
                    -@graceSeconds,
                    SYSUTCDATETIME()
                )
            ORDER BY updated_at ASC
        `);

        for (const session of result.recordset) {
            await expireReconnectSession(session);
        }
    } catch (error) {
        console.error("[RECONNECT WORKER]", error);
    } finally {
        running = false;
    }
}

async function expireReconnectSession(session) {
    if (!session.assigned_agent_id) return;

    try {
        const result = await callLifecycle.endCall({
            companyId: session.company_id,
            agentId: session.assigned_agent_id,
            sessionId: session.id,
            reason: "RECONNECT_TIMEOUT"
        });

        const agentStatus = await getStatus(
            session.assigned_agent_id
        );

        if (agentStatus === "BUSY" || agentStatus === "FREE") {
            await matcher.releaseAgent(
                session.company_id,
                session.assigned_agent_id,
                0,
                session.id
            );
        }

        publisher.sendToSession(
            session.id,
            WEBRTC_EVENT.HANGUP,
            {
                sessionId: session.id,
                status: result.status,
                reason: result.reason
            }
        );

        console.log(
            `[RECONNECT WORKER] Session expired ` +
            `session=${session.id} ` +
            `agent=${session.assigned_agent_id}`
        );
    } catch (error) {
        if (error.code === "CALL_ALREADY_ENDED") {
            return;
        }

        console.error(
            `[RECONNECT WORKER] Failed ` +
            `session=${session.id}`,
            error
        );
    }
}

function startReconnectWorker() {
    if (timer) return;

    console.log(
        `[RECONNECT WORKER] Started ` +
        `grace=${RECONNECT_GRACE_SECONDS}s ` +
        `interval=${WORKER_INTERVAL_MS}ms`
    );

    processExpiredReconnectSessions();

    timer = setInterval(
        processExpiredReconnectSessions,
        WORKER_INTERVAL_MS
    );
}

function stopReconnectWorker() {
    if (!timer) return;

    clearInterval(timer);
    timer = null;

    console.log("[RECONNECT WORKER] Stopped");
}

module.exports = {
    RECONNECT_GRACE_SECONDS,
    processExpiredReconnectSessions,
    startReconnectWorker,
    stopReconnectWorker
};
