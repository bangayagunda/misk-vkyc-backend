/*
 * =========================================
 * admin.config.service.js
 * =========================================
 *
 * ADMIN COMPANY CONFIGURATION SERVICE
 *
 * Scope:
 *  - Company Create
 *  - Company List
 *  - Company Status
 *  - Company Configuration
 *  - Callback Configuration
 *  - Integration Endpoints
 *  - Audit
 *
 * IMPORTANT:
 * Existing architecture and naming preserved.
 */

const repository =
    require("./admin.config.repository");


/*
 * =========================================
 * HELPERS
 * =========================================
 */

function createServiceError(
    statusCode,
    code,
    message
) {

    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    error.code =
        code;

    return error;
}


function required(
    value,
    field
) {

    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {

        throw createServiceError(
            400,
            "VALIDATION_ERROR",
            `${field} is required`
        );
    }

    return String(value).trim();
}


function normalizeUrl(
    value,
    field
) {

    const url =
        required(
            value,
            field
        );

    let parsed;

    try {
        parsed =
            new URL(url);
    } catch (_) {

        throw createServiceError(
            400,
            "INVALID_URL",
            `${field} must be a valid URL`
        );
    }


    if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
    ) {

        throw createServiceError(
            400,
            "INVALID_URL",
            `${field} must use HTTP or HTTPS`
        );
    }

    return url;
}


function normalizePage(
    page
) {

    const value =
        Number(page);

    if (
        !Number.isFinite(value) ||
        value < 1
    ) {
        return 1;
    }

    return Math.floor(value);
}


function normalizeLimit(
    limit
) {

    const value =
        Number(limit);

    if (
        !Number.isFinite(value) ||
        value < 1
    ) {
        return 50;
    }

    return Math.min(
        100,
        Math.floor(value)
    );
}


function normalizeCompanyStatus(
    status
) {

    const value =
        String(
            status || ""
        )
            .trim()
            .toUpperCase();


    if (
        value !==
            repository.COMPANY_STATUS.ACTIVE &&
        value !==
            repository.COMPANY_STATUS.INACTIVE &&
        value !==
            repository.COMPANY_STATUS.SUSPENDED
    ) {

        throw createServiceError(
            400,
            "INVALID_COMPANY_STATUS",
            "Company status must be ACTIVE, INACTIVE or SUSPENDED"
        );
    }

    return value;
}


/*
 * =========================================
 * COMPANY CREATE
 * =========================================
 */

async function createCompany({
    companyName,
    companyCode,
    status,
    callbackUrl
}) {

    const name =
        required(
            companyName,
            "companyName"
        );

    const code =
        required(
            companyCode,
            "companyCode"
        )
            .toUpperCase();


    if (name.length > 200) {

        throw createServiceError(
            400,
            "INVALID_COMPANY_NAME",
            "Company name cannot exceed 200 characters"
        );
    }


    if (code.length > 50) {

        throw createServiceError(
            400,
            "INVALID_COMPANY_CODE",
            "Company code cannot exceed 50 characters"
        );
    }


    const normalizedStatus =
        status
            ? normalizeCompanyStatus(status)
            : repository.COMPANY_STATUS.ACTIVE;


    let normalizedCallbackUrl =
        null;


    if (callbackUrl) {

        normalizedCallbackUrl =
            normalizeUrl(
                callbackUrl,
                "callbackUrl"
            );
    }


    /*
     * Prevent duplicate company code.
     */

    const companies =
        await repository.getCompanies({
            page: 1,
            limit: 1,
            search: code
        });


    const duplicate =
        companies.items.find(
            item =>
                String(
                    item.company_code
                ).toUpperCase() === code
        );


    if (duplicate) {

        throw createServiceError(
            409,
            "COMPANY_CODE_EXISTS",
            "Company code already exists"
        );
    }


    try {

        const company =
            await repository.createCompany({
                companyName: name,
                companyCode: code,
                status:
                    normalizedStatus,
                callbackUrl:
                    normalizedCallbackUrl
            });


        return {
            company
        };

    } catch (error) {

        /*
         * MSSQL unique constraint fallback.
         */

        if (
            error.number === 2627 ||
            error.number === 2601
        ) {

            throw createServiceError(
                409,
                "COMPANY_CODE_EXISTS",
                "Company code already exists"
            );
        }

        throw error;
    }
}


/*
 * =========================================
 * COMPANY LIST
 * =========================================
 */

async function getCompanies({
    page = 1,
    limit = 50,
    status = null,
    search = null
} = {}) {

    const normalizedPage =
        normalizePage(page);

    const normalizedLimit =
        normalizeLimit(limit);


    let normalizedStatus =
        null;

    if (status) {

        normalizedStatus =
            normalizeCompanyStatus(
                status
            );
    }


    let normalizedSearch =
        null;

    if (
        search !== undefined &&
        search !== null
    ) {

        normalizedSearch =
            String(search).trim();

        if (
            normalizedSearch.length === 0
        ) {
            normalizedSearch = null;
        }
    }


    return repository.getCompanies({
        page:
            normalizedPage,

        limit:
            normalizedLimit,

        status:
            normalizedStatus,

        search:
            normalizedSearch
    });
}


/*
 * =========================================
 * COMPANY DETAILS
 * =========================================
 */

async function getCompany(
    companyId
) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    return {
        company
    };
}


/*
 * =========================================
 * COMPANY ACTIVE / INACTIVE
 * =========================================
 */

async function updateCompanyStatus({
    companyId,
    status
}) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const normalizedStatus =
        normalizeCompanyStatus(
            status
        );


    const existing =
        await repository.getCompany(
            id
        );


    if (!existing) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    /*
     * Same status = idempotent operation.
     */

    if (
        existing.status ===
        normalizedStatus
    ) {

        return {
            company:
                existing
        };
    }


    const company =
        await repository.updateCompanyStatus({
            companyId:
                id,

            status:
                normalizedStatus
        });


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    return {
        company
    };
}


/*
 * =========================================
 * GET CONFIGURATION
 * =========================================
 */

async function getCompanyConfiguration(
    companyId
) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    const configuration =
        await repository.getCompanyConfiguration(
            id
        );


    /*
     * Convert DB rows into the structure
     * required by Admin UI.
     */

    const endpoints =
        configuration.endpoints || [];


    const findEndpoint =
        type =>
            endpoints.find(
                endpoint =>
                    endpoint.endpoint_type === type
            ) || null;


    const callback =
        configuration.callback;


    return {

        company,

        integration:
            configuration.integration,

        callback: callback
            ? {
                id:
                    callback.id,

                url:
                    callback.callback_url,

                enabled:
                    Boolean(
                        callback.enabled
                    ),

                timeoutMs:
                    callback.timeout_ms,

                retryEnabled:
                    Boolean(
                        callback.retry_enabled
                    ),

                maxRetryAttempts:
                    callback.max_retry_attempts
            }
            : null,


        documents: {

            customerDetails:
                findEndpoint(
                    "CUSTOMER_DETAILS"
                ),

            aadhaar:
                findEndpoint(
                    "AADHAAR"
                ),

            aadhaarFront:
                findEndpoint(
                    "AADHAAR_FRONT"
                ),

            aadhaarBack:
                findEndpoint(
                    "AADHAAR_BACK"
                ),

            pan:
                findEndpoint(
                    "PAN"
                )
        }
    };
}


/*
 * =========================================
 * SAVE CONFIGURATION
 * =========================================
 */

async function saveCompanyConfiguration({
    companyId,

    integrationName,
    integrationCode,
    integrationStatus,

    baseUrl,
    authType,
    authConfigEncrypted,

    timeoutMs,
    retryEnabled,
    maxRetryAttempts,

    callback,

    documents
}) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    /*
     * -----------------------------------------
     * INTEGRATION
     * -----------------------------------------
     */

    const integration =
        await repository.upsertCompanyIntegration({

            companyId:
                id,

            integrationName:
                integrationName ||
                "KYC Provider",

            integrationCode:
                integrationCode ||
                "KYC_PROVIDER",

            status:
                integrationStatus ||
                "ACTIVE",

            baseUrl:
                baseUrl || null,

            authType:
                authType || "NONE",

            authConfigEncrypted:
                authConfigEncrypted || null,

            timeoutMs:
                Number(
                    timeoutMs || 10000
                ),

            retryEnabled:
                retryEnabled !== false,

            maxRetryAttempts:
                Number(
                    maxRetryAttempts || 3
                )
        });


    /*
     * -----------------------------------------
     * CALLBACK
     * -----------------------------------------
     */

    let callbackResult =
        null;


    if (callback) {

        const callbackUrl =
            normalizeUrl(
                callback.url,
                "callback.url"
            );


        callbackResult =
            await repository.upsertCallback({

                companyId:
                    id,
                webhookName: 
                callback.webhookName ||"KYC Callback",
                
                callbackUrl,

                enabled:
                    callback.enabled !== false,

                timeoutMs:
                    Number(
                        callback.timeoutMs ||
                        10000
                    ),

                retryEnabled:
                    callback.retryEnabled !== false,

                maxRetryAttempts:
                    Number(
                        callback.maxRetryAttempts ||
                        5
                    )
            });
    }


    /*
 * -----------------------------------------
 * DOCUMENT ENDPOINTS
 * -----------------------------------------
 */

// Support documents as an array from frontend
// or as an object from other clients.

const documentConfig = {};
if (Array.isArray(documents)) {
    for (const document of documents) {
        if (!document?.type) {continue;}
        const keyMap = {
            CUSTOMER_DETAILS: "customerDetails",
            AADHAAR: "aadhaar",
            AADHAAR_FRONT: "aadhaarFront",
            AADHAAR_BACK: "aadhaarBack",
            PAN: "pan",
        };
        const key = keyMap[document.type];
        if (key) {
            documentConfig[key] = document;
        }
    }
} else {
    Object.assign(
        documentConfig,
        documents || {}
    );
}

const documentDefinitions = [
    {
        key: "customerDetails",
        type: "CUSTOMER_DETAILS",
        code: "CUSTOMER_DETAILS",
        name: "Customer Details"
    },
    {
        key: "aadhaar",
        type: "AADHAAR",
        code: "AADHAAR",
        name: "Aadhaar Verification"
    },
    {
        key: "aadhaarFront",
        type: "AADHAAR_FRONT",
        code: "AADHAAR_FRONT",
        name: "Aadhaar Front"
    },
    {
        key: "aadhaarBack",
        type: "AADHAAR_BACK",
        code: "AADHAAR_BACK",
        name: "Aadhaar Back"
    },
    {
        key: "pan",
        type: "PAN",
        code: "PAN",
        name: "PAN Verification"
    }
];

const endpointResults = [];
for (const definition of documentDefinitions) {
    const config =documentConfig[definition.key];
    if (!config) {
        continue;
    }
    const url =normalizeUrl(config.url,`${definition.key}.url`);
    const endpoint =await repository.upsertDocumentEndpoint({
            integrationId:integration.id,
            endpointCode:definition.code,
            endpointName:definition.name,
            endpointType:definition.type,
            httpMethod:config.method || "POST",
            endpointUrl:url,
            requestHeadersEncrypted:config.requestHeadersEncrypted || null,
            requestTemplate:config.requestTemplate || null,
            responseMapping:config.responseMapping || null,
            enabled:config.enabled !== false,
            timeoutMs:Number(config.timeoutMs ||
                    timeoutMs ||10000),
            retryEnabled:config.retryEnabled !== false
        });
    endpointResults.push(endpoint);
}


    // const documentConfig =
    //     documents || {};


    // const documentDefinitions = [

    //     {
    //         key:
    //             "customerDetails",

    //         type:
    //             "CUSTOMER_DETAILS",

    //         code:
    //             "CUSTOMER_DETAILS",

    //         name:
    //             "Customer Details"
    //     },

    //     {
    //         key:
    //             "aadhaar",

    //         type:
    //             "AADHAAR",

    //         code:
    //             "AADHAAR",

    //         name:
    //             "Aadhaar Verification"
    //     },

    //     {
    //         key:
    //             "aadhaarFront",

    //         type:
    //             "AADHAAR_FRONT",

    //         code:
    //             "AADHAAR_FRONT",

    //         name:
    //             "Aadhaar Front"
    //     },

    //     {
    //         key:
    //             "aadhaarBack",

    //         type:
    //             "AADHAAR_BACK",

    //         code:
    //             "AADHAAR_BACK",

    //         name:
    //             "Aadhaar Back"
    //     },

    //     {
    //         key:
    //             "pan",

    //         type:
    //             "PAN",

    //         code:
    //             "PAN",

    //         name:
    //             "PAN Verification"
    //     }
    // ];


    // const endpointResults =
    //     [];


    // for (
    //     const definition
    //     of documentDefinitions
    // ) {

    //     const config =
    //         documentConfig[
    //             definition.key
    //         ];


    //     /*
    //      * Configuration is optional.
    //      * Existing endpoint remains untouched
    //      * when no value was supplied.
    //      */

    //     if (!config) {
    //         continue;
    //     }


    //     const url =
    //         normalizeUrl(
    //             config.url,
    //             `${definition.key}.url`
    //         );


    //     const endpoint =
    //         await repository.upsertDocumentEndpoint({

    //             integrationId:
    //                 integration.id,

    //             endpointCode:
    //                 definition.code,

    //             endpointName:
    //                 definition.name,

    //             endpointType:
    //                 definition.type,

    //             httpMethod:
    //                 config.method ||
    //                 "POST",

    //             endpointUrl:
    //                 url,

    //             requestHeadersEncrypted:
    //                 config.requestHeadersEncrypted ||
    //                 null,

    //             requestTemplate:
    //                 config.requestTemplate ||
    //                 null,

    //             responseMapping:
    //                 config.responseMapping ||
    //                 null,

    //             enabled:
    //                 config.enabled !== false,

    //             timeoutMs:
    //                 Number(
    //                     config.timeoutMs ||
    //                     timeoutMs ||
    //                     10000
    //                 ),

    //             retryEnabled:
    //                 config.retryEnabled !== false
    //         });


    //     endpointResults.push(
    //         endpoint
    //     );
    // }


    /*
     * Return fresh configuration.
     */

    return getCompanyConfiguration(
        id
    );
}


/*
 * =========================================
 * CALLBACK ONLY
 * =========================================
 */

async function saveCallback({
    companyId,
    url,
    enabled = true,
    timeoutMs = 10000,
    retryEnabled = true,
    maxRetryAttempts = 5
}) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    const callbackUrl =
        normalizeUrl(
            url,
            "url"
        );


    const result =
        await repository.upsertCallback({

            companyId:
                id,

            callbackUrl,

            enabled:
                enabled !== false,

            timeoutMs:
                Number(timeoutMs),

            retryEnabled:
                retryEnabled !== false,

            maxRetryAttempts:
                Number(
                    maxRetryAttempts
                )
        });


    return {
        callback:
            result
    };
}


/*
 * =========================================
 * DOCUMENT ENDPOINT ONLY
 * =========================================
 */

async function saveDocumentEndpoint({
    companyId,
    type,
    url,
    enabled = true,
    method = "POST",
    timeoutMs = 10000,
    retryEnabled = true,

    endpointCode,
    endpointName,

    requestHeadersEncrypted,
    requestTemplate,
    responseMapping
}) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const normalizedType =
        String(
            type || ""
        )
            .trim()
            .toUpperCase();


    if (
        !repository.ENDPOINT_TYPES.includes(
            normalizedType
        )
    ) {

        throw createServiceError(
            400,
            "INVALID_ENDPOINT_TYPE",
            `Invalid endpoint type: ${type}`
        );
    }


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    const integration =
        await repository.getCompanyIntegration(
            id
        );


    if (!integration) {

        throw createServiceError(
            409,
            "INTEGRATION_NOT_CONFIGURED",
            "KYC integration is not configured for this company"
        );
    }


    const normalizedUrl =
        normalizeUrl(
            url,
            "url"
        );


    const result =
        await repository.upsertDocumentEndpoint({

            integrationId:
                integration.id,

            endpointCode:
                endpointCode ||
                normalizedType,

            endpointName:
                endpointName ||
                normalizedType,

            endpointType:
                normalizedType,

            httpMethod:
                String(
                    method || "POST"
                ).toUpperCase(),

            endpointUrl:
                normalizedUrl,

            requestHeadersEncrypted:
                requestHeadersEncrypted ||
                null,

            requestTemplate:
                requestTemplate ||
                null,

            responseMapping:
                responseMapping ||
                null,

            enabled:
                enabled !== false,

            timeoutMs:
                Number(timeoutMs),

            retryEnabled:
                retryEnabled !== false
        });


    return {
        endpoint:
            result
    };
}


/*
 * =========================================
 * AUDIT
 * =========================================
 */

async function getAuditLogs({
    page = 1,
    limit = 50,
    companyId = null
} = {}) {

    let id =
        null;


    if (companyId) {

        id =
            required(
                companyId,
                "companyId"
            );


        const company =
            await repository.getCompany(
                id
            );


        if (!company) {

            throw createServiceError(
                404,
                "COMPANY_NOT_FOUND",
                "Company not found"
            );
        }
    }


    return repository.getAuditLogs({

        page:
            normalizePage(page),

        limit:
            normalizeLimit(limit),

        companyId:
            id
    });
}


/*
 * =========================================
 * COMPANY-WISE AUDIT
 * =========================================
 */

async function getCompanyAuditLogs({
    companyId,
    page = 1,
    limit = 50
}) {

    const id =
        required(
            companyId,
            "companyId"
        );


    const company =
        await repository.getCompany(
            id
        );


    if (!company) {

        throw createServiceError(
            404,
            "COMPANY_NOT_FOUND",
            "Company not found"
        );
    }


    return repository.getCompanyAuditLogs({

        companyId:
            id,

        page:
            normalizePage(page),

        limit:
            normalizeLimit(limit)
    });
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
