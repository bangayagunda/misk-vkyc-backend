const integrationClient =
    require("../integrations/integration.client");

const {
    getPool,
    sql
} = require("../../database/mssql");


const SUPPORTED_TYPES = [
    "CUSTOMER_DETAILS",
    "AADHAAR_FRONT",
    "AADHAAR_BACK",
    "AADHAAR",
    "PAN",
    "DOCUMENT",
    "KYC_STATUS"
];


async function getKycData({
    companyId,
    agentId,
    sessionId,
    endpointType
}) {

    const type =String(endpointType || "")
            .trim()
            .toUpperCase();


    if (
        !SUPPORTED_TYPES.includes(type)
    ) {
        throw createError(
            400,
            "INVALID_DOCUMENT_TYPE",
            "Unsupported KYC data type"
        );
    }


    /*
     * Agent must actually own
     * this KYC session.
     */
    const session =
        await getAssignedSession({
            companyId,
            agentId,
            sessionId
        });


    if (!session) {
        throw createError(
            404,
            "KYC_SESSION_NOT_FOUND",
            "KYC session not found"
        );
    }


    const customerData = {
        session: {
            id:session.id,
            code:session.session_code
        },
        customer: {
            externalUserId:session.external_user_id,
            clientReference:session.client_reference
        },
        metadata:parseMetadata(
                session.metadata_json
            )
    };


    /*
     * Prefer the configured company KYC provider.
     *
     * Development/test installations can also carry the source document
     * inside kyc_sessions.metadata_json. When that data is present, use it
     * as the persisted source instead of inventing a public file URL. This
     * is also useful when an existing session was created before the provider
     * endpoints were configured.
     */
    try {
        return await integrationClient.callCompanyEndpoint({
            companyId,
            endpointType: type,
            data: customerData
        });
    } catch (err) {
        if (err?.code !== "INTEGRATION_NOT_CONFIGURED") throw err;

        const persisted = getPersistedDocumentData(customerData.metadata, type);
        if (persisted !== undefined && persisted !== null) {
            return {
                endpointType: type,
                status: 200,
                source: "SESSION_METADATA",
                data: persisted
            };
        }
        throw err;
    }
}


async function getAssignedSession({
    companyId,
    agentId,
    sessionId
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
        "agentId",
        sql.UniqueIdentifier,
        agentId
    );

    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );


    const result =
        await request.query(`
            SELECT
                id,
                session_code,
                external_user_id,
                client_reference,
                metadata_json,
                assigned_agent_id,
                status
            FROM kyc_sessions
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND assigned_agent_id = @agentId
        `);


    return result.recordset[0] || null;
}


function getPersistedDocumentData(metadata, type) {
    if (!metadata || typeof metadata !== "object") return undefined;

    const containers = [
        metadata.documents,
        metadata.documentData,
        metadata.kyc,
        metadata
    ];

    const keyMap = {
        CUSTOMER_DETAILS: ["customerDetails", "customer", "customer_details"],
        AADHAAR: ["aadhaar", "aadhaarData", "aadhaar_details"],
        AADHAAR_FRONT: ["aadhaarFront", "aadhaar_front", "aadhaarFrontImage", "aadhaar_front_image"],
        AADHAAR_BACK: ["aadhaarBack", "aadhaar_back", "aadhaarBackImage", "aadhaar_back_image"],
        PAN: ["pan", "panData", "panCard", "pan_card", "panImage", "pan_image"],
        DOCUMENT: ["document", "documents"],
        KYC_STATUS: ["kycStatus", "kyc_status", "status"]
    };

    const keys = keyMap[type] || [];
    for (const container of containers) {
        if (!container || typeof container !== "object") continue;
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(container, key)) {
                return container[key];
            }
        }
        const normalized = Object.keys(container).find(
            k => normalizeKey(k) === normalizeKey(type)
        );
        if (normalized) return container[normalized];
    }
    return undefined;
}

function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[_\-\s]/g, "");
}


function parseMetadata(
    value
) {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}


function createError(
    statusCode,
    code,
    message
) {
    const error =new Error(message);
    error.statusCode =statusCode;
    error.code =code;
    return error;
}


module.exports = {
    getKycData
};