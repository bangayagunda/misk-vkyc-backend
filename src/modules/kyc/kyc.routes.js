const controller =
    require("./kyc.controller");
const controller1 =
    require("./kyc.document.controller");
const { requireAgent } = require("../../middleware/auth.middleware");

async function handleKycRoutes(
    req,
    res,
    pathname,
    body
) {

    if (
        req.method === "POST" &&
        pathname === "/api/v1/kyc/request"
    ) {
        return controller.createRequest(
            req,
            res,
            body
        );
    }


    const sessionMatch =
        pathname.match(
            /^\/api\/v1\/kyc\/sessions\/([0-9a-fA-F-]+)$/
        );


    const wsTokenMatch = pathname.match(/^\/api\/v1\/kyc\/sessions\/([0-9a-fA-F-]+)\/ws-token$/);
    if (req.method === "POST" && wsTokenMatch) {
        return controller.renewUserWsToken(req, res, wsTokenMatch[1], body);
    }


    if (req.method === "GET" && sessionMatch) {
        return controller.getSession(req, res, sessionMatch[1]);
    }


    const cancelMatch =
        pathname.match(
            /^\/api\/v1\/kyc\/sessions\/([0-9a-fA-F-]+)\/cancel$/
        );


    if (
        req.method === "POST" &&
        cancelMatch
    ) {
        return controller.cancelSession(req, res, cancelMatch[1], body);
    }


    if (
    req.method === "POST" &&
    pathname ===
        "/api/v1/kyc/session/complete"
    ) {
        return controller.completeSession(
            req,
            res,
            body
        );
    }

    if (
    req.method === "GET" &&
    pathname ===
        "/api/v1/kyc/actions"
    ) {
        const auth = requireAgent(req);
        return controller.getActions(req, res, auth);
    }

    if (
    req.method === "POST" &&
    pathname.startsWith(
        "/api/v1/kyc/sessions/"
    ) &&
    pathname.endsWith(
        "/action"
    )
    ) {

        const sessionId =
            pathname
                .split("/")
                .filter(Boolean)
                .at(-2);


        const auth = requireAgent(req);
        return controller.executeAction(req, res, auth, body);
    }

    if (
    req.method === "GET" &&
    pathname.startsWith(
        "/api/v1/kyc/sessions/"
    ) &&
    pathname.includes(
        "/data/"
    )
) {

    const parts =
        pathname
            .split("/")
            .filter(Boolean);


    const sessionIndex =
        parts.indexOf("sessions");


    const sessionId =
        parts[
            sessionIndex + 1
        ];


    const type =
        parts[
            sessionIndex + 3
        ];


    req.params = {
        sessionId,
        type
    };


    const auth = requireAgent(req);
    return controller1.getKycData(req, res, auth);
}

    return false;
}

module.exports = {
    handleKycRoutes
};