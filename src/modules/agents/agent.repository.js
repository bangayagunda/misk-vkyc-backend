const {getPool,sql} = require("../../database/mssql");

async function findAgentById(agentId) {
    const pool = await getPool();
    const request = pool.request();
    request.input("agentId", sql.UniqueIdentifier, agentId);
    const result = await request.query(`
        SELECT TOP 1
            a.id, a.company_id, a.user_id, a.agent_code, a.employee_code,
            a.display_name, a.status, a.max_concurrent_sessions, a.priority,
            u.email, u.phone, u.status AS user_status, c.company_code, c.company_name, c.status AS company_status
        FROM agents a
        INNER JOIN users u ON u.id = a.user_id
        INNER JOIN companies c ON c.id = a.company_id
        WHERE a.id = @agentId AND a.deleted_at IS NULL
    `);
    return result.recordset[0] || null;
}

async function findActiveAgent(
    agentId,
    companyId
) {
    const pool = await getPool();
    const request = pool.request();
    request.input(
        "agentId",
        sql.UniqueIdentifier,
        agentId
    );
    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );
    const result = await request.query(`
        SELECT
            id,
            company_id,
            user_id,
            agent_code,
            display_name,
            status,
            max_concurrent_sessions,
            priority
        FROM agents
        WHERE id = @agentId
          AND company_id = @companyId
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
    `);
    return result.recordset[0] || null;
}

module.exports = {
    findAgentById,
    findActiveAgent
};

async function findActiveSessions(agentId, companyId) {
    const pool = await getPool();
    const request = pool.request();
    request.input("agentId", sql.UniqueIdentifier, agentId);
    request.input("companyId", sql.UniqueIdentifier, companyId);
    const result = await request.query(`
        SELECT
            id, session_code, company_id, external_user_id, assigned_agent_id,
            status, requested_at, assigned_at, accepted_at, connected_at,
            started_at, ended_at, completed_at, ended_reason, final_action_code,
            client_reference, metadata_json
        FROM kyc_sessions
        WHERE company_id = @companyId
          AND assigned_agent_id = @agentId
          AND status IN ('ASSIGNED','RINGING','ACCEPTED','CONNECTING','CONNECTED','IN_PROGRESS','RECONNECTING')
        ORDER BY assigned_at ASC, requested_at ASC
    `);
    return result.recordset;
}

module.exports.findActiveSessions = findActiveSessions;


async function findActiveSessionForAgent(agentId, companyId) {
    const pool = await getPool();
    const request = pool.request();
    request.input("agentId", sql.UniqueIdentifier, agentId);
    request.input("companyId", sql.UniqueIdentifier, companyId);
    const result = await request.query(`
        SELECT TOP 1 id, status, assigned_agent_id
        FROM kyc_sessions
        WHERE company_id=@companyId AND assigned_agent_id=@agentId
          AND status IN ('ASSIGNED','RINGING','ACCEPTED','CONNECTING','CONNECTED','IN_PROGRESS','RECONNECTING')
        ORDER BY assigned_at ASC
    `);
    return result.recordset[0] || null;
}
module.exports.findActiveSessionForAgent = findActiveSessionForAgent;
