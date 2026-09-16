const { getPool, sql } = require("../../database/mssql");

async function findAgentForLogin(identifier) {
    const pool = await getPool();
    const request = pool.request();
    request.input("identifier",sql.VarChar(255),identifier);

    const result = await request.query(`
        SELECT TOP 1

            u.id AS user_id,
            u.company_id,
            u.email,
            u.phone,
            u.display_name,
            u.password_hash,
            u.status AS user_status,

            a.id AS agent_id,
            a.agent_code,
            a.employee_code,
            a.display_name AS agent_name,
            a.status AS agent_status,
            a.max_concurrent_sessions,
            a.priority,

            c.company_code,
            c.company_name,
            c.status AS company_status

        FROM users u

        INNER JOIN agents a
            ON a.user_id = u.id

        INNER JOIN companies c
            ON c.id = u.company_id

        WHERE
            (
                u.email = @identifier
                OR
                a.agent_code = @identifier
                OR
                u.phone = @identifier
            )

        AND u.user_type = 'AGENT'
    `);

    return result.recordset[0] || null;
}

async function findAgentById(agentId) {
    const pool = await getPool();

    const request = pool.request();

    request.input("agentId",sql.UniqueIdentifier,agentId);

    const result = await request.query(`
        SELECT TOP 1

            u.id AS user_id,
            u.company_id,
            u.email,
            u.phone,
            u.display_name,
            u.status AS user_status,

            a.id AS agent_id,
            a.agent_code,
            a.employee_code,
            a.display_name AS agent_name,
            a.status AS agent_status,
            a.max_concurrent_sessions,
            a.priority,

            c.company_code,
            c.company_name,
            c.status AS company_status

        FROM agents a

        INNER JOIN users u
            ON u.id = a.user_id

        INNER JOIN companies c
            ON c.id = a.company_id

        WHERE a.id = @agentId
    `);

    return result.recordset[0] || null;
}

async function updateLastLogin(userId) {
    const pool = await getPool();

    const request = pool.request();

    request.input(
        "userId",
        sql.UniqueIdentifier,
        userId
    );

    await request.query(`
        UPDATE users
        SET
            last_login_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @userId
    `);
}

module.exports = {
    findAgentForLogin,
    findAgentById,
    updateLastLogin
};

async function createRefreshTokenRecord({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
    const pool = await getPool();
    const request = pool.request();
    request.input("userId", sql.UniqueIdentifier, userId);
    request.input("tokenHash", sql.VarChar(500), tokenHash);
    request.input("expiresAt", sql.DateTime2, expiresAt);
    request.input("ipAddress", sql.VarChar(64), ipAddress || null);
    request.input("userAgent", sql.NVarChar(1000), userAgent || null);
    await request.query(`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES (@userId, @tokenHash, @expiresAt, @ipAddress, @userAgent)
    `);
}

async function rotateRefreshToken({ tokenHash, newTokenHash, newExpiresAt, ipAddress, userAgent }) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const request = new sql.Request(tx);
        request.input("tokenHash", sql.VarChar(500), tokenHash);
        request.input("newTokenHash", sql.VarChar(500), newTokenHash);
        request.input("newExpiresAt", sql.DateTime2, newExpiresAt);
        request.input("ipAddress", sql.VarChar(64), ipAddress || null);
        request.input("userAgent", sql.NVarChar(1000), userAgent || null);
        const result = await request.query(`
            UPDATE refresh_tokens
            SET revoked_at = SYSUTCDATETIME()
            OUTPUT inserted.user_id
            WHERE token_hash = @tokenHash
              AND revoked_at IS NULL
              AND expires_at > SYSUTCDATETIME();
        `);
        if (result.recordset.length !== 1) {
            throw new Error("Refresh token is invalid, expired, or already revoked");
        }
        const userId = result.recordset[0].user_id;
        request.input("userId", sql.UniqueIdentifier, userId);
        await request.query(`
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
            VALUES (@userId, @newTokenHash, @newExpiresAt, @ipAddress, @userAgent)
        `);
        await tx.commit();
        return userId;
    } catch (e) {
        try { await tx.rollback(); } catch (_) {}
        throw e;
    }
}

module.exports.createRefreshTokenRecord = createRefreshTokenRecord;
module.exports.rotateRefreshToken = rotateRefreshToken;
