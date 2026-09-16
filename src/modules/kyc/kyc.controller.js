const service =require("./kyc.service");

const { success, error } = require("../../core/http/response");

const sessionService =require("./kyc.session.service");
const actionService =require("./kyc.action.service");
const actionService1 =require("./kyc.session.action.service");


async function createRequest(req,res,body) {
    try {
        /*
         * In the final client integration,
         * companyId should preferably come
         * from authenticated company credentials,
         * not blindly from body.
         *
         * For this phase we accept it in body.
         */
        const result =await service.createRequest({
                companyId:body.companyId,
                externalUserId:body.externalUserId,
                clientReference:body.clientReference,
                metadata:body.metadata
            });

        return success(res,result,201);

    } catch (err) {
        console.error("[KYC REQUEST ERROR]",err);
        return error(
            res,
            err.statusCode || 500,
            err.code ||
                "KYC_REQUEST_FAILED",
            err.message ||
                "Unable to create KYC request"
        );
    }
}


async function getSession(req, res, sessionId) {
    try {
        const result = await service.getSession(sessionId);
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const auth = require("../../middleware/auth.middleware").requireAgent(req);
            if (String(result.company_id) !== String(auth.companyId)) {
                return error(res, 403, "COMPANY_ACCESS_DENIED", "Company access denied");
            }
            return success(res, result);
        }
        const companyId = new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("companyId");
        const externalUserId = new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("externalUserId");
        if (!companyId || !externalUserId || String(result.company_id) !== String(companyId) || String(result.external_user_id) !== String(externalUserId)) {
            return error(res, 403, "KYC_SESSION_ACCESS_DENIED", "KYC session access denied");
        }
        return success(res, {
            sessionId: result.id, sessionCode: result.session_code, status: result.status,
            agentId: result.assigned_agent_id, queuePosition: null, finalActionCode: result.final_action_code, endedReason: result.ended_reason
        });
    } catch (err) {
        return error(res, err.statusCode || 500, err.code || "KYC_SESSION_FAILED", err.message);
    }
}

async function cancelSession(req, res, sessionId, body = {}) {
    try {
        const result = await service.cancelSession(sessionId, body.companyId, body.wsToken);
        return success(res,result);

    } catch (err) {
        return error(
            res,
            err.statusCode || 500,
            err.code ||
                "KYC_CANCEL_FAILED",
            err.message
        );
    }
}

async function completeSession(
    req,
    res,
    body
) {
    try {
        /*
         * In production these values should
         * come from authenticated agent token.
         */
        const result =
            await sessionService.completeSession({
                sessionId:body.sessionId,
                companyId:body.companyId,
                agentId:body.agentId,
                actionCode:body.actionCode,
                remarks:body.remarks
            });
        return success(res,result);
    } catch (error) {
        console.error("[KYC COMPLETE]",error);
        return error(
            res,
            error.statusCode || 500,
            error.code ||
                "KYC_COMPLETE_FAILED",
            error.message
        );
    }
}

async function getActions(
    req,
    res,
    auth
) {
    try {
        const actions =
            await actionService
                .getActionsForAgent(
                    auth.companyId
                );

        return success(
            res,
            {
                actions
            }
        );
    } catch (error) {
        console.error("[KYC ACTIONS]",error);
        return error(
            res,
            500,
            "KYC_ACTIONS_FAILED",
            "Unable to load KYC actions"
        );
    }
}

async function executeAction(
    req,
    res,
    auth,
    body
) {

    try {

        const result =
            await actionService1
                .executeAction({

                    sessionId:
                        req.params.sessionId,

                    companyId:
                        auth.companyId,

                    agentId:
                        auth.agentId,

                    actionCode:
                        body.actionCode,

                    remarks:
                        body.remarks,

                    metadata:
                        body.metadata
                });


        return success(
            res,
            result
        );

    } catch (error) {

        console.error(
            "[KYC ACTION]",
            error
        );


        return error(
            res,
            error.statusCode || 500,
            error.code ||
                "KYC_ACTION_FAILED",
            error.message
        );
    }
}

module.exports = {
    createRequest,
    getSession,
    cancelSession,
    completeSession,
    getActions,
    executeAction
};

async function renewUserWsToken(req, res, sessionId, body) {
    try {
        const result = await service.renewUserWsToken({ sessionId, token: body.wsToken });
        return success(res, result);
    } catch (err) {
        return error(res, err.statusCode || 500, err.code || "WS_TOKEN_REFRESH_FAILED", err.message);
    }
}
module.exports.renewUserWsToken = renewUserWsToken;
