const registry =
    require("../../realtime/connection.registry");

const publisher =
    require("../../realtime/websocket.publisher");

const {
    WEBRTC_EVENT
} =
    require("../../realtime/webrtc.events");

const {
    validateEvent
} =
    require("./webrtc.validator");

const {
    authorizeSignal,
    validateStateForCall
} =
    require("./webrtc.signaling.service");

const repository =
    require("./webrtc.session.repository");


/*
 * =========================================
 * HANDLE WEBRTC SIGNAL
 * =========================================
 */

async function handleSignal({
    connectionId,
    message
}) {

    /*
     * =========================================
     * VALIDATE MESSAGE
     * =========================================
     */

    validateEvent(message);


    /*
     * =========================================
     * GET CONNECTION
     * =========================================
     */

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
     * SESSION ID
     * =========================================
     *
     * Support:
     *
     * {
     *   sessionId: "..."
     * }
     *
     * OR
     *
     * {
     *   data: {
     *      sessionId: "..."
     *   }
     * }
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
     * AUTHORIZE SESSION
     * =========================================
     */

    const session =
        await authorizeSignal({
            sessionId,
            companyId:
                connection.companyId,
            actorType:
                connection.actorType,
            actorId:
                connection.actorId
        });


    /*
     * =========================================
     * RECONNECT
     * =========================================
     *
     * RECONNECTING session ke andar
     * participant apna new WebSocket /
     * WebRTC negotiation start kar sakta hai.
     *
     * IMPORTANT:
     *
     * RECONNECT event DB state ko directly
     * change nahi karega.
     *
     * DB:
     *
     * RECONNECTING
     *      |
     *      | READY
     *      v
     * CONNECTING
     *      |
     *      | CONNECTED
     *      v
     * CONNECTED
     */

    if (
        message.event ===
        WEBRTC_EVENT.RECONNECT
    ) {

        /*
         * RECONNECT is only valid when
         * session is already reconnecting.
         */

        if (
            session.status !==
            "RECONNECTING"
        ) {

            throw createError(
                409,
                "INVALID_RECONNECT_STATE",
                `Reconnect is not allowed in ${session.status}`
            );
        }


        /*
         * Attach current socket to session.
         */

        registry.attachSession(
            connectionId,
            sessionId
        );


        /*
         * Notify other participant.
         *
         * Example:
         *
         * Agent reconnects
         * ->
         * User receives:
         *
         * {
         *   event: "webrtc.reconnect",
         *   data: {
         *      sessionId,
         *      status: "RECONNECTING",
         *      reconnectedActor: {...}
         *   }
         * }
         */

        sendReconnectToPeers({
            sessionId,
            connection,
            excludeConnectionId:
                connectionId
        });


        return;
    }


    /*
     * =========================================
     * CALL START
     * =========================================
     *
     * CALL_START is handled by
     * websocket.connection.js.
     */

    if (
        message.event ===
        WEBRTC_EVENT.CALL_START
    ) {

        throw createError(
            400,
            "CALL_START_NOT_ALLOWED",
            "CALL_START must be handled by call lifecycle"
        );
    }


    /*
     * =========================================
     * STATE VALIDATION
     * =========================================
     *
     * NOTE:
     *
     * During reconnect:
     *
     * RECONNECTING
     *       |
     *       | READY
     *       v
     * CONNECTING
     *
     * Therefore READY must be accepted
     * in RECONNECTING.
     *
     * We handle this specifically below.
     */

    if (
        message.event ===
        WEBRTC_EVENT.READY
    ) {

        /*
         * Normal flow:
         *
         * ACCEPTED
         * CONNECTING
         *
         * Reconnect flow:
         *
         * RECONNECTING
         */

        if (
            session.status !== "ACCEPTED" &&
            session.status !== "CONNECTING" &&
            session.status !== "RECONNECTING" &&
            session.status !== "CONNECTED" &&
            session.status !== "IN_PROGRESS"
        ) {

            throw createError(
                409,
                "INVALID_CALL_STATE",
                `WebRTC READY is not allowed in ${session.status}`
            );
        }


        /*
         * Attach socket.
         */

        registry.attachSession(
            connectionId,
            sessionId
        );


        /*
         * IMPORTANT:
         *
         * If reconnecting, move:
         *
         * RECONNECTING -> CONNECTING
         *
         * This tells the backend that
         * WebRTC renegotiation is in progress.
         */

        if (
            session.status ===
            "RECONNECTING"
        ) {

            await repository.updateCallState({
                sessionId,
                status:
                    "CONNECTING"
            });


            /*
             * Tell the peer that the
             * reconnecting participant is
             * ready for negotiation.
             */

            sendEventToPeers({
                sessionId,
                connection,
                event:
                    WEBRTC_EVENT.READY,
                payload: {
                    sessionId,
                    reconnecting: true,
                    from: {
                        type:
                            connection.actorType,
                        id:
                            connection.actorId
                    }
                }
            });

            return;
        }


        /*
         * Normal READY.
         *
         * ACCEPTED -> CONNECTING
         */

        if (
            session.status ===
            "ACCEPTED"
        ) {

            await repository.updateCallState({
                sessionId,
                status:
                    "CONNECTING"
            });
        }


        /*
         * Attach session before
         * forwarding to peer.
         */

        registry.attachSession(
            connectionId,
            sessionId
        );


        /*
         * Forward READY to peer.
         */

        sendEventToPeers({
            sessionId,
            connection,
            event:
                WEBRTC_EVENT.READY,
            payload: {
                sessionId,
                reconnecting: false,
                from: {
                    type:
                        connection.actorType,
                    id:
                        connection.actorId
                }
            }
        });

        return;
    }


    /*
     * =========================================
     * CONNECTED
     * =========================================
     *
     * WebRTC media connection established.
     */

    if (
        message.event ===
        WEBRTC_EVENT.CONNECTED
    ) {

        /*
         * CONNECTED is valid from:
         *
         * CONNECTING
         * CONNECTED
         *
         * RECONNECTING is also tolerated
         * for race-condition safety.
         */

        if (
            session.status !==
                "CONNECTING" &&
            session.status !==
                "CONNECTED" &&
            session.status !==
                "RECONNECTING"
        ) {

            throw createError(
                409,
                "INVALID_CONNECTED_STATE",
                `Cannot mark WebRTC connected from ${session.status}`
            );
        }


        /*
         * Attach socket.
         */

        registry.attachSession(
            connectionId,
            sessionId
        );


        /*
         * Move to CONNECTED.
         */

        if (
            session.status !==
            "CONNECTED"
        ) {

            await repository.updateCallState({
                sessionId,
                status:
                    "CONNECTED"
            });
        }


        /*
         * Forward CONNECTED to peer.
         */

        sendEventToPeers({
            sessionId,
            connection,
            event:
                WEBRTC_EVENT.CONNECTED,
            payload: {
                sessionId,
                from: {
                    type:
                        connection.actorType,
                    id:
                        connection.actorId
                }
            }
        });

        return;
    }


    /*
     * =========================================
     * NORMAL WEBRTC SIGNALING
     * =========================================
     *
     * OFFER
     * ANSWER
     * ICE
     * MUTE
     * VIDEO
     */

    validateStateForCall(
        message.event,
        session
    );


    /*
     * =========================================
     * ATTACH SOCKET
     * =========================================
     */

    registry.attachSession(
        connectionId,
        sessionId
    );


    /*
     * =========================================
     * SIGNAL PAYLOAD
     * =========================================
     */

    const payload =
        message.payload ||
        message.data ||
        null;

    if ([WEBRTC_EVENT.READY, WEBRTC_EVENT.OFFER, WEBRTC_EVENT.ANSWER, WEBRTC_EVENT.ICE_CANDIDATE].includes(message.event)) {
        const peerCount = registry.getSessionConnections(sessionId).filter(c => c.connectionId !== connectionId).length;
        console.log(`[WEBRTC SIGNAL] event=${message.event} session=${sessionId} actor=${connection.actorType}:${connection.actorId} state=${session.status} peers=${peerCount}`);
    }

    /*
     * =========================================
     * FORWARD SIGNAL
     * =========================================
     */

    sendEventToPeers({
        sessionId,
        connection,
        event:
            message.event,
        payload
    });


    /*
     * =========================================
     * NO DATABASE STATE CHANGE
     * =========================================
     *
     * OFFER / ANSWER / ICE /
     * MUTE / VIDEO do not change
     * KYC session state.
     */

    return;
}


/*
 * =========================================
 * SEND EVENT TO PEERS
 * =========================================
 */

function sendEventToPeers({
    sessionId,
    connection,
    event,
    payload
}) {

    const connections =
        registry.getSessionConnections(
            sessionId
        );


    for (
        const target of connections
    ) {

        /*
         * Do not send to sender.
         */

        if (
            target.connectionId ===
            connection.connectionId
        ) {
            continue;
        }


        /*
         * Do not send to dead socket.
         *
         * ws OPEN = 1
         */

        if (
            !target.socket ||
            target.socket.readyState !== 1
        ) {
            continue;
        }


        /*
         * Security:
         *
         * Same company only.
         */

        if (
            String(
                target.companyId
            ) !==
            String(
                connection.companyId
            )
        ) {
            continue;
        }


        /*
         * Send event.
         */

        publisher.sendCn(
            target,
            event,
            payload
        );
    }
}


/*
 * =========================================
 * RECONNECT PEER NOTIFICATION
 * =========================================
 */

function sendReconnectToPeers({
    sessionId,
    connection,
    excludeConnectionId
}) {

    const connections =
        registry.getSessionConnections(
            sessionId
        );


    for (
        const target of connections
    ) {

        /*
         * Do not send to
         * reconnecting socket itself.
         */

        if (
            target.connectionId ===
            excludeConnectionId
        ) {
            continue;
        }


        /*
         * Ignore dead socket.
         */

        if (
            !target.socket ||
            target.socket.readyState !== 1
        ) {
            continue;
        }


        /*
         * Same company only.
         */

        if (
            String(
                target.companyId
            ) !==
            String(
                connection.companyId
            )
        ) {
            continue;
        }


        publisher.sendCn(
            target,
            WEBRTC_EVENT.RECONNECT,
            {
                sessionId,
                status:
                    "RECONNECTING",
                reconnectedActor: {
                    type:
                        connection.actorType,
                    id:
                        connection.actorId
                }
            }
        );
    }
}


/*
 * =========================================
 * ERROR
 * =========================================
 */

function createError(statusCode,code,message) {
    const error =new Error(message);
    error.statusCode =statusCode;
    error.code =code;
    return error;
}


module.exports = {
    handleSignal
};
