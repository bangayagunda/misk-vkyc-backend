/*
 * =========================================
 * admin.config.controller.js
 * =========================================
 */

const service =
    require("./admin.config.service");

const {
    success,
    error
} = require("../../core/http/response");


/*
 * =========================================
 * RESPONSE HELPERS
 * =========================================
 */

function sendSuccess(
    res,
    data,
    statusCode = 200
) {
    return success(
        res,
        data,
        statusCode
    );
}


function sendError(
    res,
    err
) {

    console.error(
        "[ADMIN CONFIG]",
        err
    );


    return error(
        res,
        err.statusCode || 500,
        err.code || "ADMIN_CONFIG_ERROR",
        err.message || "Request failed"
    );
}


/*
 * =========================================
 * COMPANY CREATE
 * =========================================
 */

async function createCompany(
    req,
    res
) {

    try {

        const result =
            await service.createCompany({

                companyName:
                    req.body.companyName,

                companyCode:
                    req.body.companyCode,

                status:
                    req.body.status,

                callbackUrl:
                    req.body.callbackUrl
            });


        return sendSuccess(
            res,
            result,
            201
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * COMPANY LIST
 * =========================================
 */

async function getCompanies(
    req,
    res
) {

    try {

        const result =
            await service.getCompanies({

                page:
                    req.query.page,

                limit:
                    req.query.limit,

                status:
                    req.query.status,

                search:
                    req.query.search
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * COMPANY DETAILS
 * =========================================
 */

async function getCompany(
    req,
    res
) {

    try {

        const result =
            await service.getCompany(
                req.params.companyId
            );


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * COMPANY STATUS
 * =========================================
 */

async function updateCompanyStatus(
    req,
    res
) {

    try {

        const result =
            await service.updateCompanyStatus({

                companyId:
                    req.params.companyId,

                status:
                    req.body.status
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * GET COMPANY CONFIGURATION
 * =========================================
 */

async function getCompanyConfiguration(
    req,
    res
) {

    try {

        const result =
            await service.getCompanyConfiguration(
                req.params.companyId
            );


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * SAVE COMPANY CONFIGURATION
 * =========================================
 */

async function saveCompanyConfiguration(
    req,
    res
) {

    try {

        const body =
            req.body || {};


        const result =
            await service.saveCompanyConfiguration({

                companyId:
                    req.params.companyId,

                integrationName:
                    body.integrationName,

                integrationCode:
                    body.integrationCode,

                integrationStatus:
                    body.integrationStatus,

                baseUrl:
                    body.baseUrl,

                authType:
                    body.authType,

                authConfigEncrypted:
                    body.authConfigEncrypted,

                timeoutMs:
                    body.timeoutMs,

                retryEnabled:
                    body.retryEnabled,

                maxRetryAttempts:
                    body.maxRetryAttempts,

                callback:
                    body.callback,

                documents:
                    body.documents
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * CALLBACK
 * =========================================
 */

async function saveCallback(
    req,
    res
) {

    try {

        const body =
            req.body || {};


        const result =
            await service.saveCallback({

                companyId:
                    req.params.companyId,

                url:
                    body.url,

                enabled:
                    body.enabled,

                timeoutMs:
                    body.timeoutMs,

                retryEnabled:
                    body.retryEnabled,

                maxRetryAttempts:
                    body.maxRetryAttempts
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * DOCUMENT ENDPOINT
 * =========================================
 */

async function saveDocumentEndpoint(
    req,
    res
) {

    try {

        const body =
            req.body || {};


        const result =
            await service.saveDocumentEndpoint({

                companyId:
                    req.params.companyId,

                type:
                    body.type,

                url:
                    body.url,

                enabled:
                    body.enabled,

                method:
                    body.method,

                timeoutMs:
                    body.timeoutMs,

                retryEnabled:
                    body.retryEnabled,

                endpointCode:
                    body.endpointCode,

                endpointName:
                    body.endpointName,

                requestHeadersEncrypted:
                    body.requestHeadersEncrypted,

                requestTemplate:
                    body.requestTemplate,

                responseMapping:
                    body.responseMapping
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * ALL AUDIT
 * =========================================
 */

async function getAuditLogs(
    req,
    res
) {

    try {

        const result =
            await service.getAuditLogs({

                page:
                    req.query.page,

                limit:
                    req.query.limit,

                companyId:
                    req.query.companyId
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * COMPANY-WISE AUDIT
 * =========================================
 */

async function getCompanyAuditLogs(
    req,
    res
) {

    try {

        const result =
            await service.getCompanyAuditLogs({

                companyId:
                    req.params.companyId,

                page:
                    req.query.page,

                limit:
                    req.query.limit
            });


        return sendSuccess(
            res,
            result
        );

    } catch (err) {

        return sendError(
            res,
            err
        );
    }
}


/*
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports = {

    createCompany,

    getCompanies,

    getCompany,

    updateCompanyStatus,

    getCompanyConfiguration,

    saveCompanyConfiguration,

    saveCallback,

    saveDocumentEndpoint,

    getAuditLogs,

    getCompanyAuditLogs
};