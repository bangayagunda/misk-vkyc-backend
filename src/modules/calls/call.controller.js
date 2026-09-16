const service =
    require("./call.lifecycle.service");

const { success, error } = require("../../core/http/response");
const agentRepository = require("../agents/agent.repository");
const publisher = require("../../realtime/websocket.publisher");
const registry = require("../../realtime/connection.registry");
const matcher = require("../kyc/kyc.matcher");
const { EVENT } = require("../../realtime/websocket.events");
const { WEBRTC_EVENT } = require("../../realtime/webrtc.events");


async function accept(
    req,
    res,
    auth
) {

    try {

        const result = await service.acceptCall({
            companyId: auth.companyId, agentId: auth.agentId, sessionId: req.params.sessionId
        });
        const sessionId = req.params.sessionId;
        for (const c of registry.getActor("AGENT", auth.agentId) ? [registry.getActor("AGENT", auth.agentId)] : []) {
            registry.attachSession(c.connectionId, sessionId);
        }
        const payload = { sessionId, status: result.status, agentId: auth.agentId };
        publisher.sendToAgent(auth.agentId, EVENT.KYC_ACCEPTED, payload);
        publisher.sendToSession(sessionId, EVENT.KYC_ACCEPTED, payload);
        return success(res, result);

    } catch (err) {

        console.error(
            "[CALL ACCEPT]",
            err
        );

        return error(
            res,
            err.statusCode || 500,
            err.code ||
                "CALL_ACCEPT_FAILED",
            err.message ||
                "Unable to accept call"
        );
    }
}


async function reject(req, res, auth, body = {}) {
    try {
        const result = await service.rejectCall({
            companyId: auth.companyId, agentId: auth.agentId, sessionId: req.params.sessionId, reason: body.reason
        });
        const payload = { sessionId: req.params.sessionId, status: result.status, reason: result.reason, agentId: auth.agentId };
        publisher.sendToSession(req.params.sessionId, EVENT.KYC_REJECTED, payload);
        publisher.sendToAgent(auth.agentId, EVENT.KYC_REJECTED, payload);
        await matcher.releaseAgent(auth.companyId, auth.agentId, 0, req.params.sessionId);
        return success(res, result);
    } catch (err) {
        return error(res, err.statusCode || 500, err.code || "CALL_REJECT_FAILED", err.message || "Unable to reject call");
    }
}

async function start(
    req,
    res,
    auth
) {

    try {

        const result =
            await service.startCall({

                companyId:
                    auth.companyId,

                agentId:
                    auth.agentId,

                sessionId:
                    req.params.sessionId
            });


        return success(
            res,
            result
        );

    } catch (err) {

        console.error(
            "[CALL START]",
            err
        );

        return error(
            res,
            err.statusCode || 500,
            err.code ||
                "CALL_START_FAILED",
            err.message ||
                "Unable to start call"
        );
    }
}


async function end(req, res, auth, body = {}) {
    try {
        const result = await service.endCall({
            companyId: auth.companyId,
            agentId: auth.agentId,
            sessionId: req.params.sessionId,
            reason: body.reason
        });
        const sessionId = req.params.sessionId;
        const payload = { sessionId, status: result.status, reason: result.reason };
        publisher.sendToSession(sessionId, WEBRTC_EVENT.HANGUP, payload);
        publisher.sendToSession(sessionId, EVENT.CALL_ENDED, payload);
        publisher.sendToSession(sessionId, EVENT.KYC_COMPLETED, payload);
        publisher.sendToAgent(auth.agentId, EVENT.CALL_ENDED, payload);
        await matcher.releaseAgent(auth.companyId, auth.agentId, 0, sessionId);
        for (const c of registry.getSessionConnections(sessionId)) {
            if (c.actorType === "USER" && c.socket?.readyState === 1) {
                try { c.socket.close(1000, "KYC call ended"); } catch (_) {}
            }
        }
        return success(res, result);
    } catch (err) {
        console.error("[CALL END]", err);
        return error(res, err.statusCode || 500, err.code || "CALL_END_FAILED", err.message || "Unable to end call");
    }
}

async function active(req, res, auth) {
    try {
        const sessions = await agentRepository.findActiveSessions(auth.agentId, auth.companyId);
        return success(res, { sessions });
    } catch (err) {
        return error(res, err.statusCode || 500, err.code || "ACTIVE_CALLS_FAILED", err.message || "Unable to load active calls");
    }
}


module.exports = {
    accept,
    reject,
    start,
    end,
    active
};