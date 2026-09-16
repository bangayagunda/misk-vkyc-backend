const registry =
    require("./connection.registry");


/*
 * =========================================
 * SEND TO SOCKET
 * =========================================
 */

function send(
    socket,
    event,
    data
) {

    if (!socket) {
        return false;
    }


    /*
     * WebSocket.OPEN = 1
     */

    if (
        socket.readyState !== 1
    ) {
        return false;
    }


    const message =
        JSON.stringify({
            event,

            timestamp:
                new Date().toISOString(),

            data
        });


    try {

        socket.send(
            message
        );


        return true;

    } catch (error) {

        console.error(
            "[WS SEND ERROR]",
            error
        );


        return false;
    }
}


/*
 * =========================================
 * SEND TO CONNECTION
 * =========================================
 */

function sendToConnection(
    connectionId,
    event,
    data
) {

    const connection =
        registry.get(
            connectionId
        );


    if (!connection) {
        return false;
    }


    return send(
        connection.socket,
        event,
        data
    );
}


/*
 * =========================================
 * SEND TO AGENT
 * =========================================
 */

function sendToAgent(
    agentId,
    event,
    data
) {

    const connection =
        registry.getActor(
            "AGENT",
            agentId
        );


    if (!connection) {
        return false;
    }


    return send(
        connection.socket,
        event,
        data
    );
}


/*
 * =========================================
 * SEND TO USER
 * =========================================
 */

function sendToUser(
    userId,
    event,
    data
) {

    const connection =
        registry.getActor(
            "USER",
            userId
        );


    if (!connection) {
        return false;
    }


    return send(
        connection.socket,
        event,
        data
    );
}


/*
 * =========================================
 * SEND TO COMPANY
 * =========================================
 */

function sendToCompany(
    companyId,
    event,
    data
) {

    const connections =
        registry.getCompanyConnections(
            companyId
        );


    let sent = 0;


    for (
        const connection
        of connections
    ) {

        if (
            send(
                connection.socket,
                event,
                data
            )
        ) {

            sent++;
        }
    }


    return sent;
}


/*
 * =========================================
 * SEND TO SESSION
 * =========================================
 */

function sendToSession(
    sessionId,
    event,
    data
) {

    const connections =
        registry.getSessionConnections(
            sessionId
        );


    let sent = 0;


    for (
        const connection
        of connections
    ) {

        if (
            send(
                connection.socket,
                event,
                data
            )
        ) {

            sent++;
        }
    }


    return sent;
}


/*
 * =========================================
 * BACKWARD COMPATIBILITY
 * =========================================
 *
 * Existing modules may already call sendCn().
 *
 * Keep the method, but internally use the
 * correct send() implementation.
 */

function sendCn(
    connection,
    event,
    payload
) {

   if (!connection || !connection.socket) {
        return false;
    }



    return send(
        connection.socket,
        event,
        payload
    );
}


/*
 * =========================================
 * SESSION COMPATIBILITY
 * =========================================
 */

function sendToSessionCn(
    sessionId,
    event,
    payload
) {

    return sendToSession(
        sessionId,
        event,
        payload
    );
}


/*
 * =========================================
 * AGENT COMPATIBILITY
 * =========================================
 */

function sendToAgentCn(
    agentId,
    event,
    payload
) {

    return sendToAgent(
        agentId,
        event,
        payload
    );
}


/*
 * =========================================
 * USER COMPATIBILITY
 * =========================================
 */

function sendToUserCn(
    userId,
    event,
    payload
) {

    return sendToUser(
        userId,
        event,
        payload
    );
}


module.exports = {

    send,

    sendToConnection,

    sendToAgent,

    sendToUser,

    sendToCompany,

    sendToSession,

    sendCn,

    sendToSessionCn,

    sendToAgentCn,

    sendToUserCn
};