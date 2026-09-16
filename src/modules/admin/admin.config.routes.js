/*
 * =========================================
 * admin.config.routes.js
 * =========================================
 *
 * ADMIN CONFIGURATION ROUTE DISPATCHER
 *
 * IMPORTANT:
 * - Express Router use nahi karna.
 * - Existing custom route dispatcher ke saath compatible.
 * - server.js already:
 *
 *   handleAdminConfigRoutes(
 *       req,
 *       res,
 *       pathname,
 *       body
 *   )
 *
 * - Unknown route ke liye false return karega.
 * - Handled route ke liye true return karega.
 */

const controller =require("./admin.config.controller");

/*
 * =========================================
 * HELPERS
 * =========================================
 */

function getCompanyId(
    pathname,
    pattern) {
    const match = pathname.match(pattern );
    if (!match || !match[1]) {
        return null;
    }
    return decodeURIComponent(match[1]);
}

function getRequestBody(req,body) {
    if (body !== undefined &&
        body !== null) {
        return body;
    }

    if (req.body !== undefined && req.body !== null) {
        return req.body;
    }
    return {};
}

function attachBody(req,body) {
    const requestBody =getRequestBody(
            req,
            body
        );

    /*
     * server.js already parseBody()
     * karke body pass karta hai.
     *
     * Existing controller req.body use karta hai,
     * isliye yahan attach kar rahe hain.
     */

    req.body =requestBody;
    return requestBody;
}


function attachQuery(req,pathname) {

    /*
     * server.js pathname URL.pathname hai,
     * isliye normally query already remove hoti hai.
     *
     * Lekin agar kisi caller ne full pathname diya,
     * to fallback parsing rakhenge.
     */

    if (req.query && typeof req.query === "object") {
        return req.query;
    }

    const query = {};
    const queryString =String(pathname || "").split("?")[1];
    if (!queryString) {
        req.query =query;
        return query;
    }


    for (const part of queryString.split("&")) {
        if (!part) {
            continue;
        }
        const separator = part.indexOf("=");
        const rawKey =separator >= 0
                ? part.slice(
                    0,
                    separator
                )
                : part;

        const rawValue =separator >= 0
                ? part.slice(
                    separator + 1
                )
                : "";

        const key =decodeURIComponent(
                rawKey
            );

        const value = decodeURIComponent(
                rawValue.replace(
                    /\+/g,
                    " "
                )
            );

        query[key] =value;
    }

    req.query =query;
    return query;
}


function attachParams(req) {
    if (!req.params || typeof req.params !== "object") {
        req.params = {};
    }
    return req.params;
}

function normalizePathname( pathname) {
    if (typeof pathname !== "string") {
        return "";
    }
    let normalized =pathname.split("?")[0];

    /*
     * Remove trailing slash.
     *
     * /companies/
     * becomes
     * /companies
     */

    if (normalized.length > 1 &&
        normalized.endsWith("/")) {
        normalized =normalized.slice(0,-1);
    }

    return normalized;
}


/*
 * =========================================
 * MAIN ROUTE HANDLER
 * =========================================
 */

async function handleAdminConfigRoutes(
    req,
    res,
    pathname,
    body
) {
    const method =String(req.method || "").toUpperCase();
    const normalizedPathname =normalizePathname(
            pathname
        );

    /*
     * Existing custom server context.
     */

    attachBody(
        req,
        body
    );


    attachQuery(
        req,
        pathname
    );


    attachParams(
        req
    );


    /*
     * =========================================
     * COMPANY CREATE
     * =========================================
     *
     * POST
     * /api/v1/admin/companies
     */

    if (
        method === "POST" &&
        normalizedPathname ===
            "/api/v1/admin/companies"
    ) {

        await controller.createCompany(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY LIST
     * =========================================
     *
     * GET
     * /api/v1/admin/companies
     *
     * Query:
     *
     * ?page=1
     * ?limit=50
     * ?status=ACTIVE
     * ?search=ABC
     */

    if (
        method === "GET" &&
        normalizedPathname ===
            "/api/v1/admin/companies"
    ) {

        await controller.getCompanies(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY STATUS
     * =========================================
     *
     * PATCH
     * /api/v1/admin/companies/:companyId/status
     */

    const companyStatusPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)\/status$/
        );


    if (
        method === "PATCH" &&
        companyStatusPath
    ) {

        req.params.companyId =
            companyStatusPath;


        await controller.updateCompanyStatus(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY CONFIGURATION - GET
     * =========================================
     *
     * GET
     * /api/v1/admin/companies/:companyId/config
     */

    const companyConfigPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)\/config$/
        );


    if (
        method === "GET" &&
        companyConfigPath
    ) {

        req.params.companyId =
            companyConfigPath;


        await controller.getCompanyConfiguration(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY CONFIGURATION - SAVE
     * =========================================
     *
     * PUT
     * /api/v1/admin/companies/:companyId/config
     */

    if (
        method === "PUT" &&
        companyConfigPath
    ) {

        req.params.companyId =
            companyConfigPath;


        await controller.saveCompanyConfiguration(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * CALLBACK CONFIGURATION
     * =========================================
     *
     * PUT
     * /api/v1/admin/companies/:companyId/config/callback
     */

    const callbackConfigPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)\/config\/callback$/
        );


    if (
        method === "PUT" &&
        callbackConfigPath
    ) {

        req.params.companyId =
            callbackConfigPath;


        await controller.saveCallback(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * DOCUMENT ENDPOINT CONFIGURATION
     * =========================================
     *
     * PUT
     * /api/v1/admin/companies/:companyId/config/document
     *
     * Supports:
     *
     * CUSTOMER_DETAILS
     * AADHAAR
     * AADHAAR_FRONT
     * AADHAAR_BACK
     * PAN
     */

    const documentConfigPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)\/config\/document$/
        );


    if (
        method === "PUT" &&
        documentConfigPath
    ) {

        req.params.companyId =
            documentConfigPath;


        await controller.saveDocumentEndpoint(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY DETAILS
     * =========================================
     *
     * GET
     * /api/v1/admin/companies/:companyId
     *
     * IMPORTANT:
     * Isko generic company route hone ki wajah se
     * config/status/audit ke baad check karna hai.
     */

    const companyDetailsPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)$/
        );


    if (
        method === "GET" &&
        companyDetailsPath
    ) {

        req.params.companyId =
            companyDetailsPath;


        await controller.getCompany(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * COMPANY-WISE AUDIT
     * =========================================
     *
     * GET
     * /api/v1/admin/companies/:companyId/audit
     *
     * Query:
     *
     * ?page=1
     * ?limit=50
     */

    const companyAuditPath =
        getCompanyId(
            normalizedPathname,
            /^\/api\/v1\/admin\/companies\/([^/]+)\/audit$/
        );


    if (
        method === "GET" &&
        companyAuditPath
    ) {

        req.params.companyId =
            companyAuditPath;


        await controller.getCompanyAuditLogs(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * ALL AUDIT
     * =========================================
     *
     * GET
     * /api/v1/admin/audit
     *
     * Optional:
     *
     * ?page=1
     * ?limit=50
     * ?companyId=<uuid>
     */

    if (
        method === "GET" &&
        normalizedPathname ===
            "/api/v1/admin/audit"
    ) {

        await controller.getAuditLogs(
            req,
            res
        );


        return true;
    }


    /*
     * =========================================
     * UNKNOWN ADMIN CONFIG ROUTE
     * =========================================
     */

    return false;
}


/*
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports = {

    handleAdminConfigRoutes
};

