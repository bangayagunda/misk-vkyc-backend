const {
    getPool,
    sql
} = require("../../database/mssql");


async function lockAgentForSession({
    companyId,
    agentId,
    sessionId
}) {
    const pool = await getPool();

    const transaction =
        new sql.Transaction(pool);

    await transaction.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
    );

    try {

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


        /*
         * Important:
         *
         * One agent can have only
         * one active KYC session.
         */
        const agentResult =
            await request.query(`
                SELECT
                    id,
                    status
                FROM agents WITH (UPDLOCK, HOLDLOCK)
                WHERE
                    id = @agentId
                    AND company_id = @companyId
            `);


        const agent =
            agentResult.recordset[0];


        if (!agent) {
            throw createError(
                404,
                "AGENT_NOT_FOUND",
                "Agent not found"
            );
        }


        if (
            ![
                "ONLINE",
                "AVAILABLE"
            ].includes(
                agent.status
            )
        ) {
            throw createError(
                409,
                "AGENT_NOT_AVAILABLE",
                "Agent is not available"
            );
        }


        /*
         * Check active session.
         */
        const activeResult =
            await request.query(`
                SELECT TOP 1
                    id
                FROM kyc_sessions WITH (UPDLOCK, HOLDLOCK)
                WHERE
                    company_id = @companyId
                    AND assigned_agent_id = @agentId
                    AND status IN (
                        'RESERVED',
                        'ACCEPTED',
                        'IN_PROGRESS',
                        'RECONNECTING'
                    )
                    AND id <> @sessionId
            `);


        if (
            activeResult.recordset.length > 0
        ) {
            throw createError(
                409,
                "AGENT_BUSY",
                "Agent already has an active KYC session"
            );
        }


        /*
         * Assign agent.
         */
        await request.query(`
            UPDATE kyc_sessions
            SET
                assigned_agent_id = @agentId,
                status = 'RESERVED',
                updated_at =
                    SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
        `);


        await request.query(`
            UPDATE agents
            SET
                status = 'BUSY',
                updated_at =
                    SYSUTCDATETIME()
            WHERE
                id = @agentId
                AND company_id = @companyId
        `);

        await transaction.commit();
        return true;
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (_) {}

        throw error;
    }
}

async function releaseAgent({
    companyId,
    agentId
}) {
    const pool = await getPool();
    const request =pool.request();
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

    await request.query(`
        UPDATE agents
        SET
            status = 'ONLINE',
            updated_at =
                SYSUTCDATETIME()
        WHERE
            id = @agentId
            AND company_id = @companyId
    `);
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

async function verifyAgentLock({
    companyId,
    agentId,
    sessionId
}) {
    const pool =await getPool();
    const request =pool.request();
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

    const result = await request.query(`
            SELECT
                id
            FROM kyc_sessions
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND assigned_agent_id = @agentId
                AND status = 'RESERVED'
        `);

    return (
        result.recordset.length === 1
    );
}


module.exports = {
    lockAgentForSession,
    releaseAgent,
    verifyAgentLock
};