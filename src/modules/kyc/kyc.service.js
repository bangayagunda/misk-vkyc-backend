const repository =require("./kyc.repository");
const queue =require("./kyc.queue");
const matcher =require("./kyc.matcher");

const {EVENT} = require("../../realtime/websocket.events");
const {WEBRTC_EVENT} = require("../../realtime/webrtc.events");
const publisher = require("../../realtime/websocket.publisher");
const registry = require("../../realtime/connection.registry");

const {createKycUserWebSocketToken, renewKycUserWebSocketToken} = require("../../utils/jwt");



async function createRequest({
    companyId,
    externalUserId,
    clientReference,
    metadata
}) {
    if (!companyId) {
        const error =new Error("Company ID is required");
        error.code ="COMPANY_ID_REQUIRED";
        error.statusCode = 400;
        throw error;
    }

    if (!externalUserId) {
        const error =new Error("External user ID is required");
        error.code ="EXTERNAL_USER_ID_REQUIRED";
        error.statusCode = 400;
        throw error;
    }

    /*
     * Create persistent session first.
     */
    const session =await repository.createSession({
            companyId,
            externalUserId,
            clientReference,
            metadata
        });

    // const userWsToken =createKycUserWebSocketToken({
    //     sessionId:session.id,
    //     companyId,
    //     externalUserId
    // });   
    const userWsToken =
    createKycUserWebSocketToken({
        sessionId: session.id,
        companyId,
        externalUserId
    });

    /*
     * Try immediate assignment.
     */
    const agentId =await matcher.acquireAgent(
            companyId,
            session.id
        );


    if (!agentId) {
        /*
         * Nobody free.
         */
        await queue.enqueue(
            companyId,
            session.id
        );

        return {
            sessionId:session.id,
            sessionCode:session.sessionCode,
            status:"WAITING",
            queuePosition:await getQueuePosition(
                    companyId,
                    session.id),
            userWsToken
        };

        // return {
        //     sessionId: session.id,
        //     sessionCode:session.sessionCode,
        //     status: "WAITING",
        //     queuePosition:await getQueuePosition(
        //             companyId,
        //             session.id)
        // };
    }


    /*
     * Persist assignment.
     */
    const assigned =await repository.assignAgent({
            sessionId: session.id,
            companyId,
            agentId});


    if (!assigned) {
    await matcher.releaseAgent(
        companyId,
        agentId,
        0,
        session.id
    );

    await queue.enqueue(
        companyId,
        session.id
    );

    return {
        sessionId: session.id,
        sessionCode: session.sessionCode,
        status: "WAITING",
        queuePosition:
            await getQueuePosition(
                companyId,
                session.id
            ),
         userWsToken    
    };
    }


    /*
    * Agent was successfully assigned.
    *
    * Notify the connected Agent Panel.
    */
    publisher.sendToAgent(
        agentId,
        EVENT.KYC_ASSIGNED,
        {
            sessionId:session.id,
            sessionCode:session.sessionCode,
            externalUserId:externalUserId,
            clientReference:clientReference || null,
            metadata:metadata || null,
            assignedAt:new Date().toISOString()
        }
    );


    return {
        sessionId:session.id,
        sessionCode:session.sessionCode,
        status:"ASSIGNED",
        agentId,
        userWsToken
    };

    // return {
    //     sessionId: session.id,
    //     sessionCode:session.sessionCode,
    //     status: "ASSIGNED",
    //     agentId
    // };
}


async function getQueuePosition(
    companyId,
    sessionId) {
    const items =await redisQueueItems(companyId);
    const index =items.indexOf(sessionId);
    return index >= 0
        ? index + 1
        : null;
}

async function redisQueueItems(companyId) {
    const {redis} = require("../../database/redis");
    return redis.lRange(
        queue.queueKey(companyId),
        0,
        -1
    );
}


async function getSession(sessionId) {
    const session =await repository.findSessionById(sessionId);
    if (!session) {
        const error =new Error("KYC session not found");
        error.code ="KYC_SESSION_NOT_FOUND";
        error.statusCode = 404;
        throw error;
    }
    return session;
}


async function cancelSession(sessionId, companyId, wsToken) {
    const session =await repository.findSessionById(sessionId);
    if (!session) {
        const error =new Error("KYC session not found");
        error.code ="KYC_SESSION_NOT_FOUND";
        error.statusCode = 404;
        throw error;
    }

    if (session.company_id !== companyId) {
        const error =new Error("Company access denied");
        error.code ="COMPANY_ACCESS_DENIED";
        error.statusCode = 403;
        throw error;
    }
    if (!wsToken) { const error = new Error("WebSocket token is required"); error.code="WS_TOKEN_REQUIRED"; error.statusCode=401; throw error; }
    try {
        const claims = require("../../utils/jwt").verifyKycUserWebSocketToken(wsToken, { ignoreExpiration: true });
        if (String(claims.sessionId)!==String(sessionId) || String(claims.companyId)!==String(companyId) || String(claims.externalUserId)!==String(session.external_user_id)) throw new Error("mismatch");
    } catch (_) { const error = new Error("Invalid KYC session token"); error.code="WS_TOKEN_INVALID"; error.statusCode=401; throw error; }

    await queue.remove(companyId, sessionId);

    const assignedAgentId = session.assigned_agent_id;
    const cancelled = await repository.cancelSession(sessionId, companyId, "USER_CANCELLED");
    if (!cancelled) return { cancelled: false, sessionId };

    if (assignedAgentId) {
        await matcher.releaseAgent(companyId, assignedAgentId, 0, sessionId);
        const payload = { sessionId, status: "CANCELLED", reason: "USER_CANCELLED" };
        publisher.sendToSession(sessionId, WEBRTC_EVENT.HANGUP, payload);
        publisher.sendToSession(sessionId, EVENT.CALL_ENDED, payload);
        publisher.sendToSession(sessionId, EVENT.KYC_COMPLETED, payload);
        publisher.sendToAgent(assignedAgentId, EVENT.CALL_ENDED, payload);
        for (const c of registry.getSessionConnections(sessionId)) {
            if (c.actorType === "AGENT" && c.socket?.readyState === 1) {
                // Keep the agent's authenticated socket open; only the call ends.
            }
        }
    }
    return { cancelled: true, sessionId };
}


module.exports = {
    createRequest,
    getSession,
    cancelSession
};

async function renewUserWsToken({ sessionId, token }) {
    if (!token) { const e = new Error("WebSocket token is required"); e.code="WS_TOKEN_REQUIRED"; e.statusCode=400; throw e; }
    let claims;
    try { claims = require("../../utils/jwt").verifyKycUserWebSocketToken(token, { ignoreExpiration: true }); }
    catch (_) { const e = new Error("Invalid WebSocket token"); e.code="WS_TOKEN_INVALID"; e.statusCode=401; throw e; }
    if (String(claims.sessionId) !== String(sessionId)) { const e=new Error("WebSocket token/session mismatch"); e.code="WS_TOKEN_MISMATCH"; e.statusCode=403; throw e; }
    const session = await repository.findSessionById(sessionId);
    if (!session || String(session.company_id)!==String(claims.companyId) || String(session.external_user_id)!==String(claims.externalUserId)) { const e=new Error("KYC session is not available"); e.code="KYC_SESSION_NOT_FOUND"; e.statusCode=404; throw e; }
    if (!["WAITING","ASSIGNED","RINGING","ACCEPTED","CONNECTING","CONNECTED","IN_PROGRESS","RECONNECTING"].includes(session.status)) { const e=new Error(`KYC session is ${session.status}`); e.code="KYC_SESSION_INACTIVE"; e.statusCode=409; throw e; }
    return { userWsToken: renewKycUserWebSocketToken(token), expiresIn: require("../../config/env").kycUserWs.expires };
}
module.exports.renewUserWsToken = renewUserWsToken;
