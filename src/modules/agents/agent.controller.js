const agentService =
    require("./agent.service");

const {
    success,
    error
} = require("../../core/http/response");

async function me(req, res) {
    try {
        const data =await agentService.getAgentProfile(req.auth.agentId);
        return success(res,data);
    } catch (err) {
        return error(res,err.statusCode || 500,err.code || "INTERNAL_ERROR",err.message);
    }
}

async function online(req, res) {
    try {
        const data =await agentService.goOnline(req.auth.agentId,req.auth.companyId);
        return success(res,data);
    } catch (err) {
        return error(res,err.statusCode || 500,err.code || "INTERNAL_ERROR",err.message);
    }
}

async function offline(req, res) {
    try {
        const data =await agentService.goOffline(
                req.auth.agentId,
                req.auth.companyId
            );

        return success(res,data);
    } catch (err) {
        return error(
            res,
            err.statusCode || 500,
            err.code || "INTERNAL_ERROR",
            err.message
        );
    }
}

async function heartbeat(req, res) {
    try {
        const data =await agentService.sendHeartbeat(
                req.auth.agentId,
                req.auth.companyId
            );

        return success(res,data);
    } catch (err) {
        return error(
            res,
            err.statusCode || 500,
            err.code || "INTERNAL_ERROR",
            err.message
        );
    }
}

async function status(req, res) {
    try {
        const data =await agentService.getStatus(
                req.auth.agentId
            );
        return success(res,data);
    } catch (err) {
        return error(
            res,
            err.statusCode || 500,
            err.code || "INTERNAL_ERROR",
            err.message
        );
    }
}

module.exports = {
    me,
    online,
    offline,
    heartbeat,
    status
};