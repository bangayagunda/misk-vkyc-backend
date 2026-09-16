const agents = new Map();

/*
 * Structure:
 *
 * agents = {
 *   agentId: {
 *      socket,
 *      companyId,
 *      userId,
 *      connectedAt,
 *      lastSeenAt
 *   }
 * }
 */


function addAgent({
    agentId,
    companyId,
    userId,
    socket
}) {
    /*
     * If same agent logs in from another tab/device,
     * close the previous connection.
     */
    const existing =
        agents.get(agentId);

    if (existing) {
        try {
            existing.socket.close(
                4001,
                "New connection established"
            );
        } catch (error) {
            console.error(
                "[WS OLD SOCKET CLOSE]",
                error
            );
        }
    }

    agents.set(
        agentId,
        {
            socket,
            companyId,
            userId,
            connectedAt: Date.now(),
            lastSeenAt: Date.now()
        }
    );
}


function removeAgent(
    agentId,
    socket
) {
    const existing =
        agents.get(agentId);

    /*
     * Do not remove a newer connection
     * when an old socket disconnects.
     */
    if (
        existing &&
        existing.socket === socket
    ) {
        agents.delete(agentId);
    }
}


function getAgent(
    agentId
) {
    return agents.get(agentId) || null;
}


function isAgentConnected(
    agentId
) {
    const agent =
        agents.get(agentId);

    if (!agent) {
        return false;
    }

    return (
        agent.socket.readyState === 1
    );
}


function touchAgent(
    agentId
) {
    const agent =
        agents.get(agentId);

    if (agent) {
        agent.lastSeenAt =
            Date.now();
    }
}


function getCompanyAgents(
    companyId
) {
    const result = [];

    for (
        const [agentId, connection]
        of agents
    ) {
        if (
            connection.companyId ===
            companyId
        ) {
            result.push({
                agentId,
                ...connection
            });
        }
    }

    return result;
}


function countCompanyAgents(
    companyId
) {
    let count = 0;

    for (
        const connection
        of agents.values()
    ) {
        if (
            connection.companyId ===
            companyId
        ) {
            count++;
        }
    }

    return count;
}


module.exports = {
    addAgent,
    removeAgent,
    getAgent,
    isAgentConnected,
    touchAgent,
    getCompanyAgents,
    countCompanyAgents
};