const {
    getPool,
    sql
} = require("../../database/mssql");


async function getWebhook(
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
                webhook_name,
                callback_url,
                secret_encrypted,
                enabled,
                timeout_ms,
                max_retry_attempts
            FROM webhook_configs
            WHERE
                company_id = @companyId
                AND enabled = 1
            ORDER BY
                created_at DESC
        `);

    return result.recordset[0] || null;
}


async function createDelivery({
    webhookId,
    companyId,
    sessionId,
    eventType,
    eventId,
    payload
}) {
    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "webhookId",
        sql.UniqueIdentifier,
        webhookId
    );

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );

    request.input(
        "eventType",
        sql.VarChar(100),
        eventType
    );

    request.input(
        "eventId",
        sql.VarChar(100),
        eventId
    );

    request.input(
        "payload",
        sql.NVarChar(sql.MAX),
        JSON.stringify(payload)
    );


    await request.query(`
        INSERT INTO webhook_deliveries
        (
            webhook_id,
            company_id,
            session_id,
            event_type,
            event_id,
            request_payload,
            status
        )
        VALUES
        (
            @webhookId,
            @companyId,
            @sessionId,
            @eventType,
            @eventId,
            @payload,
            'PENDING'
        )
    `);
}


module.exports = {
    getWebhook,
    createDelivery
};