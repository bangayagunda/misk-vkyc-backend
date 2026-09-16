const {
    getPool,
    sql
} = require("../../database/mssql");


async function getSession(sessionId) {
    const pool = await getPool();
    const request = pool.request();
    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );
    const result =await request.query(`
            SELECT
                id,
                company_id,
                session_code,
                status,
                assigned_agent_id,
                external_user_id
            FROM kyc_sessions
            WHERE
                id = @sessionId
        `);
    return result.recordset[0] || null;
}

async function updateCallState({
    sessionId,
    status
}) {
    const pool = await getPool();
    const request = pool.request();
    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );
    request.input(
        "status",
        sql.VarChar(30),
        status
    );

    console.log(
        "[CALL STATE UPDATE]",
        {
            sessionId,
            status
        }
    );

    const result = await request.query(`
        UPDATE kyc_sessions
        SET
            status = @status,

            connected_at =
                CASE
                    WHEN @status = 'CONNECTED'
                        AND connected_at IS NULL
                    THEN SYSUTCDATETIME()
                    ELSE connected_at
                END,

            started_at =
                CASE
                    WHEN @status = 'IN_PROGRESS'
                        AND started_at IS NULL
                    THEN SYSUTCDATETIME()
                    ELSE started_at
                END,

            updated_at = SYSUTCDATETIME()

        WHERE
            id = @sessionId
            AND (
                @status = status
                OR (@status = 'CONNECTING' AND status IN ('ACCEPTED', 'RECONNECTING'))
                OR (@status = 'CONNECTED' AND status IN ('CONNECTING', 'RECONNECTING'))
                OR (@status = 'IN_PROGRESS' AND status = 'CONNECTED')
            )
    `);

    console.log(
        "[CALL STATE UPDATE RESULT]",
        {
            rowsAffected: result.rowsAffected
        }
    );
}

async function getUserSession({sessionId,companyId,externalUserId}) {
    const pool =await getPool();
    const request =pool.request();
    request.input("sessionId",sql.UniqueIdentifier,sessionId);
    request.input("companyId", sql.UniqueIdentifier,companyId);
    request.input("externalUserId",sql.VarChar(150),externalUserId);

    const result =await request.query(`
            SELECT
                id,
                company_id,
                session_code,
                status,
                assigned_agent_id,
                external_user_id
            FROM kyc_sessions
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND external_user_id = @externalUserId
        `);

    return (result.recordset[0] ||null);
}

async function markSessionReconnecting(sessionId) {
    const pool = await getPool();
    const request = pool.request();
    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );
    const result = await request.query(`
        UPDATE kyc_sessions
        SET
            status = 'RECONNECTING',
            updated_at = SYSUTCDATETIME()
        WHERE
            id = @sessionId
            AND status IN (
                'CONNECTED',
                'IN_PROGRESS'
            )
    `);
    return result.rowsAffected[0] === 1;
}

async function findReconnectingSession({companyId,agentId}) {
    const pool =await getPool();
    const request = pool.request();
    request.input("companyId",sql.UniqueIdentifier,companyId);
    request.input("agentId",sql.UniqueIdentifier,agentId);
    const result =await request.query(`
            SELECT TOP 1
                id,
                company_id,
                session_code,
                status,
                assigned_agent_id,
                external_user_id
            FROM kyc_sessions
            WHERE
                company_id = @companyId
                AND assigned_agent_id = @agentId
                AND status = 'RECONNECTING'
            ORDER BY
                updated_at DESC
        `);
    return result.recordset[0] || null;
}

async function restoreReconnectingSession({
    sessionId,companyId,agentId,status}) {
    const pool = await getPool();
    const request =pool.request();
    request.input("sessionId",sql.UniqueIdentifier,sessionId);
    request.input("companyId",sql.UniqueIdentifier,companyId);
    request.input("agentId",sql.UniqueIdentifier,agentId);
    request.input("status",sql.VarChar(30),status);
    const result =
        await request.query(`
            UPDATE kyc_sessions
            SET
                status = @status,
                updated_at = SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND assigned_agent_id = @agentId
                AND status = 'RECONNECTING'
        `);

    return (result.rowsAffected[0] === 1);
}

async function findReconnectingUserSession({
    companyId,
    externalUserId
}) {

    const pool = await getPool();

    const request = pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "externalUserId",
        sql.VarChar(150),
        externalUserId
    );

    const result =
        await request.query(`
            SELECT TOP 1
                id,
                company_id,
                session_code,
                status,
                assigned_agent_id,
                external_user_id
            FROM kyc_sessions
            WHERE
                company_id = @companyId
                AND external_user_id = @externalUserId
                AND status = 'RECONNECTING'
            ORDER BY
                updated_at DESC
        `);

    return result.recordset[0] || null;
}

async function restoreReconnectingUserSession({
    sessionId,
    companyId,
    externalUserId,
    status
}) {

    const pool = await getPool();

    const request = pool.request();

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
        "externalUserId",
        sql.VarChar(150),
        externalUserId
    );

    request.input(
        "status",
        sql.VarChar(30),
        status
    );

    const result =
        await request.query(`
            UPDATE kyc_sessions
            SET
                status = @status,
                updated_at = SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND external_user_id = @externalUserId
                AND status = 'RECONNECTING'
        `);

    return (
        result.rowsAffected[0] === 1
    );
}


module.exports = {
    getSession,
    updateCallState,
    getUserSession,
    
    markSessionReconnecting,
    findReconnectingSession,
    restoreReconnectingSession,

    findReconnectingUserSession,
    restoreReconnectingUserSession
};