const repository =
    require("./webrtc.session.repository");

const {
    WEBRTC_EVENT
} = require("../../realtime/webrtc.events");


async function authorizeSignal({
    sessionId,
    companyId,
    actorType,
    actorId
}) {

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


    if (
        String(session.company_id)
        !==
        String(companyId)
    ) {
        throw createError(
            403,
            "COMPANY_MISMATCH",
            "Session does not belong to this company"
        );
    }


    /*
     * Agent must be the assigned agent.
     */
    if (
        actorType === "AGENT"
    ) {

        if (
            String(
                session.assigned_agent_id
            ) !==
            String(actorId)
        ) {
            throw createError(
                403,
                "AGENT_NOT_ASSIGNED",
                "Agent is not assigned to this session"
            );
        }
    }


    /*
     * User authorization will be
     * checked using the authenticated
     * customer identity.
     */
    if (
        actorType === "USER"
    ) {

        if (
            String(
                session.external_user_id
            ) !==
            String(actorId)
        ) {
            throw createError(
                403,
                "USER_SESSION_MISMATCH",
                "User is not allowed for this session"
            );
        }
    }


    return session;
}

function validateStateForCall(
    event,
    session
) {
    const status = session.status;

    /*
     * =========================================
     * CALL START
     * =========================================
     *
     * Agent accepted the KYC request.
     *
     * ACCEPTED -> IN_PROGRESS
     *
     * Note:
     * CALL_START is handled separately in
     * websocket.connection.js, so this validation
     * is mainly for safety.
     */

    if (
        event === WEBRTC_EVENT.CALL_START
    ) {
        if (status !== "ACCEPTED") {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `Call cannot start in ${status} state`
            );
        }

        return true;
    }


    /*
     * =========================================
     * WEBRTC READY
     * =========================================
     *
     * Normal call:
     *
     * ACCEPTED / CONNECTING -> READY
     *
     * Reconnect:
     *
     * RECONNECTING -> READY
     *
     * IMPORTANT:
     * READY during RECONNECTING must NOT
     * change DB state to CONNECTING.
     */
        if (event === WEBRTC_EVENT.READY) {
            if (status !== "ACCEPTED" &&
                status !== "CONNECTING" &&
                status !== "RECONNECTING" &&
                status !== "CONNECTED" &&
                status !== "IN_PROGRESS") {
                throw createError(
                    409,
                    "INVALID_CALL_STATE",
                    `WebRTC READY is not allowed in ${status}`
                );
            }
            return true;
        }

    /*
     * =========================================
     * OFFER / ANSWER / ICE
     * =========================================
     *
     * Normal WebRTC:
     *
     * ACCEPTED
     * CONNECTING
     * CONNECTED
     * IN_PROGRESS
     *
     * Reconnect:
     *
     * RECONNECTING
     *
     * During reconnect the peers need to perform
     * a fresh WebRTC negotiation.
     */

    if (
        event === WEBRTC_EVENT.OFFER ||
        event === WEBRTC_EVENT.ANSWER ||
        event === WEBRTC_EVENT.ICE_CANDIDATE
    ) {
        if (
            status !== "ACCEPTED" &&
            status !== "CONNECTING" &&
            status !== "CONNECTED" &&
            status !== "IN_PROGRESS" &&
            status !== "RECONNECTING"
        ) {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `WebRTC signal is not allowed in ${status}`
            );
        }

        return true;
    }

    /*
     * =========================================
     * CONNECTED
     * =========================================
     *
     * Normal:
     *
     * CONNECTING -> CONNECTED
     *
     * Reconnect:
     *
     * RECONNECTING -> CONNECTED
     *
     * This is what finally closes the reconnect
     * state.
     */

    if (
        event === WEBRTC_EVENT.CONNECTED
    ) {
        if (
            status !== "CONNECTING" &&
            status !== "IN_PROGRESS" &&
            status !== "CONNECTED" &&
            status !== "RECONNECTING"
        ) {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `WebRTC CONNECTED is not allowed in ${status}`
            );
        }

        return true;
    }

    /*
     * =========================================
     * RECONNECT
     * =========================================
     *
     * RECONNECT event is generated when an
     * existing participant disconnects.
     *
     * CONNECTED / IN_PROGRESS
     *          ↓
     * RECONNECTING
     *
     * Normally client does not need to send
     * this event manually.
     */

    if (
        event === WEBRTC_EVENT.RECONNECT
    ) {
        if (
            status !== "CONNECTED" &&
            status !== "IN_PROGRESS"
        ) {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `WebRTC RECONNECT is not allowed in ${status}`
            );
        }

        return true;
    }

    /*
     * =========================================
     * MUTE / VIDEO
     * =========================================
     *
     * These controls are allowed only when
     * the call is actually active.
     *
     * NOT allowed during RECONNECTING.
     */

    if (
        event === WEBRTC_EVENT.MUTE_CHANGED ||
        event === WEBRTC_EVENT.VIDEO_CHANGED
    ) {
        // Mute/video are local media controls. They are safe to change
        // while the peer connection is negotiating, so do not reject them
        // merely because the KYC session is CONNECTING.
        if (
            status !== "ACCEPTED" &&
            status !== "CONNECTING" &&
            status !== "CONNECTED" &&
            status !== "IN_PROGRESS" &&
            status !== "RECONNECTING"
        ) {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `Call control is not allowed in ${status}`
            );
        }

        return true;
    }

    /*
     * =========================================
     * HANGUP / REJECT
     * =========================================
     *
     * User/Agent can terminate the call even
     * if the session is currently reconnecting.
     *
     * RECONNECTING -> COMPLETED
     *
     * This prevents a call from getting stuck
     * forever during reconnect.
     */

    if (
        event === WEBRTC_EVENT.HANGUP ||
        event === WEBRTC_EVENT.REJECT
    ) {
        if (
            status !== "ACCEPTED" &&
            status !== "CONNECTING" &&
            status !== "CONNECTED" &&
            status !== "IN_PROGRESS" &&
            status !== "RECONNECTING"
        ) {
            throw createError(
                409,
                "INVALID_CALL_STATE",
                `Call termination is not allowed in ${status}`
            );
        }

        return true;
    }

    /*
     * =========================================
     * UNKNOWN EVENT
     * =========================================
     */

    throw createError(
        400,
        "UNSUPPORTED_CALL_EVENT",
        `Unsupported WebRTC event: ${event}`
    );
}


function createError(
    statusCode,
    code,
    message
) {
    const error =new Error(message);
    error.statusCode =statusCode;
    error.code =code;
    return error;
}


module.exports = {
    authorizeSignal,
    validateStateForCall
};