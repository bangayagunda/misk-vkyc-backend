const repository =
    require("./agent.repository");

const presence =
    require("./agent.presence");

async function getAgentProfile(agentId) {
    const agent =
        await repository.findAgentById(
            agentId
        );

    if (!agent) {
        const error = new Error(
            "Agent not found"
        );

        error.code = "AGENT_NOT_FOUND";
        error.statusCode = 404;

        throw error;
    }

    const liveStatus =
        await presence.getStatus(
            agentId
        );

    return {
        id: agent.id,
        userId: agent.user_id,
        agentCode: agent.agent_code,
        employeeCode: agent.employee_code,
        name: agent.display_name,
        email: agent.email,
        phone: agent.phone,

        status: liveStatus,

        company: {
            id: agent.company_id,
            code: agent.company_code,
            name: agent.company_name
        },

        maxConcurrentSessions:
            agent.max_concurrent_sessions,

        priority: agent.priority
    };
}

async function goOnline(agentId,companyId) {
    const agent =await repository.findAgentById(agentId);
    if (!agent) {
        const error = new Error("Agent not found");
        error.code = "AGENT_NOT_FOUND";
        error.statusCode = 404;
        throw error;
    }
    if (agent.company_id !== companyId) {
        const error = new Error("Company access violation");
        error.code = "COMPANY_ACCESS_DENIED";
        error.statusCode = 403;
        throw error;
    }
    if (agent.status !== "ACTIVE") {
        const error = new Error("Agent account is inactive");
        error.code = "AGENT_INACTIVE";
        error.statusCode = 403;
        throw error;
    }
    return presence.setOnline(
        agentId,
        companyId,
        agent.priority
    );
}

async function goOffline(agentId, companyId) {
    const active = await repository.findActiveSessionForAgent(agentId, companyId);
    if (active) {
        const error = new Error("Cannot go offline while a KYC session is active");
        error.code = "AGENT_BUSY";
        error.statusCode = 409;
        throw error;
    }
    return presence.setOffline(agentId, companyId);
}

async function sendHeartbeat(
    agentId,
    companyId
) {
    return presence.heartbeat(
        agentId,
        companyId
    );
}

async function getStatus(agentId) {
    return {
        status:
            await presence.getStatus(
                agentId
            )
    };
}

module.exports = {
    getAgentProfile,
    goOnline,
    goOffline,
    sendHeartbeat,
    getStatus
};