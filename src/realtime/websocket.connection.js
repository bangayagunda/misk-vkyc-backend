const crypto = require("crypto");
const registry =require("./connection.registry");
const publisher =require("./websocket.publisher");
const {handleSignal} = require("../modules/webrtc/webrtc.signaling.handler");
const {WEBRTC_EVENT} = require("./webrtc.events");
const {EVENT} = require("./websocket.events");
const callLifecycle =require("../modules/calls/call.lifecycle.service");
const matcher =require("../modules/kyc/kyc.matcher");
const { redis } = require("../database/redis");
const { statusKey, heartbeatKey, companyAgentsKey, companyFreeAgentsKey, kycAgentLockKey, PRESENCE_TTL } = require("../modules/agents/agent.presence");

const {
    setOnline,
    heartbeat,
    setOffline,
    restoreBusy,
    markReconnecting,
    getReconnecting,
    clearReconnecting
} =
    require("../modules/agents/agent.presence");

const repository =
    require("../modules/webrtc/webrtc.session.repository");

const {
    executeAction
} = require("../modules/kyc/kyc.session.action.service");

const {
    safeAudit
} = require("../core/audit/audit.logger");


async function redisSetDisconnectedBusy(agentId, companyId, sessionId) {
    await redis.multi()
        .set(statusKey(agentId), "BUSY", { EX: PRESENCE_TTL + 5 })
        .set(heartbeatKey(agentId), Date.now().toString(), { EX: PRESENCE_TTL + 5 })
        .sAdd(companyAgentsKey(companyId), agentId)
        .zRem(companyFreeAgentsKey(companyId), agentId)
        .set(kycAgentLockKey(agentId), sessionId, { EX: PRESENCE_TTL + 5 })
        .exec();
}

/*
 * =========================================================
 * REGISTER CONNECTION
 * =========================================================
 */

async function registerConnection({
    socket,
    actorType,
    actorId,
    companyId
}) {

    const connectionId =
        crypto.randomUUID();


    /*
     * =========================================
     * REGISTER CONNECTION
     * =========================================
     */

    registry.add({
        connectionId,
        socket,
        actorType,
        actorId,
        companyId
    });


    /*
     * Keep connection ID on socket.
     */

    socket.connectionId =
        connectionId;


    /*
     * =========================================
     * AGENT PRESENCE
     * =========================================
     */

    if (actorType === "AGENT") {

        try {

            const activeSession = await require("../modules/agents/agent.repository").findActiveSessionForAgent(actorId, companyId);
            const result = activeSession
                ? await restoreBusy(actorId, companyId, activeSession.id)
                : await setOnline(actorId, companyId);

            console.log(
                `[PRESENCE] Agent online ` +
                `agent=${actorId} ` +
                `company=${companyId} ` +
                `status=${result.status}`
            );

        } catch (error) {

            console.error(
                "[PRESENCE ONLINE ERROR]",
                error
            );

            registry.remove(
                connectionId
            );

            try {

                socket.close(
                    1011,
                    "Agent presence initialization failed"
                );

            } catch (closeError) {

                console.error(
                    "[WS CLOSE ERROR]",
                    closeError
                );
            }

            throw error;
        }
    }


    /*
     * =========================================
     * AGENT PRESENCE HEARTBEAT
     * =========================================
     */

    socket.on(
        "pong",
        async () => {

            socket.isAlive = true;

            if (
                actorType !== "AGENT"
            ) {
                return;
            }

            try {

                const result =
                    await heartbeat(
                        actorId,
                        companyId
                    );

                if (
                    result.status === "OFFLINE"
                ) {

                    console.warn(
                        `[PRESENCE] Agent presence expired ` +
                        `agent=${actorId}`
                    );
                }

            } catch (error) {

                console.error(
                    "[PRESENCE HEARTBEAT ERROR]",
                    error
                );
            }
        }
    );


    /*
     * =========================================
     * MESSAGE
     * =========================================
     */

    socket.on(
        "message",
        async raw => {

            try {

                const message =
                    JSON.parse(
                        raw.toString()
                    );


                /*
                 * =========================================
                 * KYC COMMANDS
                 * =========================================
                 */

                if (
                    message.event ===
                        EVENT.KYC_ACCEPT ||

                    message.event ===
                        EVENT.KYC_REJECT ||

                    message.event ===
                        EVENT.KYC_APPROVE ||

                    message.event ===
                        EVENT.KYC_REJECT_FINAL
                ) {

                    await handleKycCommand({
                        connectionId,
                        message
                    });

                    return;
                }


                /*
                 * =========================================
                 * WEBRTC CALL START
                 * =========================================
                 */

                if (
                    message.event ===
                    WEBRTC_EVENT.CALL_START
                ) {

                    await handleCallStart({
                        connectionId,
                        message
                    });

                    return;
                }

                if (
                    message.event ===
                    WEBRTC_EVENT.HANGUP
                ) {

                    await handleHangup({
                        connectionId,
                        message
                    });

                    return;
                }


                /*
                 * =========================================
                 * WEBRTC SIGNALING
                 * =========================================
                 */

                await handleSignal({
                    connectionId,
                    message
                });

            } catch (error) {

                console.error(
                    "[WS MESSAGE]",
                    error
                );

                publisher.send(
                    socket,
                    WEBRTC_EVENT.ERROR,
                    {
                        code:
                            error.code ||
                            "WS_MESSAGE_ERROR",

                        message:
                            error.message ||
                            "WebSocket message failed"
                    }
                );
            }
        }
    );


    /*
     * =========================================
     * CLOSE
     * =========================================
     */

    // socket.on(
    //     "close",
    //     async (code, reason) => {

    //         const connection =
    //             registry.get(
    //                 connectionId
    //             );

    //         const sessionId =
    //             connection &&
    //             connection.sessionId;


    //         /*
    //          * Remove socket from registry.
    //          */

    //         registry.remove(
    //             connectionId
    //         );


    //         /*
    //          * =========================================
    //          * NORMAL DISCONNECT
    //          * =========================================
    //          */

    //         if (!sessionId) {

    //             if (
    //                 actorType === "AGENT"
    //             ) {

    //                 try {

    //                     await setOffline(
    //                         actorId,
    //                         companyId
    //                     );

    //                 } catch (error) {

    //                     console.error(
    //                         "[PRESENCE OFFLINE ERROR]",
    //                         error
    //                     );
    //                 }
    //             }

    //             console.log(
    //                 `[WS] Disconnected ` +
    //                 `${connectionId} ` +
    //                 `code=${code} ` +
    //                 `reason=${reason.toString()}`
    //             );

    //             return;
    //         }


    //         /*
    //          * =========================================
    //          * ACTIVE KYC SESSION
    //          * =========================================
    //          */

    //         try {

    //             const session =
    //                 await repository.getSession(
    //                     sessionId
    //                 );

    //             if (
    //                 session &&
    //                 (
    //                     session.status ===
    //                         "CONNECTED" ||

    //                     session.status ===
    //                         "IN_PROGRESS"
    //                 )
    //             ) {

    //                 await repository.markSessionReconnecting(
    //                     sessionId
    //                 );

    //                 await markReconnecting({
    //                     sessionId,
    //                     actorType,
    //                     actorId,
    //                     previousStatus:
    //                         session.status
    //                 });


    //                 publisher.sendToSession(
    //                     sessionId,
    //                     WEBRTC_EVENT.RECONNECT,
    //                     {
    //                         sessionId,

    //                         status:
    //                             "RECONNECTING",

    //                         disconnectedActor: {
    //                             type:
    //                                 actorType,

    //                             id:
    //                                 actorId
    //                         }
    //                     }
    //                 );


    //                 console.log(
    //                     `[KYC RECONNECT] ` +
    //                     `session=${sessionId} ` +
    //                     `actor=${actorType}:${actorId}`
    //                 );
    //             }

    //         } catch (error) {

    //             console.error(
    //                 "[KYC RECONNECT ERROR]",
    //                 error
    //             );
    //         }


    //         console.log(
    //             `[WS] Disconnected ` +
    //             `${connectionId} ` +
    //             `code=${code} ` +
    //             `reason=${reason.toString()}`
    //         );
    //     }
    // );


    socket.on(
    "close",
    async (
        code,
        reason
    ) => {

        /*
         * =========================================
         * CAPTURE SESSION BEFORE REMOVE
         * =========================================
         *
         * registry.remove() ke baad connection
         * information available nahi hogi.
         */

        const connection =
            registry.get(
                connectionId
            );


        /*
         * =========================================
         * SESSION RECONNECTING
         * =========================================
         */

        if (connection && !connection.sessionId && actorType === "AGENT") {
            try {
                const active = await require("../modules/agents/agent.repository").findActiveSessionForAgent(actorId, companyId);
                if (active) connection.sessionId = active.id;
            } catch (error) {
                console.error("[ACTIVE SESSION LOOKUP ERROR]", error);
            }
        }

        if (
            connection &&
            connection.sessionId
        ) {

            try {

                const result =
                    await callLifecycle.markReconnecting({
                        companyId:
                            connection.companyId,

                        sessionId:
                            connection.sessionId
                    });


                if (result.changed) {

                    await markReconnecting({
                        sessionId:
                            connection.sessionId,
                        actorType:
                            connection.actorType,
                        actorId:
                            connection.actorId,
                        previousStatus:
                            result.previousStatus ||
                            "IN_PROGRESS"
                    });

                    publisher.sendToSession(
                        connection.sessionId,
                        WEBRTC_EVENT.RECONNECT,
                        {
                            sessionId:
                                connection.sessionId,

                            status:
                                "RECONNECTING",

                            disconnectedActor: {
                                type:
                                    connection.actorType,

                                id:
                                    connection.actorId
                            }
                        }
                    );


                    console.log(
                        `[CALL RECONNECTING] ` +
                        `session=${connection.sessionId} ` +
                        `actor=${connection.actorType}:${connection.actorId}`
                    );
                }

            } catch (error) {

                console.error(
                    "[RECONNECT STATE ERROR]",
                    error
                );
            }
        }


        /*
         * =========================================
         * REMOVE CONNECTION
         * =========================================
         */

        registry.remove(
            connectionId
        );


        /*
         * =========================================
         * AGENT PRESENCE
         * =========================================
         */

        if (actorType === "AGENT") {
            try {
                // A reconnecting/new socket for the same agent must win over
                // the old socket's close event. Never let the old connection
                // mark the agent OFFLINE after a replacement is registered.
                const replacement = registry.getActor("AGENT", actorId);
                if (replacement) {
                    console.log(`[PRESENCE] Agent socket replaced; keeping presence agent=${actorId}`);
                } else if (connection && connection.sessionId) {
                    // Keep the KYC Redis lock while the call is in the reconnect
                    // grace period. setOffline() would delete that lock and make
                    // the agent incorrectly matchable for another customer.
                    await redisSetDisconnectedBusy(actorId, companyId, connection.sessionId);
                } else {
                    await setOffline(actorId, companyId);
                    console.log(`[PRESENCE] Agent offline agent=${actorId} company=${companyId}`);
                }
            } catch (error) {
                console.error("[PRESENCE OFFLINE ERROR]", error);
            }
        }


        console.log(
            `[WS] Disconnected ` +
            `${connectionId} ` +
            `code=${code} ` +
            `reason=${reason.toString()}`
        );
    }
);
    /*
     * =========================================
     * ERROR
     * =========================================
     */

    socket.on(
        "error",
        error => {

            console.error(
                `[WS ERROR] ${connectionId}`,
                error
            );
        }
    );


    /*
     * =========================================
     * RESTORE AGENT SESSION
     * =========================================
     */

    await tryRestoreSession({
        connectionId,
        actorType,
        actorId,
        companyId
    });


    console.log(
        `[WS] Connected ` +
        `${connectionId} ` +
        `${actorType}:${actorId}`
    );


    return connectionId;
}


/*
 * =========================================================
 * KYC COMMAND
 * =========================================================
 */

async function handleKycCommand({
    connectionId,
    message
}) {
    const connection =
        registry.get(connectionId);


    if (!connection) {

        throw createError(
            401,
            "CONNECTION_NOT_FOUND",
            "WebSocket connection not found"
        );
    }

    /*
     * =========================================
     * AGENT ONLY
     * =========================================
     */

    if (
        connection.actorType !==
        "AGENT"
    ) {

        throw createError(
            403,
            "AGENT_ONLY",
            "Only agents can perform this action"
        );
    }

    /*
     * =========================================
     * SESSION ID
     * =========================================
     */

    const sessionId =
        message.sessionId ||
        (
            message.data &&
            message.data.sessionId
        );


    if (!sessionId) {

        throw createError(
            400,
            "SESSION_ID_REQUIRED",
            "Session ID is required"
        );
    }


    /*
     * =========================================
     * ASSIGNMENT ACCEPT
     * =========================================
     *
     * This is NOT final KYC approval.
     */

    if (
        message.event ===
        EVENT.KYC_ACCEPT
    ) {

        const result =
            await callLifecycle.acceptCall({
                companyId:connection.companyId,
                agentId:connection.actorId,
                sessionId
            });

        // Bind the agent socket to the accepted session so subsequent
        // signaling, hangup and reconnect handling can target this call.
        registry.attachSession(connectionId, sessionId);

        publisher.sendToAgent(
            connection.actorId,
            EVENT.KYC_ACCEPTED,
            {
                sessionId,
                status:result.status
            }
        );

        publisher.sendToSession(
            sessionId,
            EVENT.KYC_ACCEPTED,
            {
                sessionId,
                status:result.status,
                agentId:connection.actorId
            }
        );

        await safeAudit({
            companyId:connection.companyId,
            actorUserId:null,
            actorType:"AGENT",
            action:"KYC_ACCEPT",
            entityType:"KYC_SESSION",
            entityId:sessionId,
            details: {
                agentId:connection.actorId,
                status:result.status
            }
        });

        return;
    }


    /*
     * =========================================
     * ASSIGNMENT REJECT
     * =========================================
     *
     * Agent rejects the incoming assignment.
     *
     * This is NOT final KYC rejection.
     */

    if (
        message.event ===
        EVENT.KYC_REJECT
    ) {

        const reason =
            (
                message.data &&
                message.data.reason
            ) ||
            "AGENT_REJECTED";


        const result =
            await callLifecycle.rejectCall({
                companyId:
                    connection.companyId,

                agentId:
                    connection.actorId,

                sessionId,

                reason
            });


        publisher.sendToSession(
            sessionId,
            EVENT.KYC_REJECTED,
            {
                sessionId,

                status:
                    result.status,

                reason:
                    result.reason,

                agentId:
                    connection.actorId
            }
        );


        publisher.sendToAgent(
            connection.actorId,
            EVENT.KYC_REJECTED,
            {
                sessionId,
                status:result.status,
                reason:result.reason
            }
        );
        await safeAudit({
            companyId:connection.companyId,
            actorUserId:null,
            actorType:"AGENT",
            action:"KYC_REJECT",
            entityType:"KYC_SESSION",
            entityId:sessionId,
            details: {
                agentId:connection.actorId,
                status:result.status,
                reason
            }
        });


        await matcher.releaseAgent(
            connection.companyId,
            connection.actorId,
            0,
            sessionId
        );


        return;
    }


    /*
     * =========================================
     * FINAL KYC APPROVE
     * =========================================
     *
     * Agent has completed verification.
     *
     * IMPORTANT:
     *
     * We use executeAction().
     *
     * It already:
     *
     * 1. validates company action
     * 2. validates session
     * 3. saves final_action_code
     * 4. writes audit
     * 5. releases agent
     * 6. creates callback delivery
     */

    if (
        message.event ===
        EVENT.KYC_APPROVE
    ) {

        const result =
            await executeAction({
                sessionId,

                companyId:
                    connection.companyId,

                agentId:
                    connection.actorId,

                actionCode:
                    "APPROVE",

                remarks:
                    message.data &&
                    message.data.remarks,

                metadata:
                    message.data &&
                    message.data.metadata
            });


        /*
         * Notify Agent Panel.
         */

        publisher.sendToAgent(
            connection.actorId,
            EVENT.KYC_APPROVED,
            {
                sessionId,

                status:
                    result.status,

                action:
                    result.action
            }
        );


        /*
         * Notify User.
         */

        publisher.sendToSession(
            sessionId,
            EVENT.KYC_APPROVED,
            {
                sessionId,

                status:
                    result.status,

                action:
                    result.action,

                agentId:
                    connection.actorId
            }
        );


        console.log(
            `[KYC ACTION] APPROVE ` +
            `session=${sessionId} ` +
            `agent=${connection.actorId}`
        );


        return;
    }


    /*
     * =========================================
     * FINAL KYC REJECT
     * =========================================
     *
     * This is final verification rejection.
     */

    if (
        message.event ===
        EVENT.KYC_REJECT_FINAL
    ) {

        const result =
            await executeAction({
                sessionId,

                companyId:
                    connection.companyId,

                agentId:
                    connection.actorId,

                actionCode:
                    "REJECT",

                remarks:
                    message.data &&
                    message.data.remarks,

                metadata:
                    message.data &&
                    message.data.metadata
            });


        /*
         * Notify Agent Panel.
         */

        publisher.sendToAgent(
            connection.actorId,
            EVENT.KYC_REJECTED_FINAL,
            {
                sessionId,

                status:
                    result.status,

                action:
                    result.action
            }
        );


        /*
         * Notify User.
         */

        publisher.sendToSession(
            sessionId,
            EVENT.KYC_REJECTED_FINAL,
            {
                sessionId,

                status:
                    result.status,

                action:
                    result.action,

                agentId:
                    connection.actorId
            }
        );


        console.log(
            `[KYC ACTION] REJECT ` +
            `session=${sessionId} ` +
            `agent=${connection.actorId}`
        );


        return;
    }


    /*
     * =========================================
     * UNKNOWN COMMAND
     * =========================================
     */

    throw createError(
        400,
        "UNKNOWN_KYC_COMMAND",
        "Unsupported KYC command"
    );
}


/*
 * =========================================================
 * CALL START
 * =========================================================
 */

async function handleCallStart({
    connectionId,
    message
}) {

    const connection =
        registry.get(
            connectionId
        );


    if (!connection) {

        throw createError(
            401,
            "CONNECTION_NOT_FOUND",
            "WebSocket connection not found"
        );
    }


    /*
     * Only Agent can start call.
     */

    if (
        connection.actorType !==
        "AGENT"
    ) {

        throw createError(
            403,
            "AGENT_ONLY",
            "Only agent can start the call"
        );
    }


    /*
     * =========================================
     * SESSION ID
     * =========================================
     */

    const sessionId =
        message.sessionId ||
        (
            message.data &&
            message.data.sessionId
        );


    if (!sessionId) {

        throw createError(
            400,
            "SESSION_ID_REQUIRED",
            "Session ID is required"
        );
    }


    /*
     * =========================================
     * ACCEPTED -> IN_PROGRESS
     * =========================================
     */

    const result =
        await callLifecycle.startCall({
            companyId:connection.companyId,
            agentId:connection.actorId,
            sessionId
        });


    /*
     * =========================================
     * ATTACH SESSION
     * =========================================
     */

    registry.attachSession(
        connectionId,
        sessionId
    );


    /*
     * =========================================
     * TELL USER
     * =========================================
     */

    publisher.sendToSession(
        sessionId,
        WEBRTC_EVENT.CALL_START,
        {
            sessionId,
            agentId:connection.actorId,
            status:result.status
        }
    );


    /*
     * =========================================
     * CONFIRM AGENT
     * =========================================
     */

    publisher.sendToAgent(
        connection.actorId,
        WEBRTC_EVENT.CALL_START,
        {
            sessionId,

            status:
                result.status
        }
    );

    await safeAudit({
    companyId:connection.companyId,
    actorType:"AGENT",
    action:"CALL_START",
    entityType:"KYC_SESSION",
    entityId: sessionId,
    details: {
        agentId:connection.actorId,
        status:result.status
    }
});
}

async function handleHangup({
    connectionId,
    message
}) {

    const connection =
        registry.get(connectionId);

    if (!connection) {
        throw createError(
            401,
            "CONNECTION_NOT_FOUND",
            "WebSocket connection not found"
        );
    }

    const sessionId =
        message.sessionId ||
        (
            message.data &&
            message.data.sessionId
        );

    if (!sessionId) {
        throw createError(400, "SESSION_ID_REQUIRED", "Session ID is required");
    }

    // A hangup is authorized by the authenticated socket, not merely by
    // knowing a session id. This prevents one agent from terminating another
    // agent's call inside the same tenant.
    if (connection.actorType === "AGENT") {
        const session = await repository.getSession(sessionId);
        if (!session || String(session.company_id) !== String(connection.companyId) || String(session.assigned_agent_id) !== String(connection.actorId)) {
            throw createError(403, "HANGUP_NOT_AUTHORIZED", "Agent is not assigned to this session");
        }
    } else if (connection.actorType === "USER" && String(connection.sessionId) !== String(sessionId)) {
        throw createError(403, "HANGUP_NOT_AUTHORIZED", "User is not connected to this session");
    }

    /*
     * =========================================
     * GET SESSION CONNECTIONS
     * =========================================
     *
     * Hangup can come from Agent OR User.
     *
     * We therefore find the assigned Agent
     * from the session connections.
     */

    const connections =
        registry.getSessionConnections(
            sessionId
        );

    const agentConnection =
        connections.find(
            item =>
                item.actorType === "AGENT"
        );

    /*
     * The Agent socket may already be disconnected.
     * In that case the session DB record is the
     * authoritative source for assigned_agent_id.
     */
    let agentId =
        agentConnection &&
        agentConnection.actorId;

    if (!agentId) {
        const session =
            await repository.getSession(
                sessionId
            );

        if (!session) {
            throw createError(
                404,
                "SESSION_NOT_FOUND",
                "KYC session not found"
            );
        }

        agentId = session.assigned_agent_id;
    }

    if (!agentId) {
        throw createError(
            409,
            "AGENT_NOT_ASSIGNED",
            "No agent is assigned to this session"
        );
    }

    /*
     * =========================================
     * END CALL
     * =========================================
     */

    const reason =(
            message.data &&
            message.data.reason
        ) ||
        "CALL_ENDED";

    const result =
        await callLifecycle.endCall({
            companyId:connection.companyId,
            agentId,
            sessionId,
            reason,
            terminalStatus: connection.actorType === "USER" ? "CANCELLED" : "COMPLETED"
        });

    /*
     * =========================================
     * RELEASE AGENT
     * =========================================
     *
     * COMPLETED session ke baad agent
     * next queue item ke liye available.
     */

    await matcher.releaseAgent(
        connection.companyId,
        agentId,
        0,
        sessionId
    );

    /*
     * =========================================
     * NOTIFY BOTH PARTICIPANTS
     * =========================================
     */

    const endPayload = {
        sessionId,
        status: result.status,
        reason: result.reason
    };
    publisher.sendToSession(sessionId, WEBRTC_EVENT.HANGUP, endPayload);
    publisher.sendToSession(sessionId, EVENT.CALL_ENDED, endPayload);
    publisher.sendToSession(sessionId, EVENT.KYC_COMPLETED, endPayload);
    publisher.sendToAgent(agentId, EVENT.CALL_ENDED, endPayload);

    // Close only the session-scoped user socket. The agent socket stays alive
    // for presence/next assignment. The terminal DB state prevents the user
    // close handler from entering reconnect mode.
    for (const c of registry.getSessionConnections(sessionId)) {
        if (c.actorType === "USER" && c.socket?.readyState === 1) {
            try { c.socket.close(1000, "KYC call ended"); } catch (_) {}
        }
    }

    /*
     * =========================================
     * LOG
     * =========================================
     */

    console.log(
        `[CALL END] ` +
        `session=${sessionId} ` +
        `agent=${agentId} ` +
        `reason=${result.reason}`
    );
    await safeAudit({
    companyId: connection.companyId,
    actorType: "AGENT",
    action: "CALL_END",
    entityType: "KYC_SESSION",
    entityId: sessionId,
    details: {
        agentId,
        status: result.status,
        reason
    }
});
}


/*
 * =========================================================
 * RESTORE RECONNECTING SESSION
 * =========================================================
 */

async function tryRestoreSession({
    connectionId,
    actorType,
    actorId,
    companyId
}) {

    /*
     * =========================================
     * FIND RECONNECTING SESSION
     * =========================================
     */

    let session = null;

    if (actorType === "AGENT") {
        session =
            await repository.findReconnectingSession({
                companyId,
                agentId: actorId
            });
    } else if (actorType === "USER") {
        session =
            await repository.findReconnectingUserSession({
                companyId,
                externalUserId: actorId
            });
    } else {
        return null;
    }

    if (!session) {
        return null;
    }

    /*
     * =========================================
     * ACTOR-SPECIFIC REDIS MARKER
     * =========================================
     */

    const reconnect =
        await getReconnecting({
            sessionId: session.id,
            actorType,
            actorId
        });

    if (!reconnect) {
        console.log(
            `[KYC RECONNECT] Grace period expired ` +
            `session=${session.id} ` +
            `actor=${actorType}:${actorId}`
        );
        return null;
    }

    if (
        String(reconnect.actorId) !==
        String(actorId) ||
        reconnect.actorType !== actorType
    ) {
        console.warn(
            `[KYC RECONNECT] Actor mismatch ` +
            `session=${session.id}`
        );
        return null;
    }

    const previousStatus =
        reconnect.previousStatus;

    if (
        previousStatus !== "CONNECTED" &&
        previousStatus !== "IN_PROGRESS"
    ) {
        console.warn(
            `[KYC RECONNECT] Invalid previous status ` +
            `session=${session.id} ` +
            `status=${previousStatus}`
        );
        return null;
    }

    /*
     * =========================================
     * RESTORE DATABASE
     * =========================================
     */

    let restored = false;

    if (actorType === "AGENT") {
        restored =
            await repository.restoreReconnectingSession({
                sessionId: session.id,
                companyId,
                agentId: actorId,
                status: previousStatus
            });
    } else {
        restored =
            await repository.restoreReconnectingUserSession({
                sessionId: session.id,
                companyId,
                externalUserId: actorId,
                status: previousStatus
            });
    }

    if (!restored) {
        console.warn(
            `[KYC RECONNECT] Restore failed ` +
            `session=${session.id} ` +
            `actor=${actorType}:${actorId}`
        );
        return null;
    }

    registry.attachSession(
        connectionId,
        session.id
    );

    if (actorType === "AGENT") {
        await restoreBusy(
            actorId,
            companyId,
            session.id
        );
    }

    await clearReconnecting({
        sessionId: session.id,
        actorType,
        actorId
    });

    const connection =
        registry.get(connectionId);

    if (connection) {
        publisher.send(
            connection.socket,
            WEBRTC_EVENT.RECONNECT,
            {
                sessionId: session.id,
                status: previousStatus,
                restored: true
            }
        );
    }

    publisher.sendToSession(
        session.id,
        WEBRTC_EVENT.RECONNECT,
        {
            sessionId: session.id,
            status: previousStatus,
            restored: true,
            reconnectedActor: {
                type: actorType,
                id: actorId
            }
        }
    );

    console.log(
        `[KYC RECONNECT] RESTORED ` +
        `session=${session.id} ` +
        `actor=${actorType}:${actorId} ` +
        `status=${previousStatus}`
    );
    await safeAudit({
        companyId: connection.companyId,
        actorUserId: null,
        actorType: connection.actorType,
        action: "SESSION_RECONNECTED",
        entityType: "KYC_SESSION",
        entityId: session.id,
        details: {
            actorId: connection.actorId,
            previousStatus,
            status: previousStatus
        }
    });

    return {
        sessionId: session.id,
        status: previousStatus
    };
}

/*
 * =========================================================
 * ERROR
 * =========================================================
 */

function createError(
    statusCode,
    code,
    message
) {

    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    error.code =
        code;

    return error;
}


/*
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
    registerConnection
};
