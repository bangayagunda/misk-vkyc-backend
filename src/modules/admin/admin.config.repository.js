
/*
 * =========================================
 * admin.config.repository.js
 * =========================================
 *
 * ADMIN COMPANY CONFIGURATION
 *
 * Scope:
 *
 * 1. Company Create
 * 2. Company List
 * 3. Company Active / Inactive
 * 4. Company Configuration
 * 5. Audit List
 * 6. Company-wise Audit
 *
 * IMPORTANT:
 * Existing project naming/schema must remain unchanged.
 */

const {
    getPool,
    sql
} = require("../../database/mssql");


/*
 * =========================================
 * CONSTANTS
 * =========================================
 */

const COMPANY_STATUS = Object.freeze({
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
    SUSPENDED: "SUSPENDED"
});


const ENDPOINT_TYPES = Object.freeze([
    "CUSTOMER_DETAILS",
    "AADHAAR_FRONT",
    "AADHAAR_BACK",
    "AADHAAR",
    "PAN"
]);


/*
 * =========================================
 * COMPANY
 * =========================================
 */


/*
 * CREATE COMPANY
 */

async function createCompany({
    companyName,
    companyCode,
    status = COMPANY_STATUS.ACTIVE,
    callbackUrl = null
}) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyName",
        sql.NVarChar(200),
        companyName
    );

    request.input(
        "companyCode",
        sql.VarChar(100),
        companyCode
    );

    request.input(
        "status",
        sql.VarChar(20),
        status
    );

    request.input(
        "callbackUrl",
        sql.NVarChar(2000),
        callbackUrl
    );


    const result =
        await request.query(`
            INSERT INTO companies
            (
                company_name,
                company_code,
                status
            )
            OUTPUT
                INSERTED.id,
                INSERTED.company_name,
                INSERTED.company_code,
                INSERTED.status,
                INSERTED.created_at,
                INSERTED.updated_at
            VALUES
            (
                @companyName,
                @companyCode,
                @status
            );
        `);


    const company =
        result.recordset[0];


    /*
     * Callback configuration
     *
     * callbackUrl optional hai.
     * Agar diya gaya hai to webhook_configs
     * mein create hoga.
     */

    if (
        callbackUrl &&
        company &&
        company.id
    ) {

        const callbackRequest =
            pool.request();

        callbackRequest.input(
            "companyId",
            sql.UniqueIdentifier,
            company.id
        );

        callbackRequest.input(
            "callbackUrl",
            sql.NVarChar(2000),
            callbackUrl
        );

        await callbackRequest.query(`
            INSERT INTO webhook_configs
            (
                company_id,
                callback_url,
                enabled
            )
            VALUES
            (
                @companyId,
                @callbackUrl,
                1
            );
        `);
    }


    return company;
}


/*
 * =========================================
 * GET COMPANY LIST
 * =========================================
 */

async function getCompanies({
    page = 1,
    limit = 50,
    status = null,
    search = null
} = {}) {

    page =
        Math.max(
            1,
            Number(page) || 1
        );

    limit =
        Math.min(
            100,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

    const offset =
        (page - 1) * limit;


    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "offset",
        sql.Int,
        offset
    );

    request.input(
        "limit",
        sql.Int,
        limit
    );

    request.input(
        "status",
        sql.VarChar(20),
        status
    );

    request.input(
        "search",
        sql.NVarChar(200),
        search
            ? `%${search}%`
            : null
    );


    const result =
        await request.query(`
            SELECT
                id,
                company_name,
                company_code,
                status,
                created_at,
                updated_at
            FROM companies
            WHERE
                (
                    @status IS NULL
                    OR status = @status
                )
                AND
                (
                    @search IS NULL
                    OR company_name LIKE @search
                    OR company_code LIKE @search
                )
            ORDER BY
                created_at DESC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY;


            SELECT
                COUNT_BIG(*) AS total
            FROM companies
            WHERE
                (
                    @status IS NULL
                    OR status = @status
                )
                AND
                (
                    @search IS NULL
                    OR company_name LIKE @search
                    OR company_code LIKE @search
                );
        `);


    return {
        items:
            result.recordsets[0] || [],

        total:
            Number(
                result.recordsets[1]?.[0]?.total || 0
            ),

        page,

        limit
    };
}


/*
 * =========================================
 * GET COMPANY
 * =========================================
 */

async function getCompany(
    companyId
) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );


    const result =
        await request.query(`
            SELECT
                id,
                company_name,
                company_code,
                status,
                created_at,
                updated_at
            FROM companies
            WHERE
                id = @companyId;
        `);


    return result.recordset[0] || null;
}


/*
 * =========================================
 * UPDATE COMPANY STATUS
 * =========================================
 */

async function updateCompanyStatus({
    companyId,
    status
}) {

    if (
        !Object.values(
            COMPANY_STATUS
        ).includes(status)
    ) {

        throw new Error(
            `Invalid company status: ${status}`
        );
    }


    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "status",
        sql.VarChar(20),
        status
    );


    const result =
        await request.query(`
            UPDATE companies
            SET
                status = @status,
                updated_at = SYSUTCDATETIME()
            WHERE
                id = @companyId;


            SELECT
                id,
                company_name,
                company_code,
                status,
                created_at,
                updated_at
            FROM companies
            WHERE
                id = @companyId;
        `);


    return result.recordset[0] || null;
}


/*
 * =========================================
 * INTEGRATION
 * =========================================
 */


/*
 * GET COMPANY KYC INTEGRATION
 */

async function getCompanyIntegration(
    companyId
) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );


    const result =
        await request.query(`
            SELECT TOP 1
                id,
                company_id,
                integration_name,
                integration_code,
                status,
                base_url,
                auth_type,
                timeout_ms,
                retry_enabled,
                max_retry_attempts,
                created_at,
                updated_at
            FROM integrations
            WHERE
                company_id = @companyId
                AND integration_code = 'KYC_PROVIDER';
        `);


    return result.recordset[0] || null;
}


/*
 * =========================================
 * GET COMPANY CONFIGURATION
 * =========================================
 */

async function getCompanyConfiguration(
    companyId
) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );


    const result =
        await request.query(`
            SELECT TOP 1
                id,
                company_id,
                integration_name,
                integration_code,
                status,
                base_url,
                auth_type,
                timeout_ms,
                retry_enabled,
                max_retry_attempts
            FROM integrations
            WHERE
                company_id = @companyId
                AND integration_code = 'KYC_PROVIDER';


            SELECT
                ie.id,
                ie.integration_id,
                ie.endpoint_code,
                ie.endpoint_name,
                ie.endpoint_type,
                ie.http_method,
                ie.endpoint_url,
                ie.enabled,
                ie.timeout_ms,
                ie.retry_enabled,
                ie.created_at,
                ie.updated_at
            FROM integration_endpoints ie
            INNER JOIN integrations i
                ON i.id = ie.integration_id
            WHERE
                i.company_id = @companyId
                AND i.integration_code = 'KYC_PROVIDER'
            ORDER BY
                ie.endpoint_type;


            SELECT TOP 1
                id,
                company_id,
                callback_url,
                enabled,
                timeout_ms,
                enabled,
                max_retry_attempts,
                created_at,
                updated_at
            FROM webhook_configs
            WHERE
                company_id = @companyId
            ORDER BY
                created_at DESC;
        `);


    return {

        integration:
            result.recordsets[0]?.[0] || null,

        endpoints:
            result.recordsets[1] || [],

        callback:
            result.recordsets[2]?.[0] || null
    };
}


/*
 * =========================================
 * UPSERT INTEGRATION
 * =========================================
 */

async function upsertCompanyIntegration({
    companyId,
    integrationName = "KYC Provider",
    integrationCode = "KYC_PROVIDER",
    status = "ACTIVE",
    baseUrl = null,
    authType = "NONE",
    authConfigEncrypted = null,
    timeoutMs = 10000,
    retryEnabled = true,
    maxRetryAttempts = 3
}) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "integrationName",
        sql.NVarChar(200),
        integrationName
    );

    request.input(
        "integrationCode",
        sql.VarChar(100),
        integrationCode
    );

    request.input(
        "status",
        sql.VarChar(20),
        status
    );

    request.input(
        "baseUrl",
        sql.NVarChar(2000),
        baseUrl
    );

    request.input(
        "authType",
        sql.VarChar(50),
        authType
    );

    request.input(
        "authConfigEncrypted",
        sql.NVarChar(sql.MAX),
        authConfigEncrypted
    );

    request.input(
        "timeoutMs",
        sql.Int,
        timeoutMs
    );

    request.input(
        "retryEnabled",
        sql.Bit,
        retryEnabled
    );

    request.input(
        "maxRetryAttempts",
        sql.Int,
        maxRetryAttempts
    );


    const result =
        await request.query(`
            UPDATE integrations
            SET
                integration_name =
                    @integrationName,

                status =
                    @status,

                base_url =
                    @baseUrl,

                auth_type =
                    @authType,

                auth_config_encrypted =
                    @authConfigEncrypted,

                timeout_ms =
                    @timeoutMs,

                retry_enabled =
                    @retryEnabled,

                max_retry_attempts =
                    @maxRetryAttempts,

                updated_at =
                    SYSUTCDATETIME()

            WHERE
                company_id =
                    @companyId

                AND integration_code =
                    @integrationCode;


            IF @@ROWCOUNT = 0
            BEGIN

                INSERT INTO integrations
                (
                    company_id,
                    integration_name,
                    integration_code,
                    status,
                    base_url,
                    auth_type,
                    auth_config_encrypted,
                    timeout_ms,
                    retry_enabled,
                    max_retry_attempts
                )
                VALUES
                (
                    @companyId,
                    @integrationName,
                    @integrationCode,
                    @status,
                    @baseUrl,
                    @authType,
                    @authConfigEncrypted,
                    @timeoutMs,
                    @retryEnabled,
                    @maxRetryAttempts
                );

            END;


            SELECT TOP 1
                id,
                company_id,
                integration_name,
                integration_code,
                status,
                base_url,
                auth_type,
                timeout_ms,
                retry_enabled,
                max_retry_attempts,
                created_at,
                updated_at
            FROM integrations
            WHERE
                company_id = @companyId
                AND integration_code = @integrationCode;
        `);


    return result.recordset[0] || null;
}


/*
 * =========================================
 * UPSERT DOCUMENT ENDPOINT
 * =========================================
 */

async function upsertDocumentEndpoint({
    integrationId,
    endpointCode,
    endpointName,
    endpointType,
    httpMethod = "POST",
    endpointUrl,
    requestHeadersEncrypted = null,
    requestTemplate = null,
    responseMapping = null,
    enabled = true,
    timeoutMs = 10000,
    retryEnabled = true
}) {

    if (
        !ENDPOINT_TYPES.includes(
            endpointType
        )
    ) {

        throw new Error(
            `Invalid endpoint type: ${endpointType}`
        );
    }


    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "integrationId",
        sql.UniqueIdentifier,
        integrationId
    );

    request.input(
        "endpointCode",
        sql.VarChar(100),
        endpointCode
    );

    request.input(
        "endpointName",
        sql.NVarChar(200),
        endpointName
    );

    request.input(
        "endpointType",
        sql.VarChar(50),
        endpointType
    );

    request.input(
        "httpMethod",
        sql.VarChar(10),
        httpMethod
    );

    request.input(
        "endpointUrl",
        sql.NVarChar(2000),
        endpointUrl
    );

    request.input(
        "requestHeadersEncrypted",
        sql.NVarChar(sql.MAX),
        requestHeadersEncrypted
    );

    request.input(
        "requestTemplate",
        sql.NVarChar(sql.MAX),
        requestTemplate
    );

    request.input(
        "responseMapping",
        sql.NVarChar(sql.MAX),
        responseMapping
    );

    request.input(
        "enabled",
        sql.Bit,
        enabled
    );

    request.input(
        "timeoutMs",
        sql.Int,
        timeoutMs
    );

    request.input(
        "retryEnabled",
        sql.Bit,
        retryEnabled
    );


    const result =
        await request.query(`
            UPDATE integration_endpoints
            SET
                endpoint_name =
                    @endpointName,

                endpoint_type =
                    @endpointType,

                http_method =
                    @httpMethod,

                endpoint_url =
                    @endpointUrl,

                request_headers_encrypted =
                    @requestHeadersEncrypted,

                request_template =
                    @requestTemplate,

                response_mapping =
                    @responseMapping,

                enabled =
                    @enabled,

                timeout_ms =
                    @timeoutMs,

                retry_enabled =
                    @retryEnabled,

                updated_at =
                    SYSUTCDATETIME()

            WHERE
                integration_id =
                    @integrationId

                AND endpoint_code =
                    @endpointCode;


            IF @@ROWCOUNT = 0
            BEGIN

                INSERT INTO integration_endpoints
                (
                    integration_id,
                    endpoint_code,
                    endpoint_name,
                    endpoint_type,
                    http_method,
                    endpoint_url,
                    request_headers_encrypted,
                    request_template,
                    response_mapping,
                    enabled,
                    timeout_ms,
                    retry_enabled
                )
                VALUES
                (
                    @integrationId,
                    @endpointCode,
                    @endpointName,
                    @endpointType,
                    @httpMethod,
                    @endpointUrl,
                    @requestHeadersEncrypted,
                    @requestTemplate,
                    @responseMapping,
                    @enabled,
                    @timeoutMs,
                    @retryEnabled
                );
            END;


            SELECT TOP 1
                id,
                integration_id,
                endpoint_code,
                endpoint_name,
                endpoint_type,
                http_method,
                endpoint_url,
                enabled,
                timeout_ms,
                retry_enabled,
                created_at,
                updated_at
            FROM integration_endpoints
            WHERE
                integration_id =
                    @integrationId

                AND endpoint_code =
                    @endpointCode;
        `);


    return result.recordset[0] || null;
}


/*
 * =========================================
 * CALLBACK CONFIGURATION
 * =========================================
 */

async function upsertCallback({
    companyId,
    webhookName = "KYC Callback",
    callbackUrl,
    enabled = true,
    timeoutMs = 10000,
    retryEnabled = true,
    maxRetryAttempts = 5
}) {

    const pool =
        await getPool();

    const request =
        pool.request();


    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "webhookName",
        sql.NVarChar(200),
        webhookName || "KYC Callback"
    );

    request.input(
        "callbackUrl",
        sql.NVarChar(2000),
        callbackUrl
    );

    request.input(
        "enabled",
        sql.Bit,
        enabled
    );

    request.input(
        "timeoutMs",
        sql.Int,
        timeoutMs
    );

    request.input(
        "retryEnabled",
        sql.Bit,
        retryEnabled
    );

    request.input(
        "maxRetryAttempts",
        sql.Int,
        maxRetryAttempts
    );


    const result =
        await request.query(`

            UPDATE webhook_configs

            SET
                webhook_name =
                    @webhookName,

                callback_url =
                    @callbackUrl,

                enabled =
                    @enabled,

                timeout_ms =
                    @timeoutMs,                

                max_retry_attempts =
                    @maxRetryAttempts,

                updated_at =
                    SYSUTCDATETIME()

            WHERE
                company_id =
                    @companyId;


            IF @@ROWCOUNT = 0
            BEGIN

                INSERT INTO webhook_configs
                (
                    company_id,
                    webhook_name,
                    callback_url,
                    enabled,
                    timeout_ms,
                    max_retry_attempts
                )

                VALUES
                (
                    @companyId,
                    @webhookName,
                    @callbackUrl,
                    @enabled,
                    @timeoutMs,
                    @maxRetryAttempts
                );

            END;


            SELECT TOP 1
                id,
                company_id,
                webhook_name,
                callback_url,
                enabled,
                timeout_ms,
                max_retry_attempts,
                created_at,
                updated_at

            FROM webhook_configs

            WHERE
                company_id =
                    @companyId

            ORDER BY
                updated_at DESC;

        `);


    return result.recordset[0] || null;
}


async function upsertCallbackOld({
    companyId,
    webhookName = "KYC Callback",
    callbackUrl,
    enabled = true,
    timeoutMs = 10000,
    retryEnabled = true,
    maxRetryAttempts = 5
}) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "webhookName",
        sql.NVarChar(200),
        webhookName
    );

    request.input(
        "callbackUrl",
        sql.NVarChar(2000),
        callbackUrl
    );

    request.input(
        "enabled",
        sql.Bit,
        enabled
    );

    request.input(
        "timeoutMs",
        sql.Int,
        timeoutMs
    );

    request.input(
        "retryEnabled",
        sql.Bit,
        retryEnabled
    );

    request.input(
        "maxRetryAttempts",
        sql.Int,
        maxRetryAttempts
    );


    const result =
        await request.query(`
            UPDATE webhook_configs
            SET
                webhook_name =
                    @webhookName,

                callback_url =
                    @callbackUrl,

                enabled =
                    @enabled,

                timeout_ms =
                    @timeoutMs,

                max_retry_attempts =
                    @maxRetryAttempts,

                updated_at =
                    SYSUTCDATETIME()

            WHERE
                company_id =
                    @companyId;


            IF @@ROWCOUNT = 0
            BEGIN

                INSERT INTO webhook_configs
                (
                    company_id,
                    webhook_name,
                    callback_url,
                    enabled,
                    timeout_ms,                    
                    max_retry_attempts
                )
                VALUES
                (
                    @companyId,
                    @webhookName,
                    @callbackUrl,
                    @enabled,
                    @timeoutMs,                    
                    @maxRetryAttempts
                );

            END;


            SELECT TOP 1
                id,
                company_id,
                webhook_name
                callback_url,
                enabled,
                timeout_ms,
                max_retry_attempts,
                created_at,
                updated_at
            FROM webhook_configs
            WHERE
                company_id =
                    @companyId;
        `);

//retry_enabled =@retryEnabled,
    return result.recordset[0] || null;
}


/*
 * =========================================
 * AUDIT
 * =========================================
 */


/*
 * ALL ADMIN AUDIT
 */

async function getAuditLogs({
    page = 1,
    limit = 50,
    companyId = null
} = {}) {

    page =
        Math.max(
            1,
            Number(page) || 1
        );

    limit =
        Math.min(
            100,
            Math.max(
                1,
                Number(limit) || 50
            )
        );

    const offset =
        (page - 1) * limit;


    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "offset",
        sql.Int,
        offset
    );

    request.input(
        "limit",
        sql.Int,
        limit
    );


    const result =
        await request.query(`
            SELECT
                a.id,
                a.company_id,
                c.company_name,
                a.actor_type,
                a.actor_user_id,
                a.action,
                a.entity_type,
                a.entity_id,
                a.details_json,
                a.ip_address,
                a.user_agent,
                a.created_at
            FROM audit_logs a
            LEFT JOIN companies c
                ON c.id = a.company_id
            WHERE
                (
                    @companyId IS NULL
                    OR a.company_id = @companyId
                )
            ORDER BY
                a.created_at DESC
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY;


            SELECT
                COUNT_BIG(*) AS total
            FROM audit_logs
            WHERE
                (
                    @companyId IS NULL
                    OR company_id = @companyId
                );
        `);


    return {
        items:
            result.recordsets[0] || [],

        total:
            Number(
                result.recordsets[1]?.[0]?.total || 0
            ),

        page,

        limit
    };
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

    return getAuditLogs({
        companyId,
        page,
        limit
    });
}


/*
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports = {

    COMPANY_STATUS,

    ENDPOINT_TYPES,

    createCompany,

    getCompanies,

    getCompany,

    updateCompanyStatus,

    getCompanyIntegration,

    getCompanyConfiguration,

    upsertCompanyIntegration,

    upsertDocumentEndpoint,

    upsertCallback,

    getAuditLogs,

    getCompanyAuditLogs
};

