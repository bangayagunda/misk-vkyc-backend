const jwt = require("jsonwebtoken");
const env = require("../config/env.js");
function createAccessToken(payload) {
    return jwt.sign(payload,
        env.jwt.accessSecret,
        {
            expiresIn: env.jwt.accessExpires,
            issuer: "video-kyc-platform",
            audience: "agent"
        }
    );
}

function createRefreshToken(payload) {
    return jwt.sign(payload,
        env.jwt.refreshSecret,
        {
            expiresIn: env.jwt.refreshExpires,
            issuer: "video-kyc-platform",
            audience: "agent"
        }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token,
        env.jwt.accessSecret,
        {
            issuer: "video-kyc-platform",
            audience: "agent"
        }
    );
}

function verifyRefreshToken(token) {
    return jwt.verify(token,
        env.jwt.refreshSecret,
        {
            issuer: "video-kyc-platform",
            audience: "agent"
        }
    );
}
function createKycUserWebSocketToken({
    sessionId,
    companyId,
    externalUserId}) {
    return jwt.sign(
        {
            tokenType: "KYC_USER_WS",
            sessionId,
            companyId,
            externalUserId
        },
        env.kycUserWs.secret,
        {
            expiresIn: env.kycUserWs.expires,
            issuer: "video-kyc-platform",
            audience: "kyc-user-ws"
        }
    );
}


function verifyKycUserWebSocketToken(token, options = {}) {
    return jwt.verify(token,
        env.kycUserWs.secret,{
            issuer:"video-kyc-platform",
            audience:"kyc-user-ws",
            ...(options.ignoreExpiration ? { ignoreExpiration: true } : {})
        }
    );
}

function renewKycUserWebSocketToken(token) {
    const payload = verifyKycUserWebSocketToken(token, { ignoreExpiration: true });
    if (payload.tokenType !== "KYC_USER_WS" || !payload.sessionId || !payload.companyId || !payload.externalUserId) {
        throw new Error("Invalid KYC user WebSocket token");
    }
    return createKycUserWebSocketToken({
        sessionId: payload.sessionId,
        companyId: payload.companyId,
        externalUserId: payload.externalUserId
    });
}

module.exports = {
    createAccessToken,
    createRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,

    createKycUserWebSocketToken,
    verifyKycUserWebSocketToken,
    renewKycUserWebSocketToken
};