const {
    getPool,
    sql
} = require("../../database/mssql");


const ENDPOINT_TYPES = Object.freeze([
    "CUSTOMER_DETAILS",
    "AADHAAR_FRONT",
    "AADHAAR_BACK",
    "AADHAAR",
    "PAN"
]);


/*
 * =========================================
 * GET COMPANY INTEGRATION
 * =========================================
 */

async function getIntegration(
    companyId,
    integrationCode = "KYC_PROVIDER"
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

    request.input(
        "integrationCode",
        sql.VarChar(100),
        integrationCode
    );

    const result =
        await request.query(`
            SELECT
                id,
                company_id,
                integration_name,
                integration_code,
                status,
                base_url,
                auth_type,
                auth_config_encrypted,
                timeout_ms,
                retry_enabled,
                max_retry_attempts,
                created_at,
                updated_at
            FROM integrations
            WHERE
                company_id = @companyId
                AND integration_code = @integrationCode
        `);

    return result.recordset[0] || null;
}


/*
 * =========================================
 * UPSERT INTEGRATION
 * =========================================
 */

async function upsertIntegration({
    companyId,
    integrationName,
    integrationCode,
    status,
    baseUrl,
    authType,
    authConfigEncrypted,
    timeoutMs,
    retryEnabled,
    maxRetryAttempts
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
        sql.NVarChar(150),
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
        sql.VarChar(1000),
        baseUrl || null
    );

    request.input(
        "authType",
        sql.VarChar(30),
        authType
    );

    request.input(
        "authConfigEncrypted",
        sql.NVarChar(sql.MAX),
        authConfigEncrypted || null
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
                auth_config_encrypted,
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
 * GET ENDPOINTS
 * =========================================
 */

async function getEndpoints(
    integrationId
) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "integrationId",
        sql.UniqueIdentifier,
        integrationId
    );

    const result =
        await request.query(`
            SELECT
                id,
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
                retry_enabled,
                created_at,
                updated_at
            FROM integration_endpoints
            WHERE
                integration_id =
                    @integrationId
            ORDER BY
                endpoint_type,
                endpoint_name
        `);

    return result.recordset;
}


/*
 * =========================================
 * GET ENDPOINT
 * =========================================
 */

async function getEndpoint(companyId, endpointType) {
    const pool = await getPool();
    const request = pool.request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("endpointType", sql.VarChar(100), endpointType);
    const result = await request.query(`
        SELECT TOP 1
            e.id, e.integration_id, e.endpoint_code, e.endpoint_name, e.endpoint_type,
            e.http_method, e.endpoint_url, e.request_headers_encrypted, e.request_template,
            e.response_mapping, e.enabled, e.timeout_ms, e.retry_enabled,
            i.company_id, i.integration_code, i.status AS integration_status
        FROM integration_endpoints e
        INNER JOIN integrations i ON i.id = e.integration_id
        WHERE i.company_id = @companyId
          AND i.integration_code = 'KYC_PROVIDER'
          AND i.status = 'ACTIVE'
          AND e.endpoint_type = @endpointType
          AND e.enabled = 1
        ORDER BY e.updated_at DESC
    `);
    return result.recordset[0] || null;
}


/*
 * =========================================
 * UPSERT ENDPOINT
 * =========================================
 */

async function upsertEndpoint({
    integrationId,
    endpointCode,
    endpointName,
    endpointType,
    httpMethod,
    endpointUrl,
    requestHeadersEncrypted,
    requestTemplate,
    responseMapping,
    enabled,
    timeoutMs,
    retryEnabled
}) {

    if (
        !ENDPOINT_TYPES.includes(
            endpointType
        )
    ) {

        throw new Error(
            `Unsupported endpoint type: ${endpointType}`
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
        requestHeadersEncrypted || null
    );

    request.input(
        "requestTemplate",
        sql.NVarChar(sql.MAX),
        requestTemplate || null
    );

    request.input(
        "responseMapping",
        sql.NVarChar(sql.MAX),
        responseMapping || null
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
                request_headers_encrypted,
                request_template,
                response_mapping,
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


module.exports = {
    ENDPOINT_TYPES,
    getIntegration,
    upsertIntegration,
    getEndpoints,
    getEndpoint,
    upsertEndpoint
};


// const {
//     getPool,
//     sql
// } = require("../../database/mssql");


// async function getEndpoint(
//     companyId,
//     endpointType
// ) {
//     const pool = await getPool();

//     const request = pool.request();

//     request.input(
//         "companyId",
//         sql.UniqueIdentifier,
//         companyId
//     );

//     request.input(
//         "endpointType",
//         sql.VarChar(50),
//         endpointType
//     );

//     const result = await request.query(`
//         SELECT TOP 1
//             id,
//             company_id,
//             endpoint_name,
//             endpoint_type,
//             endpoint_url,
//             http_method,
//             headers_json,
//             request_template_json,
//             response_mapping_json,
//             timeout_ms,
//             retry_enabled,
//             enabled
//         FROM integration_endpoints
//         WHERE
//             company_id = @companyId
//             AND endpoint_type = @endpointType
//             AND enabled = 1
//         ORDER BY
//             created_at DESC
//     `);

//     return result.recordset[0] || null;
// }


// async function getEndpoints(
//     companyId
// ) {
//     const pool = await getPool();

//     const request = pool.request();

//     request.input(
//         "companyId",
//         sql.UniqueIdentifier,
//         companyId
//     );

//     const result = await request.query(`
//         SELECT
//             id,
//             endpoint_name,
//             endpoint_type,
//             endpoint_url,
//             http_method,
//             headers_json,
//             request_template_json,
//             response_mapping_json,
//             timeout_ms,
//             retry_enabled,
//             enabled
//         FROM integration_endpoints
//         WHERE
//             company_id = @companyId
//         ORDER BY
//             endpoint_type,
//             endpoint_name
//     `);

//     return result.recordset;
// }


// module.exports = {
//     getEndpoint,
//     getEndpoints,
// };