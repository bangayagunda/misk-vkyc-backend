const agentController =
    require("./agent.controller");

const {
    requireAgent
} = require("../../middleware/auth.middleware");

const callController =
    require("../calls/call.controller");


async function handleAgentRoutes(
    req,
    res,
    pathname,
    body
) {

    /*
     * =========================
     * AGENT PROFILE
     * =========================
     */

    if (
        req.method === "GET" &&
        pathname === "/api/v1/agents/me"
    ) {
        requireAgent(req);

        return agentController.me(
            req,
            res
        );
    }


    /*
     * =========================
     * AGENT PRESENCE
     * =========================
     */

    if (
        req.method === "POST" &&
        pathname === "/api/v1/agents/online"
    ) {
        requireAgent(req);

        return agentController.online(
            req,
            res
        );
    }


    if (
        req.method === "POST" &&
        pathname === "/api/v1/agents/offline"
    ) {
        requireAgent(req);

        return agentController.offline(
            req,
            res
        );
    }


    if (
        req.method === "POST" &&
        pathname === "/api/v1/agents/heartbeat"
    ) {
        requireAgent(req);

        return agentController.heartbeat(
            req,
            res
        );
    }


    if (
        req.method === "GET" &&
        pathname === "/api/v1/agents/me/status"
    ) {
        requireAgent(req);

        return agentController.status(
            req,
            res
        );
    }


    if (req.method === "GET" && pathname === "/api/v1/agents/calls/active") {
        const auth = requireAgent(req);
        return callController.active(req, res, auth);
    }


    /*
     * =========================
     * CALL ACCEPT
     * =========================
     *
     * POST
     * /api/v1/agents/calls/:sessionId/accept
     */

    const acceptMatch =
        pathname.match(
            /^\/api\/v1\/agents\/calls\/([0-9a-fA-F-]+)\/accept$/
        );


    if (
        req.method === "POST" &&
        acceptMatch
    ) {
        const auth =
            requireAgent(req);

        req.params = {
            sessionId:
                acceptMatch[1]
        };

        return callController.accept(
            req,
            res,
            auth
        );
    }


    const rejectMatch = pathname.match(/^\/api\/v1\/agents\/calls\/([0-9a-fA-F-]+)\/reject$/);
    if (req.method === "POST" && rejectMatch) {
        const auth = requireAgent(req);
        req.params = { sessionId: rejectMatch[1] };
        return callController.reject(req, res, auth, body);
    }


    /*
     * =========================
     * CALL START
     * =========================
     *
     * POST
     * /api/v1/agents/calls/:sessionId/start
     */

    const startMatch =
        pathname.match(
            /^\/api\/v1\/agents\/calls\/([0-9a-fA-F-]+)\/start$/
        );


    if (
        req.method === "POST" &&
        startMatch
    ) {
        const auth =
            requireAgent(req);

        req.params = {
            sessionId:
                startMatch[1]
        };

        return callController.start(
            req,
            res,
            auth
        );
    }


    /*
     * =========================
     * CALL END
     * =========================
     *
     * POST
     * /api/v1/agents/calls/:sessionId/end
     */

    const endMatch =
        pathname.match(
            /^\/api\/v1\/agents\/calls\/([0-9a-fA-F-]+)\/end$/
        );


    if (
        req.method === "POST" &&
        endMatch
    ) {
        const auth =
            requireAgent(req);

        req.params = {
            sessionId:
                endMatch[1]
        };

        return callController.end(
            req,
            res,
            auth,
            body
        );
    }


    return false;
}


module.exports = {
    handleAgentRoutes
};