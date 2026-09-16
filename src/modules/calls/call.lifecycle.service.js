const {getPool,sql} = require("../../database/mssql");

async function acceptCall({companyId,agentId,sessionId}) {
    const pool =await getPool();
    const request =pool.request();
    request.input("companyId",sql.UniqueIdentifier,companyId);
    request.input("agentId",sql.UniqueIdentifier,agentId);
    request.input("sessionId",sql.UniqueIdentifier,sessionId);

    const result = await request.query(`
            SELECT
                id,
                status,
                assigned_agent_id
            FROM kyc_sessions
            WHERE
                id = @sessionId
                AND company_id = @companyId
        `);

    const session =result.recordset[0];

    if (!session) {
        throw createError(404,"SESSION_NOT_FOUND","KYC session not found");
    }

    /*
     * Security:
     *
     * Agent can only accept
     * his own assigned session.
     */
    if (String(session.assigned_agent_id) !== String(agentId)) {
        throw createError(403,
            "SESSION_NOT_ASSIGNED",
            "Session is not assigned to this agent"
        );
    }

    /*
     * Matcher/repository assigns:
     *
     * WAITING -> ASSIGNED
     *
     * So ACCEPT must start
     * from ASSIGNED.
     */
    if (session.status !== "ASSIGNED") {
        throw createError(409,
            "INVALID_SESSION_STATE",
            `Cannot accept session in ${session.status}`
        );
    }

    /*
     * Atomic state transition.
     */
    const updateRequest =pool.request();
    updateRequest.input("companyId",sql.UniqueIdentifier,companyId);
    updateRequest.input("agentId",sql.UniqueIdentifier,agentId);
    updateRequest.input("sessionId",sql.UniqueIdentifier,sessionId);

    const updateResult =await updateRequest.query(`
            UPDATE kyc_sessions
            SET
                status = 'ACCEPTED',
                accepted_at =
                    SYSUTCDATETIME(),
                updated_at =
                    SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND assigned_agent_id = @agentId
                AND status = 'ASSIGNED'
        `);

    if (updateResult.rowsAffected[0] !== 1) {
        throw createError(409,
            "CALL_ALREADY_PROCESSED",
            "Call was already processed"
        );
    }

    return {sessionId,status: "ACCEPTED"};
}
async function rejectCall({
    companyId,
    agentId,
    sessionId,
    reason}) {
    const pool =await getPool();
    const transaction =new sql.Transaction(pool);
    await transaction.begin();
    try {
        const request =new sql.Request(transaction);
        request.input("companyId",sql.UniqueIdentifier,companyId);
        request.input("agentId",sql.UniqueIdentifier,agentId);
        request.input("sessionId",sql.UniqueIdentifier,sessionId);
        request.input("reason",sql.VarChar(100),reason || "AGENT_REJECTED");
        /*
         * Verify session ownership/state.
         */
        const sessionResult =await request.query(`
                SELECT
                    id,
                    company_id,
                    assigned_agent_id,
                    status
                FROM kyc_sessions
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
            `);
        const session =sessionResult.recordset[0];
        if (!session) {throw createError(404,
                "SESSION_NOT_FOUND",
                "KYC session not found"
            );
        }
        /*
         * Only assigned agent
         * can reject.
         */
        if (String(session.assigned_agent_id) !==String(agentId)) 
            {throw createError(403,
                "SESSION_NOT_ASSIGNED",
                "Session is not assigned to this agent"
            );
        }
        /*
         * Reject is allowed only
         * before acceptance.
         */
        if (session.status !== "ASSIGNED") {
            throw createError(409,
                "INVALID_SESSION_STATE",
                `Cannot reject session in ${session.status}`
            );
        }

        /*
         * Atomic transition.
         */
        const updateResult =await request.query(`
                UPDATE kyc_sessions
                SET
                    status = 'REJECTED',
                    ended_at =
                        SYSUTCDATETIME(),
                    completed_at =
                        SYSUTCDATETIME(),
                    ended_reason =
                        @reason,
                    updated_at =
                        SYSUTCDATETIME()
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
                    AND assigned_agent_id = @agentId
                    AND status = 'ASSIGNED'
            `);

        if (updateResult.rowsAffected[0] !== 1) {
            throw createError(409,
                "CALL_ALREADY_PROCESSED",
                "Call was already processed"
            );
        }

        /*
         * Audit.
         */
        const auditRequest =new sql.Request(transaction);
        auditRequest.input("sessionId",sql.UniqueIdentifier,sessionId);
        auditRequest.input("companyId",sql.UniqueIdentifier,companyId);
        auditRequest.input("agentId",sql.UniqueIdentifier,agentId);
        auditRequest.input("reason",sql.NVarChar(1000),reason || "AGENT_REJECTED");
        await auditRequest.query(`
            INSERT INTO kyc_session_actions
            (
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
                @sessionId,
                @companyId,
                @agentId,
                'AGENT_REJECT',
                'Agent Rejected',
                'REJECTED',
                @reason
            )
        `);
        await transaction.commit();
        return {
            sessionId,
            status: "REJECTED",
            reason:reason || "AGENT_REJECTED"
        };
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (_) {}
        throw error;
    }
}
async function startCall({ companyId, agentId, sessionId }) {
    const pool = await getPool();
    const request = pool.request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("agentId", sql.UniqueIdentifier, agentId);
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    const result = await request.query(`
        UPDATE kyc_sessions
        SET status = CASE WHEN status = 'ACCEPTED' THEN 'CONNECTING' ELSE 'IN_PROGRESS' END,
            started_at = CASE WHEN status = 'CONNECTED' AND started_at IS NULL THEN SYSUTCDATETIME() ELSE started_at END,
            updated_at = SYSUTCDATETIME()
        WHERE id=@sessionId AND company_id=@companyId AND assigned_agent_id=@agentId
          AND status IN ('ACCEPTED','CONNECTED')
    `);
    if (result.rowsAffected[0] === 1) {
        const q = await request.query(`SELECT status FROM kyc_sessions WHERE id=@sessionId`);
        return { sessionId, status: q.recordset[0].status };
    }
    const current = await request.query(`SELECT status FROM kyc_sessions WHERE id=@sessionId AND company_id=@companyId AND assigned_agent_id=@agentId`);
    const status = current.recordset[0]?.status;
    if (status === "CONNECTING" || status === "IN_PROGRESS" || status === "CONNECTED") return { sessionId, status };
    throw createError(409, "CALL_CANNOT_START", "Call cannot be started");
}

async function startCallOLD({
    companyId,
    agentId,
    sessionId}) {

    const pool =await getPool();
    const request = pool.request();
    request.input("companyId",sql.UniqueIdentifier,companyId);
    request.input( "agentId",sql.UniqueIdentifier,agentId);
    request.input("sessionId",sql.UniqueIdentifier,sessionId);
    const result =await request.query(`
            UPDATE kyc_sessions
            SET
                status = 'CONNECTING',
                updated_at =
                    SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND assigned_agent_id = @agentId
                AND status = 'ACCEPTED'
        `);

    if (result.rowsAffected[0] !== 1) {
        throw createError(
            409,
            "CALL_CANNOT_START",
            "Call cannot be started"
        );
    }
    return {
        sessionId,
        status: "CONNECTING"
    };
}

async function finalizeKyc({
    companyId,
    agentId,
    sessionId,
    actionCode,
    remarks
}) {

    const normalizedAction =
        String(actionCode || "")
            .trim()
            .toUpperCase();

    /*
     * =========================================
     * VALID ACTION
     * =========================================
     */

    if (
        normalizedAction !== "APPROVE" &&
        normalizedAction !== "REJECT"
    ) {
        throw createError(
            400,
            "INVALID_FINAL_ACTION",
            "Final action must be APPROVE or REJECT"
        );
    }

    const pool = await getPool();

    const transaction =
        new sql.Transaction(pool);

    await transaction.begin();

    try {

        /*
         * =========================================
         * LOAD SESSION
         * =========================================
         */

        const request =
            new sql.Request(transaction);

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

        const sessionResult =
            await request.query(`
                SELECT
                    id,
                    company_id,
                    assigned_agent_id,
                    status,
                    final_action_code
                FROM kyc_sessions
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
            `);

        const session =
            sessionResult.recordset[0];

        if (!session) {

            throw createError(
                404,
                "SESSION_NOT_FOUND",
                "KYC session not found"
            );
        }

        /*
         * =========================================
         * AGENT SECURITY
         * =========================================
         */

        if (
            String(session.assigned_agent_id)
            !==
            String(agentId)
        ) {

            throw createError(
                403,
                "SESSION_NOT_ASSIGNED",
                "Session is not assigned to this agent"
            );
        }

        /*
         * =========================================
         * CALL MUST BE ACTIVE
         * =========================================
         *
         * Final KYC decision is made while
         * the actual KYC call is active.
         */

        if (
            session.status !== "CONNECTED" &&
            session.status !== "IN_PROGRESS" &&
            session.status !== "RECONNECTING"
        ) {

            throw createError(
                409,
                "INVALID_FINAL_ACTION_STATE",
                `Final KYC action is not allowed in ${session.status}`
            );
        }

        /*
         * =========================================
         * PREVENT DOUBLE DECISION
         * =========================================
         */

        if (session.final_action_code) {

            throw createError(
                409,
                "FINAL_ACTION_ALREADY_SET",
                `Final KYC action already set to ${session.final_action_code}`
            );
        }

        /*
         * =========================================
         * SAVE FINAL ACTION
         * =========================================
         *
         * IMPORTANT:
         *
         * Do NOT mark session COMPLETED here.
         *
         * endCall() will handle the final
         * session completion.
         */

        const updateRequest =
            new sql.Request(transaction);

        updateRequest.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        updateRequest.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        updateRequest.input(
            "sessionId",
            sql.UniqueIdentifier,
            sessionId
        );

        updateRequest.input(
            "actionCode",
            sql.VarChar(50),
            normalizedAction
        );

        const updateResult =
            await updateRequest.query(`
                UPDATE kyc_sessions
                SET
                    final_action_code = @actionCode,
                    updated_at = SYSUTCDATETIME()
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
                    AND assigned_agent_id = @agentId
                    AND status IN (
                        'CONNECTED',
                        'IN_PROGRESS',
                        'RECONNECTING'
                    )
                    AND final_action_code IS NULL
            `);

        if (
            updateResult.rowsAffected[0] !== 1
        ) {

            throw createError(
                409,
                "FINAL_ACTION_CONFLICT",
                "Final KYC action could not be saved"
            );
        }

        /*
         * =========================================
         * AUDIT
         * =========================================
         */

        const auditRequest =
            new sql.Request(transaction);

        auditRequest.input(
            "sessionId",
            sql.UniqueIdentifier,
            sessionId
        );

        auditRequest.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        auditRequest.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        auditRequest.input(
            "actionCode",
            sql.VarChar(50),
            `FINAL_${normalizedAction}`
        );

        auditRequest.input(
            "actionLabel",
            sql.NVarChar(100),
            normalizedAction === "APPROVE"
                ? "KYC Approved"
                : "KYC Rejected"
        );

        auditRequest.input(
            "actionResult",
            sql.VarChar(50),
            normalizedAction === "APPROVE"
                ? "APPROVED"
                : "REJECTED"
        );

        auditRequest.input(
            "remarks",
            sql.NVarChar(1000),
            remarks || null
        );

        await auditRequest.query(`
            INSERT INTO kyc_session_actions
            (
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
                @sessionId,
                @companyId,
                @agentId,
                @actionCode,
                @actionLabel,
                @actionResult,
                @remarks
            )
        `);

        await transaction.commit();

        console.log(
            "[KYC FINAL ACTION]",
            {
                sessionId,
                agentId,
                action: normalizedAction
            }
        );

        return {
            sessionId,
            status: "FINAL_ACTION_SET",
            actionCode: normalizedAction,
            actionResult:
                normalizedAction === "APPROVE"
                    ? "APPROVED"
                    : "REJECTED"
        };

    } catch (error) {

        try {
            await transaction.rollback();
        } catch (_) {}

        throw error;
    }
}

async function endCall({
    companyId,
    agentId,
    sessionId,
    reason,
    terminalStatus = "COMPLETED"
}) {

    const pool =await getPool();
    const transaction =new sql.Transaction(pool);
    await transaction.begin();
    try {
        const request =new sql.Request(transaction);
        request.input( "companyId",sql.UniqueIdentifier,companyId);
        request.input("agentId",sql.UniqueIdentifier,agentId);
        request.input("sessionId",sql.UniqueIdentifier,sessionId);
        request.input("reason",sql.VarChar(100), reason || "CALL_ENDED");
        request.input("terminalStatus", sql.VarChar(30), terminalStatus === "CANCELLED" ? "CANCELLED" : "COMPLETED");

       const result = await request.query(`
                    UPDATE kyc_sessions
                    SET
                        status = @terminalStatus,
                        ended_at =SYSUTCDATETIME(),
                        completed_at =SYSUTCDATETIME(),
                        ended_reason =@reason,
                        updated_at =SYSUTCDATETIME()
                    WHERE
                        id = @sessionId
                        AND company_id =@companyId
                        AND assigned_agent_id =@agentId
                        AND status IN (
                            'ACCEPTED',
                            'CONNECTED',
                            'IN_PROGRESS',
                            'RECONNECTING'
                        )
                `);


        if (result.rowsAffected[0] !== 1) {
            // Idempotent termination: a duplicate END from the same assigned
            // agent is a successful no-op when the session is already terminal.
            const current = await request.query(`
                SELECT status, ended_reason
                FROM kyc_sessions
                WHERE id = @sessionId
                  AND company_id = @companyId
                  AND assigned_agent_id = @agentId
            `);
            const row = current.recordset[0];
            if (row && ["COMPLETED", "REJECTED", "CANCELLED", "TIMEOUT", "FAILED"].includes(row.status)) {
                return { sessionId, status: row.status, reason: row.ended_reason || reason || "CALL_ENDED", alreadyEnded: true };
            }
            throw createError(409, "CALL_ALREADY_ENDED", "Call is already ended");
        }

        // await request.query(`
        //     UPDATE agents
        //     SET
        //         status = 'ONLINE',
        //         updated_at =
        //             SYSUTCDATETIME()
        //     WHERE
        //         id = @agentId
        //         AND company_id = @companyId
        // `);
        await transaction.commit();
        return {
            sessionId,
            status: terminalStatus === "CANCELLED" ? "CANCELLED" : "COMPLETED",
            reason:
                reason || "CALL_ENDED"
        };
    } catch (error) {
        try {await transaction.rollback();} catch (_) {}
        throw error;
    }
}

/*
 * =========================================
 * MARK SESSION RECONNECTING
 * =========================================
 *
 * WebSocket disconnect hone par active call
 * ko temporarily RECONNECTING state mein rakhta hai.
 *
 * IMPORTANT:
 * - Call end nahi hoti.
 * - Agent release nahi hota.
 * - Callback trigger nahi hota.
 * - Ye sirf temporary reconnect state hai.
 */

async function markReconnecting({
    companyId,
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
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );

    const result =
        await request.query(`
            UPDATE kyc_sessions
            SET
                status = 'RECONNECTING',
                updated_at = SYSUTCDATETIME()
            OUTPUT
                inserted.status AS new_status,
                deleted.status AS previous_status
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND status IN (
                    'ACCEPTED',
                    'CONNECTING',
                    'CONNECTED',
                    'IN_PROGRESS'
                )
        `);

    const changed =
        result.rowsAffected &&
        result.rowsAffected[0] === 1;

    const previousStatus =
        changed && result.recordset[0]
            ? result.recordset[0].previous_status
            : null;

    if (!changed) {

        return {
            changed: false,
            sessionId,
            status: null
        };
    }

    console.log(
        `[CALL RECONNECTING] ` +
        `session=${sessionId}`
    );

    return {
        changed: true,
        sessionId,
        status: "RECONNECTING",
        previousStatus
    };
}

function createError(
    statusCode,
    code,
    message) {
    const error =new Error(message);
    error.statusCode =statusCode;
    error.code =code;
    return error;
}


module.exports = {
    acceptCall,
    rejectCall,
    startCall,
    endCall,
    finalizeKyc,
    markReconnecting
};