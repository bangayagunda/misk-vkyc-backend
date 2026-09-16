const {verifyAccessToken, verifyKycUserWebSocketToken} = require("../utils/jwt");

function authenticateWebSocket( request) {
    const url =new URL(request.url,"http://localhost");
    /*
     * Recommended:
     *
     * ws://host/ws/agent?token=JWT
     *
     * For production, token should preferably
     * be short-lived.
     */
    const token =url.searchParams.get("token");
    if (!token) {
        const error =new Error("WebSocket token required");
        error.code ="WS_AUTH_REQUIRED";
        error.statusCode = 401;
        throw error;
    }

    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch (error) {
        const authError =new Error("Invalid WebSocket token");
        authError.code ="WS_INVALID_TOKEN";
        authError.statusCode = 401;
        throw authError;
    }


    /*
     * Expected JWT:
     *
     * {
     *   sub: userId,
     *   userId: "...",
     *   agentId: "...",
     *   companyId: "...",
     *   userType: "AGENT"
     * }
     */

    const userId =payload.userId || payload.sub;
    const agentId =payload.agentId;
    const companyId =payload.companyId;

    if (!userId || !agentId || !companyId) {
        const error =new Error("Incomplete agent authentication");
        error.code ="WS_INVALID_AGENT_CONTEXT";
        error.statusCode = 403;
        throw error;
    }

    if (payload.userType && payload.userType !== "AGENT") {
        const error =new Error("Only agents can connect to this socket");
        error.code ="WS_AGENT_ONLY";
        error.statusCode = 403;
        throw error;
    }

    return { userId, agentId,companyId
    };
}

function authenticateUserWebSocket(request) {
    const url = new URL( request.url,"http://localhost");
    const token =url.searchParams.get( "token");
    if (!token) {
        const error =new Error( "User WebSocket token required");
        error.code = "WS_USER_AUTH_REQUIRED";
        error.statusCode =401;
        throw error;
    }

    let payload;
    try {
        payload =verifyKycUserWebSocketToken(token);

    } catch (error) {
        const authError =new Error("Invalid user WebSocket token");
        authError.code ="WS_USER_INVALID_TOKEN";
        authError.statusCode =401;
        throw authError;
    }

    if (payload.tokenType !== "KYC_USER_WS") {
        const error =new Error("Invalid user WebSocket token type");
        error.code = "WS_USER_INVALID_TOKEN_TYPE";
        error.statusCode = 403;
        throw error;
    }

    if (!payload.sessionId ||!payload.companyId ||!payload.externalUserId) {
        const error = new Error("Incomplete user WebSocket context");
        error.code ="WS_USER_INVALID_CONTEXT";
        error.statusCode =403;
        throw error;
    }

    return {
        userId:payload.externalUserId,
        externalUserId:payload.externalUserId,
        sessionId: payload.sessionId,
        companyId:payload.companyId
    };
}


module.exports = {
    authenticateWebSocket,
    authenticateUserWebSocket
};