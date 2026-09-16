const repository =require("../modules/webrtc/webrtc.session.repository");

async function authorizeUserConnection(auth) {
    const session =await repository.getUserSession({
            sessionId:auth.sessionId,
            companyId:auth.companyId,
            externalUserId:auth.externalUserId
        });

    if (!session) {
        const error =new Error("KYC session does not belong to this user");
        error.code ="WS_USER_SESSION_ACCESS_DENIED";
        error.statusCode =403;
        throw error;
    }

    const allowedStates = [
        "WAITING",
        "ASSIGNED",
        "RINGING",
        "ACCEPTED",
        "CONNECTING",
        "CONNECTED",
        "IN_PROGRESS",
        "RECONNECTING"
    ];


    if (!allowedStates.includes(session.status)) {
        const error =new Error(`User WebSocket is not allowed in ${session.status}`);
        error.code ="WS_USER_SESSION_INACTIVE";
        error.statusCode = 409;
        throw error;
    }
    return session;
}


module.exports = {
    authorizeUserConnection
};