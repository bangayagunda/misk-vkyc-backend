const authService = require("./auth.service");

const {
    success,
    error
} = require("../../core/http/response");

async function login(req, res, body) {
    try {
        const result =
            await authService.login(
                body.identifier,
                body.password
            );

        return success(res, result);
    } catch (err) {
        console.error(
            "[AUTH LOGIN ERROR]",
            err.message
        );

        return error(
            res,
            err.statusCode || 500,
            err.code || "INTERNAL_ERROR",
            err.message || "Internal server error"
        );
    }
}

module.exports = {
    login
};

async function refresh(req, res, body) {
    try {
        const result = await authService.refresh(body.refreshToken, {
            ipAddress: req.socket?.remoteAddress,
            userAgent: req.headers?.["user-agent"]
        });
        return success(res, result);
    } catch (err) {
        return error(res, err.statusCode || 500, err.code || "REFRESH_FAILED", err.message);
    }
}

module.exports.refresh = refresh;
