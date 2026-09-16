const crypto =
    require("crypto");

const {
    getPool,
    sql
} = require("../../database/mssql");


const WORKER_INTERVAL =
    2000;


let running = false;


async function processPendingCallbacks() {

    if (running) {
        return;
    }

    running = true;


    try {

        const pool =
            await getPool();


        /*
         * Pick one pending callback.
         *
         * UPDLOCK + READPAST prevents
         * multiple workers from taking
         * same delivery.
         */
        const transaction =
            new sql.Transaction(pool);

        await transaction.begin(
            sql.READ_COMMITTED
        );


        try {

            const request =
                new sql.Request(
                    transaction
                );


            const result =
                await request.query(`
                    SELECT TOP 1
                        d.id,
                        d.webhook_id,
                        d.company_id,
                        d.session_id,
                        d.event_type,
                        d.event_id,
                        d.request_payload,
                        d.attempt_count,

                        w.callback_url,
                        w.secret_encrypted,
                        w.timeout_ms,
                        w.max_retry_attempts

                    FROM webhook_deliveries d
                    WITH (
                        UPDLOCK,
                        READPAST,
                        ROWLOCK
                    )

                    INNER JOIN webhook_configs w
                        ON w.id =
                           d.webhook_id

                    WHERE
                    d.status = 'PENDING'
                    AND w.enabled = 1
                    AND (
                        d.next_retry_at IS NULL
                        OR d.next_retry_at <= SYSUTCDATETIME()
                    )

                    ORDER BY
                        d.created_at ASC
                `);


            if (
                result.recordset.length === 0
            ) {

                await transaction.commit();

                return;
            }


            const delivery =
                result.recordset[0];


            /*
             * Mark PROCESSING.
             */
            const update =
                new sql.Request(
                    transaction
                );


            update.input(
                "id",
                sql.UniqueIdentifier,
                delivery.id
            );


            await update.query(`
                UPDATE webhook_deliveries
                SET
                    status = 'PROCESSING',
                    attempt_count =
                        attempt_count + 1,
                    updated_at =
                        SYSUTCDATETIME()
                WHERE
                    id = @id
            `);


            await transaction.commit();


            /*
             * Now outside DB transaction
             * call customer API.
             */
            await deliver(
                delivery
            );

        } catch (error) {

            try {
                await transaction.rollback();
            } catch (_) {}

            throw error;
        }

    } catch (error) {

        console.error(
            "[CALLBACK WORKER]",
            error
        );

    } finally {

        running = false;
    }
}


async function deliver(
    delivery
) {

    const payload =
        JSON.parse(
            delivery.request_payload
        );


    const headers = {
        "Content-Type":
            "application/json",

        "X-KYC-Event":
            delivery.event_type,

        "X-KYC-Event-Id":
            delivery.event_id
    };


    /*
     * Optional HMAC signature.
     */
    if (
        delivery.secret_encrypted
    ) {

        const signature =
            crypto
                .createHmac(
                    "sha256",
                    delivery.secret_encrypted
                )
                .update(
                    delivery.request_payload
                )
                .digest("hex");


        headers[
            "X-KYC-Signature"
        ] =
            signature;
    }


    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            delivery.timeout_ms || 10000
        );


    try {

        const response =
            await fetch(
                delivery.callback_url,
                {
                    method: "POST",

                    headers,

                    body:
                        delivery.request_payload,

                    signal:
                        controller.signal
                }
            );


        const responseBody =
            await response.text();


        if (
            response.ok
        ) {

            await markSuccess(
                delivery.id,
                response.status,
                responseBody
            );

            return;
        }


        await markFailure(
            delivery,
            response.status,
            responseBody
        );

    } catch (error) {

        await markFailure(
            delivery,
            null,
            error.message
        );

    } finally {

        clearTimeout(
            timeout
        );
    }
}


async function markSuccess(
    deliveryId,
    statusCode,
    responseBody
) {

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "id",
        sql.UniqueIdentifier,
        deliveryId
    );

    request.input(
        "statusCode",
        sql.Int,
        statusCode
    );

    request.input(
        "responseBody",
        sql.NVarChar(sql.MAX),
        responseBody
    );


    await request.query(`
        UPDATE webhook_deliveries
        SET
            status = 'SUCCESS',
            response_status = @statusCode,
            response_body = @responseBody,
            delivered_at =
                SYSUTCDATETIME(),
            updated_at =
                SYSUTCDATETIME()
        WHERE
            id = @id
    `);
}


async function markFailure(
    delivery,
    statusCode,
    errorMessage
) {

    const nextAttempt =
        delivery.attempt_count;


    const maxAttempts =
        delivery.max_retry_attempts || 5;


    /*
     * Retry with exponential backoff.
     *
     * 2 sec
     * 4 sec
     * 8 sec
     * 16 sec
     * ...
     */
    if (
        nextAttempt >=
        maxAttempts
    ) {

        await markDead(
            delivery.id,
            statusCode,
            errorMessage
        );

        return;
    }


    const delaySeconds =
        Math.min(
            Math.pow(
                2,
                nextAttempt
            ),
            300
        );


    const pool =
        await getPool();

    const request =
        pool.request();


    request.input(
        "id",
        sql.UniqueIdentifier,
        delivery.id
    );

    request.input(
        "statusCode",
        sql.Int,
        statusCode
    );

    request.input(
        "error",
        sql.NVarChar(2000),
        errorMessage
    );

    request.input(
        "delaySeconds",
        sql.Int,
        delaySeconds
    );


    await request.query(`
        UPDATE webhook_deliveries
        SET
            status = 'PENDING',

            response_status =
                @statusCode,

            last_error =
                @error,

            next_retry_at =
                DATEADD(
                    SECOND,
                    @delaySeconds,
                    SYSUTCDATETIME()
                ),

            updated_at =
                SYSUTCDATETIME()

        WHERE
            id = @id
    `);
}


async function markDead(
    deliveryId,
    statusCode,
    errorMessage
) {

    const pool =
        await getPool();

    const request =
        pool.request();


    request.input(
        "id",
        sql.UniqueIdentifier,
        deliveryId
    );

    request.input(
        "statusCode",
        sql.Int,
        statusCode
    );

    request.input(
        "error",
        sql.NVarChar(2000),
        errorMessage
    );


    await request.query(`
        UPDATE webhook_deliveries
        SET
            status = 'DEAD',
            response_status =
                @statusCode,
            last_error =
                @error,
            updated_at =
                SYSUTCDATETIME()
        WHERE
            id = @id
    `);
}


function startCallbackWorker() {

    console.log(
        "[CALLBACK WORKER] Started"
    );


    setInterval(
        processPendingCallbacks,
        WORKER_INTERVAL
    );
}


module.exports = {
    startCallbackWorker,
    processPendingCallbacks
};