const service =
    require("./integration.service");

const {
    parseJson,
    replaceTemplate,
    applyResponseMapping
} = require("./integration.utils");

const {
    requestExternalApi
} = require("./integration.http");


async function callCompanyEndpoint({
    companyId,
    endpointType,
    data
}) {

    const endpoint =
        await service.getEndpointConfig(
            companyId,
            endpointType
        );


    const headers =parseJson(
            endpoint.request_headers_encrypted,
            {}
        );


    const template =parseJson(
            endpoint.request_template,
            {}
        );


    const requestBody =replaceTemplate(
            template,
            data
        );


    const method =String(
            endpoint.http_method ||
            "POST"
        ).toUpperCase();


    const result =await requestExternalApi({
            url:endpoint.endpoint_url,
            method,
            headers,
            body:method === "GET"
                    ? null
                    : requestBody,
            timeoutMs:endpoint.timeout_ms ||10000
        });

    if (!result.ok) {
        const error =
            new Error(
                `Company API returned HTTP ${result.status}`
            );
        error.code ="COMPANY_API_ERROR";
        error.statusCode = 502;
        error.externalStatus =result.status;
        error.externalResponse =result.data;
        throw error;
    }

    const mapping =parseJson(
            endpoint.response_mapping,
            null
        );

    const normalized =applyResponseMapping(
            result.data,
            mapping
        );

    return {
        endpointType,
        status:result.status,
        data:normalized
    };
}


module.exports = {
    callCompanyEndpoint
};