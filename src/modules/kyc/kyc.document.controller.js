const service = require("./kyc.document.service");
const { success, error: sendError } = require("../../core/http/response");


async function getKycData(
    req,
    res,
    auth,
    body
) {
    try {
        const result =await service.getKycData({
                companyId:auth.companyId,
                agentId:auth.agentId,
                sessionId:req.params.sessionId,
                endpointType:req.params.type
            });
        return success(res,result);
    } catch (err) {
        console.error("[KYC DOCUMENT API]", err);
        return sendError(
            res,
            err.statusCode || 500,
            err.code || "KYC_DOCUMENT_FAILED",
            err.message
        );
    }
}


module.exports = {
    getKycData
};