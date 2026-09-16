const repository =
    require("./kyc.repository");

const matcher =
    require("./kyc.matcher");

const agentRepository =
    require("../agents/agent.repository");


async function completeSession({
    sessionId,
    companyId,
    agentId,
    actionCode,
    remarks
}) {

    const session =
        await repository.findSessionById(
            sessionId
        );


    if (!session) {

        const error =
            new Error(
                "KYC session not found"
            );

        error.code =
            "KYC_SESSION_NOT_FOUND";

        error.statusCode = 404;

        throw error;
    }


    /*
     * Tenant isolation.
     */
    if (
        session.company_id !==
        companyId
    ) {

        const error =
            new Error(
                "Company access denied"
            );

        error.code =
            "COMPANY_ACCESS_DENIED";

        error.statusCode = 403;

        throw error;
    }


    /*
     * Agent isolation.
     */
    if (
        session.assigned_agent_id !==
        agentId
    ) {

        const error =
            new Error(
                "Agent is not assigned to this session"
            );

        error.code =
            "AGENT_SESSION_MISMATCH";

        error.statusCode = 403;

        throw error;
    }


    const agent =
        await agentRepository.findActiveAgent(
            agentId,
            companyId
        );


    if (!agent) {

        const error =
            new Error(
                "Agent not available"
            );

        error.code =
            "AGENT_NOT_AVAILABLE";

        error.statusCode = 403;

        throw error;
    }


    /*
     * Update session.
     *
     * We use action code to determine
     * final state.
     */
    const finalStatus =
        String(actionCode || "")
            .toUpperCase() === "APPROVE"
            ? "COMPLETED"
            : String(actionCode || "")
                .toUpperCase() === "REJECT"
                ? "REJECTED"
                : "COMPLETED";


    await updateSessionFinalState({
        sessionId,
        companyId,
        agentId,
        status: finalStatus,
        actionCode,
        remarks
    });


    /*
     * Agent becomes available.
     *
     * releaseAgent() automatically starts
     * queue processing.
     */
    await matcher.releaseAgent(
        companyId,
        agentId,
        agent.priority,
        sessionId
    );


    return {
        sessionId,
        status: finalStatus,
        actionCode
    };
}


async function updateSessionFinalState({
    sessionId,
    companyId,
    agentId,
    status,
    actionCode,
    remarks
}) {
    const {getPool,sql} = require("../../database/mssql");
    const {v4: uuidv4} = require("uuid");
    const pool =await getPool();
    const transaction =new sql.Transaction(pool);
    await transaction.begin();
    try {
        const request =new sql.Request(transaction);
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
        request.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );
        request.input(
            "status",
            sql.VarChar(30),
            status
        );
        request.input(
            "actionCode",
            sql.VarChar(100),
            actionCode || null
        );
        const result =
            await request.query(`
                UPDATE kyc_sessions
                SET
                    status = @status,
                    final_action_code = @actionCode,
                    ended_at = SYSUTCDATETIME(),
                    completed_at =
                        SYSUTCDATETIME(),
                    updated_at =
                        SYSUTCDATETIME()
                WHERE
                    id = @sessionId
                    AND company_id = @companyId
                    AND assigned_agent_id = @agentId
                    AND status IN (
                        'CONNECTED',
                        'IN_PROGRESS'
                    );

                SELECT @@ROWCOUNT AS affected;
            `);

        if (result.recordset[0].affected !== 1) {
            throw new Error("Session is not in a completable state");
        }

        /*
         * Audit action.
         *
         * Your schema already has
         * kyc_session_actions.
         */
        const actionRequest =new sql.Request(transaction);
        actionRequest.input(
            "id",
            sql.UniqueIdentifier,
            uuidv4()
        );

        actionRequest.input(
            "sessionId",
            sql.UniqueIdentifier,
            sessionId
        );

        actionRequest.input(
            "companyId",
            sql.UniqueIdentifier,
            companyId
        );

        actionRequest.input(
            "agentId",
            sql.UniqueIdentifier,
            agentId
        );

        actionRequest.input(
            "actionCode",
            sql.VarChar(100),
            actionCode || "COMPLETE"
        );

        actionRequest.input(
            "actionResult",
            sql.VarChar(30),
            status
        );

        actionRequest.input(
            "remarks",
            sql.NVarChar(1000),
            remarks || null
        );

        await actionRequest.query(`
            INSERT INTO kyc_session_actions
            (
                id,
                session_id,
                company_id,
                agent_id,
                action_code,
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
                @actionResult,
                @remarks
            )
        `);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}


module.exports = {
    completeSession
};