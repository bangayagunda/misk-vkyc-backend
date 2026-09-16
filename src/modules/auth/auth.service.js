const {comparePassword} = require("../../utils/password");
const {createAccessToken,createRefreshToken,verifyRefreshToken} = require("../../utils/jwt");
const crypto = require("crypto");
const authRepository = require("./auth.repository");

async function login(identifier, password) {
    if (!identifier || !password) {
        const error = new Error("Identifier and password are required");
        error.code = "AUTH_REQUIRED";
        error.statusCode = 400;
        throw error;
    }
    const agent =await authRepository.findAgentForLogin(identifier);
    if (!agent) {
        const error = new Error("Invalid credentials");
        error.code = "INVALID_CREDENTIALS";
        error.statusCode = 401;
        throw error;
    }

    if (
        agent.user_status !== "ACTIVE" ||
        agent.agent_status !== "ACTIVE" ||
        agent.company_status !== "ACTIVE"
    ) {
        const error = new Error("Agent account is not active");
        error.code = "AGENT_INACTIVE";
        error.statusCode = 403;

        throw error;
    }
//console.log("PASSWORD PROVIDED:", password);
//console.log("PASSWORD HASH:", agent.password_hash);
    const validPassword =await comparePassword(
            password,
            agent.password_hash
        );
//console.log("PASSWORD VALID:", validPassword);
    if (!validPassword) {
        const error = new Error("Invalid credentials");
        error.code = "INVALID_CREDENTIALS";
        error.statusCode = 401;
        throw error;
    }

    await authRepository.updateLastLogin(
        agent.user_id
    );

    const tokenPayload = {
        sub: agent.user_id,
        agentId: agent.agent_id,
        companyId: agent.company_id,
        role: "AGENT"
    };

    const accessToken =
        createAccessToken(tokenPayload);

    const refreshToken =
        createRefreshToken(tokenPayload);

    await authRepository.createRefreshTokenRecord({
        userId: agent.user_id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(process.env.JWT_REFRESH_EXPIRES || "30d")),
    });

    return {
        accessToken,
        refreshToken,

        agent: {
            id: agent.agent_id,
            userId: agent.user_id,
            agentCode: agent.agent_code,
            name: agent.agent_name,
            email: agent.email,

            company: {
                id: agent.company_id,
                code: agent.company_code,
                name: agent.company_name
            }
        }
    };
}

module.exports = {
    login
};

async function refresh(refreshToken, { ipAddress, userAgent } = {}) {
    if (!refreshToken) {
        const e = new Error("Refresh token is required"); e.code = "REFRESH_TOKEN_REQUIRED"; e.statusCode = 400; throw e;
    }
    let payload;
    try { payload = verifyRefreshToken(refreshToken); }
    catch (_) { const e = new Error("Invalid or expired refresh token"); e.code = "INVALID_REFRESH_TOKEN"; e.statusCode = 401; throw e; }
    const agent = await authRepository.findAgentById(payload.agentId);
    if (!agent || agent.user_status !== "ACTIVE" || agent.status !== "ACTIVE" || agent.company_status !== "ACTIVE") {
        const e = new Error("Agent account is inactive"); e.code = "AGENT_INACTIVE"; e.statusCode = 403; throw e;
    }
    const tokenPayload = { sub: agent.user_id, agentId: agent.id, companyId: agent.company_id, role: "AGENT" };
    const newAccessToken = createAccessToken(tokenPayload);
    const newRefreshToken = createRefreshToken(tokenPayload);
    try {
        await authRepository.rotateRefreshToken({
            tokenHash: hashToken(refreshToken),
            newTokenHash: hashToken(newRefreshToken),
            newExpiresAt: new Date(Date.now() + parseDurationMs(process.env.JWT_REFRESH_EXPIRES || "30d")),
            ipAddress, userAgent
        });
    } catch (_) {
        const e = new Error("Refresh token is invalid, expired, or already used"); e.code = "INVALID_REFRESH_TOKEN"; e.statusCode = 401; throw e;
    }
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function parseDurationMs(value) {
    const m = String(value).trim().match(/^(\d+)([smhd])$/i);
    if (!m) return 30 * 24 * 60 * 60 * 1000;
    const n = Number(m[1]); const units = { s:1000, m:60000, h:3600000, d:86400000 };
    return n * units[m[2].toLowerCase()];
}

module.exports.refresh = refresh;
