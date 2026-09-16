const repository =
    require("./integration.repository");


const ALLOWED_TYPES = [
    "CUSTOMER_DETAILS",
    "AADHAAR_FRONT",
    "AADHAAR_BACK",
    "AADHAAR",
    "PAN",
    "DOCUMENT",
    "KYC_STATUS",
    "CUSTOM"
];


async function getEndpointConfig(
    companyId,
    endpointType
) {
    const type =
        String(endpointType || "")
            .trim()
            .toUpperCase();

    if (
        !ALLOWED_TYPES.includes(type)
    ) {
        const error = new Error(
            "Unsupported integration endpoint type"
        );
        error.code ="UNSUPPORTED_ENDPOINT_TYPE";
        error.statusCode = 400;
        throw error;
    }

    const endpoint =
        await repository.getEndpoint(
            companyId,
            type
        );

    if (!endpoint) {
        const error = new Error(
            `Integration endpoint not configured: ${type}`
        );

        error.code =
            "INTEGRATION_NOT_CONFIGURED";

        error.statusCode = 404;

        throw error;
    }

    return endpoint;
}


module.exports = {
    getEndpointConfig,
    ALLOWED_TYPES
};