const authController =
    require("./auth.controller");

async function handleAuthRoutes(
    req,
    res,
    pathname,
    body
) {
    if (req.method === "POST" && pathname === "/api/v1/auth/agent/login") {
        return authController.login(req, res, body);
    }
    if (req.method === "POST" && pathname === "/api/v1/auth/refresh") {
        return authController.refresh(req, res, body);
    }

    return false;
}

module.exports = {
    handleAuthRoutes
};