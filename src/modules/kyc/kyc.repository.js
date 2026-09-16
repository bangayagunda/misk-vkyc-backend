const {getPool,sql} = require("../../database/mssql");
const {v4: uuidv4} = require("uuid");

async function createSession({
    companyId,
    externalUserId,
    clientReference,
    metadata
}) {
    const pool =await getPool();
    const sessionId =uuidv4();

    const sessionCode =
        `KYC-${Date.now()}-${sessionId
            .replace(/-/g, "")
            .slice(0, 8)
            .toUpperCase()}`;

    const request =pool.request();
    request.input("id",sql.UniqueIdentifier,sessionId);
    request.input("sessionCode",sql.VarChar(100),sessionCode);
    request.input("companyId",sql.UniqueIdentifier,companyId);
    request.input("externalUserId",sql.VarChar(150),externalUserId);

    request.input("clientReference",sql.VarChar(150),clientReference || null);
    request.input("metadataJson",sql.NVarChar(sql.MAX),
        metadata
            ? JSON.stringify(metadata)
            : null
    );
    await request.query(`
        INSERT INTO kyc_sessions
        (
            id,
            session_code,
            company_id,
            external_user_id,
            status,
            client_reference,
            metadata_json
        )
        VALUES
        (
            @id,
            @sessionCode,
            @companyId,
            @externalUserId,
            'WAITING',
            @clientReference,
            @metadataJson
        )
    `);
    return {
        id: sessionId,
        sessionCode
    };
}


async function findSessionById(sessionId) {
    const pool =await getPool();
    const request =pool.request();
    request.input("sessionId",sql.UniqueIdentifier,sessionId);

    const result =await request.query(`
            SELECT
                id,
                session_code,
                company_id,
                external_user_id,
                assigned_agent_id,
                status,
                requested_at,
                assigned_at,
                accepted_at,
                connected_at,
                started_at,
                ended_at,
                completed_at,
                ended_reason,
                final_action_code,
                client_reference,
                metadata_json
            FROM kyc_sessions
            WHERE id = @sessionId
        `);

    return result.recordset[0] || null;
}


async function assignAgent({
    sessionId,
    companyId,
    agentId
}) {
    const pool =await getPool();

    const request =pool.request();

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

    /*
     * Critical protection:
     *
     * Only WAITING session can become ASSIGNED.
     */
    const result =await request.query(`
            UPDATE kyc_sessions
            SET
                assigned_agent_id = @agentId,
                status = 'ASSIGNED',
                assigned_at = SYSUTCDATETIME(),
                updated_at = SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND status = 'WAITING';

            SELECT @@ROWCOUNT AS affected;
        `);

    return (
        result.recordset[0].affected === 1
    );
}


async function releaseAssignment(sessionId) {
    const pool =await getPool();
    const request =pool.request();

    request.input(
        "sessionId",
        sql.UniqueIdentifier,
        sessionId
    );

    await request.query(`
        UPDATE kyc_sessions
        SET
            assigned_agent_id = NULL,
            status = 'WAITING',
            assigned_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE
            id = @sessionId
            AND status = 'ASSIGNED'
    `);
}


async function cancelSession(
    sessionId,
    companyId,
    reason
) {
    const pool =await getPool();
    const request =pool.request();

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
        "reason",
        sql.VarChar(50),
        reason || "USER_CANCELLED"
    );

    const result =
        await request.query(`
            UPDATE kyc_sessions
            SET
                status = 'CANCELLED',
                ended_reason = @reason,
                ended_at = SYSUTCDATETIME(),
                completed_at = SYSUTCDATETIME(),
                updated_at = SYSUTCDATETIME()
            WHERE
                id = @sessionId
                AND company_id = @companyId
                AND status IN (
                    'WAITING',
                    'ASSIGNED',
                    'RINGING',
                    'ACCEPTED',
                    'CONNECTING',
                    'CONNECTED',
                    'IN_PROGRESS'
                );

            SELECT @@ROWCOUNT AS affected;
        `);

    return (
        result.recordset[0].affected === 1
    );
}

async function findWaitingSession(
    sessionId,
    companyId
) {
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

    const result = await request.query(`
        SELECT
            id,
            session_code,
            company_id,
            external_user_id,
            assigned_agent_id,
            status,
            requested_at,
            client_reference,
            metadata_json
        FROM kyc_sessions
        WHERE id = @sessionId
          AND company_id = @companyId
          AND status = 'WAITING'
    `);

    return result.recordset[0] || null;
}


module.exports = {
    createSession,
    findSessionById,
    findWaitingSession,
    assignAgent,
    releaseAssignment,
    cancelSession
    // createSession,
    // findSessionById,
    // assignAgent,
    // releaseAssignment,
    // cancelSession
};