const {
    getPool,
    sql
} = require("../../database/mssql");

const {
    randomUUID
} = require("crypto");

const actionRepository =
    require("./kyc.action.repository");

const publisher =
    require("../../realtime/websocket.publisher");

const {
    EVENT
} = require("../../realtime/websocket.events");

const matcher =
    require("./kyc.matcher");


async function executeAction({
    sessionId,
    companyId,
    agentId,
    actionCode,
    remarks,
    metadata
}) {

    /*
     * 1. Load session
     */
    const session =
        await getSession(
            sessionId,
            companyId
        );


    if (!session) {
        throw createError(
            404,
            "KYC_SESSION_NOT_FOUND",
            "KYC session not found"
        );
    }


    /*
     * 2. Verify assigned agent
     */
    if (
        session.assigned_agent_id !==
        agentId
    ) {
        throw createError(
            403,
            "AGENT_SESSION_MISMATCH",
            "This session is not assigned to this agent"
        );
    }


    /*
     * 3. Validate action belongs
     *    to same company.
     */
    const action =
        await actionRepository
            .getActionByCode(
                companyId,
                actionCode
            );


    if (!action) {
        throw createError(
            400,
            "INVALID_KYC_ACTION",
            "KYC action is not enabled"
        );
    }


    /*
     * 4. Validate current session state.
     */
    const allowedStatuses = [
        "ACCEPTED",
        "CONNECTED",
        "IN_PROGRESS",
        "RECONNECTING"
    ];


    if (
        !allowedStatuses.includes(
            session.status
        )
    ) {
        throw createError(
            409,
            "INVALID_SESSION_STATE",
            `Action cannot be performed in ${session.status} state`
        );
    }


    /*
     * 5. Update DB atomically.
     */
    const result =
        await persistAction({
            session,
            action,
            companyId,
            agentId,
            remarks,
            metadata
        });


    /*
     * 6. Tell Agent Panel.
     */
    publisher.sendToAgent(
        agentId,
        EVENT.KYC_COMPLETED,
        {
            sessionId,
            action: {
                code:
                    action.action_code,

                label:
                    action.action_label,

                type:
                    action.action_type
            },
            status:
                result.status
        }
    );


    /*
     * 7. Free agent only after
     *    DB transaction succeeded.
     */
    /*
 * 7. Release agent ONLY when the
 *    KYC session is actually finished.
 *
 * REVIEW keeps the session IN_PROGRESS,
 * therefore the agent MUST remain BUSY.
 */

if (
    result.status === "COMPLETED" ||
    result.status === "REJECTED"
) {

    await matcher.releaseAgent(
        companyId,
        agentId,
        0,
        sessionId
    );
}


    /*
     * 8. Callback is asynchronous.
     *
     * Agent response should NOT wait
     * for customer's API.
     */
    if (
        action.requires_callback
    ) {

        const callbackService =
            require("./kyc.callback.service");

        await callbackService
            .createDelivery({
                companyId,
                sessionId,
                action,
                agentId,
                remarks,
                metadata
            });
    }


    return {
        sessionId,

        status:
            result.status,

        action: {
            code:
                action.action_code,

            label:
                action.action_label,

            type:
                action.action_type
        }
    };
}


async function getSession(
    sessionId,
    companyId
) {
    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    const result =
        await request.query(`
            SELECT
                id,
                session_code,
                company_id,
                external_user_id,
                assigned_agent_id,
                status,
                client_reference,
                metadata_json
            FROM kyc_sessions
            WHERE
                id = @sessionId
                AND company_id = @companyId
        `);

    return result.recordset[0] || null;
}


async function persistAction({
    session,
    action,
    companyId,
    agentId,
    remarks
}) {

    const pool =
        await getPool();

    const transaction =
        new sql.Transaction(pool);

    await transaction.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
    );

    try {

        /*
         * =========================================
         * 1. LOCK + RELOAD SESSION
         * =========================================
         *
         * Important:
         * executeAction() ke bahar jo session read hua tha
         * us par concurrent request protection nahi tha.
         *
         * Is transaction ke andar session ko lock karke
         * latest state dobara read karte hain.
         */

        const sessionRequest =
            new sql.Request(transaction);

        sessionRequest.input(
            "sessionId",
            sql.UniqueIdentifier,
            session.id
        );

        sessionRequest.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        sessionRequest.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        const sessionResult =
            await sessionRequest.query(`
                SELECT
                    id,
                    assigned_agent_id,
                    status
                FROM kyc_sessions WITH (
                    UPDLOCK,
                    HOLDLOCK,
                    ROWLOCK
                )
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
            `);


        const lockedSession =
            sessionResult.recordset[0];


        if (!lockedSession) {

            throw createError(
                404,
                "KYC_SESSION_NOT_FOUND",
                "KYC session not found"
            );
        }


        /*
         * =========================================
         * 2. VERIFY AGENT
         * =========================================
         */

        if (
            String(
                lockedSession.assigned_agent_id
            ) !== String(agentId)
        ) {

            throw createError(
                403,
                "AGENT_SESSION_MISMATCH",
                "This session is not assigned to this agent"
            );
        }


        /*
         * =========================================
         * 3. VERIFY CURRENT STATUS
         * =========================================
         */

        const allowedStatuses = [
            "ACCEPTED",
            "CONNECTED",
            "IN_PROGRESS",
            "RECONNECTING"
        ];


        if (
            !allowedStatuses.includes(
                lockedSession.status
            )
        ) {

            throw createError(
                409,
                "SESSION_ALREADY_UPDATED",
                `Session is already ${lockedSession.status}`
            );
        }


        /*
         * =========================================
         * 4. CALCULATE NEW STATUS
         * =========================================
         */

        let newStatus;

        switch (
            action.action_type
        ) {

            case "APPROVE":

                newStatus =
                    "COMPLETED";

                break;


            case "REJECT":

                newStatus =
                    "REJECTED";

                break;


            case "REVIEW":

                newStatus =
                    "IN_PROGRESS";

                break;


            default:

                newStatus =
                    "COMPLETED";

                break;
        }


        /*
         * =========================================
         * 5. UPDATE SESSION
         * =========================================
         *
         * Row already locked.
         *
         * Therefore two simultaneous requests
         * cannot both successfully modify the session.
         */

        const update =
            new sql.Request(transaction);

        update.input(
            "sessionId",
            sql.UniqueIdentifier,
            lockedSession.id
        );

        update.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        update.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        update.input(
            "status",
            sql.VarChar(30),
            newStatus
        );

        update.input(
            "actionCode",
            sql.VarChar(100),
            action.action_code
        );


        const updateResult =
            await update.query(`
                UPDATE kyc_sessions
                SET

                    status =
                        @status,

                    final_action_code =
                        @actionCode,

                    ended_at =
                        CASE
                            WHEN @status IN (
                                'COMPLETED',
                                'REJECTED'
                            )
                            THEN SYSUTCDATETIME()
                            ELSE ended_at
                        END,

                    completed_at =
                        CASE
                            WHEN @status IN (
                                'COMPLETED',
                                'REJECTED'
                            )
                            THEN SYSUTCDATETIME()
                            ELSE completed_at
                        END,

                    updated_at =
                        SYSUTCDATETIME()

                WHERE
                    id = @sessionId
                    AND company_id = @companyId
                    AND assigned_agent_id = @agentId
            `);


        if (
            updateResult.rowsAffected[0] !== 1
        ) {

            throw createError(
                409,
                "SESSION_ALREADY_UPDATED",
                "Session was already updated"
            );
        }


        /*
         * =========================================
         * 6. AUDIT ACTION
         * =========================================
         */

        const audit =
            new sql.Request(transaction);

        audit.input(
            "id",
            sql.UniqueIdentifier,
            randomUUID()
        );

        audit.input(
            "sessionId",
            sql.UniqueIdentifier,
            lockedSession.id
        );

        audit.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        audit.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        audit.input(
            "actionCode",
            sql.VarChar(100),
            action.action_code
        );

        audit.input(
            "actionLabel",
            sql.NVarChar(150),
            action.action_label
        );

        audit.input(
            "actionResult",
            sql.VarChar(30),
            newStatus
        );

        audit.input(
            "remarks",
            sql.NVarChar(1000),
            remarks || null
        );


        await audit.query(`
            INSERT INTO kyc_session_actions
            (
                id,
                session_id,
                company_id,
                agent_id,
                action_code,
                action_label,
                action_result,
                remarks
            )
            VALUES
            (
                @id,
                @sessionId,
                @companyId,
                @agentId,
                @actionCode,
                @actionLabel,
                @actionResult,
                @remarks
            )
        `);


        /*
         * =========================================
         * 7. COMMIT
         * =========================================
         */

        await transaction.commit();


        return {
            status:
                newStatus
        };

    } catch (error) {

        try {

            await transaction.rollback();

        } catch (_) {}


        throw error;
    }
}

function createError(
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


module.exports = {
    executeAction
};