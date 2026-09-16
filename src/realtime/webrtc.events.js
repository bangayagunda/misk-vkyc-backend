const WEBRTC_EVENT = Object.freeze({

    CALL_START: "webrtc.call.start",

    OFFER: "webrtc.offer",

    ANSWER: "webrtc.answer",

    ICE_CANDIDATE: "webrtc.ice_candidate",

    READY: "webrtc.ready",

    CONNECTED: "webrtc.connected",

    RECONNECT: "webrtc.reconnect",

    MUTE_CHANGED: "webrtc.mute_changed",

    VIDEO_CHANGED: "webrtc.video_changed",

    HANGUP: "webrtc.hangup",

    REJECT: "webrtc.reject",

    ERROR: "webrtc.error"
});


module.exports = {
    WEBRTC_EVENT
};