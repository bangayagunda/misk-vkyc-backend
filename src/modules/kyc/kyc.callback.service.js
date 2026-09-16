const crypto =
    require("crypto");

const repository =
    require("./kyc.callback.repository");


async function createDelivery({
    companyId,
    sessionId,
    action,
    agentId,
    remarks,
    metadata
}) {

    const webhook =
        await repository.getWebhook(
            companyId
        );


    /*
     * Company has not configured callback.
     *
     * KYC result is already stored in our DB.
     */
    if (!webhook) {

        console.warn(
            `[CALLBACK] No webhook configured for company ${companyId}`
        );

        return null;
    }


    const eventId =
        crypto.randomUUID();


    const payload = {
        event: "kyc.action.completed",

        eventId,

        timestamp:
            new Date().toISOString(),

        company: {
            id:
                companyId
        },

        session: {
            id:
                sessionId
        },

        agent: {
            id:
                agentId
        },

        action: {
            code:
                action.action_code,

            label:
                action.action_label,

            type:
                action.action_type
        },

        result: {
            remarks:
                remarks || null,

            metadata:
                metadata || null
        }
    };


    await repository.createDelivery({
        webhookId:
            webhook.id,

        companyId,

        sessionId,

        eventType:
            "kyc.action.completed",

        eventId,

        payload
    });


    /*
     * Don't call company API directly here.
     *
     * Worker will process PENDING delivery.
     */
    return {
        eventId
    };
}


module.exports = {
    createDelivery
};