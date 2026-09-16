const {
    verifyAccessToken
} = require("../utils/jwt");

function getBearerToken(req) {
    const header =
        req.headers.authorization;

    if (!header) {
        return null;
    }

    const [type, token] =
        header.split(" ");

    if (
        type !== "Bearer" ||
        !token
    ) {
        return null;
    }

    return token;
}

function authenticate(req) {
    const token =
        getBearerToken(req);

    if (!token) {
        const error = new Error(
            "Authentication required"
        );

        error.code = "AUTH_REQUIRED";
        error.statusCode = 401;

        throw error;
    }

    try {
        return verifyAccessToken(token);
    } catch (err) {
        const error = new Error(
            "Invalid or expired access token"
        );

        error.code = "INVALID_TOKEN";
        error.statusCode = 401;

        throw error;
    }
}

function requireAgent(req) {
    const user = authenticate(req);

    if (user.role !== "AGENT") {
        const error = new Error(
            "Agent access required"
        );

        error.code = "AGENT_ACCESS_REQUIRED";
        error.statusCode = 403;

        throw error;
    }

    req.auth = user;

    return user;
}

module.exports = {
    authenticate,
    requireAgent
};