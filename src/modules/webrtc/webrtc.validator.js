const {
    WEBRTC_EVENT
} = require("../../realtime/webrtc.events");


const ALLOWED_EVENTS = new Set([
    WEBRTC_EVENT.CALL_START,
    WEBRTC_EVENT.OFFER,
    WEBRTC_EVENT.ANSWER,
    WEBRTC_EVENT.ICE_CANDIDATE,
    WEBRTC_EVENT.READY,
    WEBRTC_EVENT.CONNECTED,
    WEBRTC_EVENT.RECONNECT,
    WEBRTC_EVENT.MUTE_CHANGED,
    WEBRTC_EVENT.VIDEO_CHANGED,
    WEBRTC_EVENT.HANGUP,
    WEBRTC_EVENT.REJECT
]);


function validateEvent(message) {
    if (!message ||
        typeof message !== "object" ||
        Array.isArray(message)) {
        throw createError(
            400,
            "INVALID_SIGNAL",
            "Invalid signaling message");
    }

    if (!message.event) {
        throw createError(
            400,
            "EVENT_REQUIRED",
            "WebRTC event is required"
        );
    }

    if (!ALLOWED_EVENTS.has(
            message.event)) {
        throw createError(
            400,
            "INVALID_SIGNAL_EVENT",
            "Unsupported signaling event"
        );
    }


    const sessionId = message.sessionId || message.data?.sessionId;
    if (!sessionId) {
        throw createError(400, "SESSION_ID_REQUIRED", "sessionId is required");
    }

    /*
     * =========================================
     * PAYLOAD VALIDATION
     * =========================================
     *
     * Only signaling events that actually
     * carry WebRTC data require payload.
     */

    const payload = message.payload || message.data;

    if (message.event === WEBRTC_EVENT.OFFER ||
        message.event === WEBRTC_EVENT.ANSWER) {
        validateDescriptionPayload(payload);
    }

    if (message.event ===
        WEBRTC_EVENT.ICE_CANDIDATE) {
        validateIceCandidatePayload(payload);
    }

    /*
     * MUTE / VIDEO state
     */

    if (message.event ===
        WEBRTC_EVENT.MUTE_CHANGED) {
        validateBooleanPayload({ ...message, payload: message.payload || message.data },"muted");
    }

    if (message.event ===
        WEBRTC_EVENT.VIDEO_CHANGED) {
        validateBooleanPayload(
            { ...message, payload: message.payload || message.data },
            "enabled"
        );
    }
    return true;
}

/*
 * =========================================
 * OFFER / ANSWER
 * =========================================
 */

function validateDescriptionPayload(message) {
    if (!message ||
        typeof message !== "object" ||
        Array.isArray(message)) {
        throw createError(
            400,
            "INVALID_SIGNAL_PAYLOAD",
            "WebRTC description payload is required"
        );
    }

    if (typeof message.sdp !== "string" ||
        !message.sdp.trim()) {
        throw createError(
            400,
            "SDP_REQUIRED",
            "SDP is required"
        );
    }
}

/*
 * =========================================
 * ICE CANDIDATE
 * =========================================
 */

function validateIceCandidatePayload(message) {
    if (!message ||
        typeof message !== "object" ||
        Array.isArray(message)) {
        throw createError(
            400,
            "INVALID_ICE_PAYLOAD",
            "ICE candidate payload is required"
        );
    }

    if (typeof message.candidate !==
        "string" ||
        !message.candidate.trim()
    ) {throw createError(
            400,
            "ICE_CANDIDATE_REQUIRED",
            "ICE candidate is required"
        );
    }


    /*
     * sdpMid and sdpMLineIndex can vary
     * depending on the WebRTC implementation.
     *
     * Therefore we don't unnecessarily
     * reject them here.
     */
}

/*
 * =========================================
 * BOOLEAN PAYLOAD
 * =========================================
 */

function validateBooleanPayload(message,field) {
    if (!message.payload ||
        typeof message.payload !== "object") {
        throw createError(
            400,
            "INVALID_SIGNAL_PAYLOAD",
            "Signal payload is required"
        );
    }

    if (typeof message.payload[field] !=="boolean") {
        throw createError(
            400,
            "INVALID_SIGNAL_VALUE",
            `${field} must be boolean`
        );
    }
}

/*
 * =========================================
 * ERROR
 * =========================================
 */
function createError(
    statusCode,
    code,
    message) {
    const error =new Error(message);
    error.statusCode =statusCode;
    error.code =code;
    return error;
}

module.exports = {
    validateEvent
};