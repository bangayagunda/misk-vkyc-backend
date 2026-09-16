const {WebSocketServer} = require("ws");
const {registerConnection} = require("./websocket.connection");


const publisher =require("./websocket.publisher");
const {EVENT} = require("./websocket.events");

const {
    authenticateWebSocket,
    authenticateUserWebSocket} =require("./websocket.auth");

const {authorizeUserConnection} =require("./websocket.user");
const registry =require("./connection.registry");


function setupWebSocketServer(httpServer) {
    const wss =new WebSocketServer({
            noServer: true
        });
    /*
     * =========================================
     * HTTP UPGRADE
     * =========================================
     */

    httpServer.on("upgrade",async (request,socket,head) => {
            try {
                const url =new URL(request.url,"http://localhost");
                /*
                 * Current endpoint:
                 *
                 * /ws/agent
                 *
                 * User WebSocket will be added
                 * separately after Agent flow is stable.
                 */

                // if (url.pathname !=="/ws/agent") {
                //     socket.destroy();
                //     return;
                // }

                /*
                 * Authenticate Agent.
                 */
              //  const auth = authenticateWebSocket(request);

                let auth;
                let actorType;
                if (url.pathname === "/ws/agent") {
                    auth =authenticateWebSocket(request);
                    actorType ="AGENT";
                } else if (url.pathname ==="/ws/user") {
                    auth =authenticateUserWebSocket(request);
                    /*
                    * User session must be verified
                    * before WebSocket is accepted.
                    */
                    await authorizeUserConnection(auth);
                    actorType ="USER";
                } else {
                    socket.destroy();
                    return;
                }

                /*
                 * Upgrade HTTP -> WebSocket.
                 */
                wss.handleUpgrade(request,socket,head,ws => {
                        wss.emit("connection",ws,request,auth,actorType);
                    }
                );
            } catch (error) {
                console.error("[WS AUTH]",error);
                try {
                    socket.write(
                        "HTTP/1.1 401 Unauthorized\r\n" +
                        "Connection: close\r\n" +
                        "\r\n");

                } catch (writeError) {
                    console.error("[WS AUTH RESPONSE]",writeError);
                }
                socket.destroy();
            }
        }
    );

    /*
     * =========================================
     * NEW WEBSOCKET CONNECTION
     * =========================================
     */
    wss.on("connection", async (ws, request,auth,actorType) => {
            try {
                const {agentId,companyId} = auth;
                /*
                 * =====================================
                 * REGISTER CENTRAL CONNECTION
                 * =====================================
                 *
                 * IMPORTANT:
                 *
                 * websocket.server.js no longer
                 * maintains its own agent registry.
                 *
                 * websocket.connection.js is the
                 * single connection lifecycle handler.
                 */
                const actorId =actorType === "AGENT"
                    ? auth.agentId
                    : auth.externalUserId;
                
                const connectionId =await registerConnection({
                        socket: ws,
                        actorType,
                        actorId,
                        companyId
                    });                 

                // const connectionId =await registerConnection({
                //         socket: ws,
                //         actorType:"AGENT",
                //         actorId:agentId,
                //         companyId
                //     });

                /*
                 * Store connection ID on socket.
                 *
                 * Useful for debugging and future
                 * connection/session operations.
                 */

                ws.connectionId =connectionId;

                if (actorType === "USER") {
                registry.attachSession(
                    connectionId,
                    auth.sessionId);
                }
                 
                publisher.send(ws,EVENT.CONNECTION_READY,{
                    connectionId,
                    actorType,
                    companyId,
                    ...(actorType === "AGENT"
                        ? {agentId:auth.agentId}
                        : {
                            sessionId:auth.sessionId,
                            externalUserId:auth.externalUserId
                        })
                    }
                );
                /*
                 * =====================================
                 * HEARTBEAT
                 * =====================================
                 */

                ws.isAlive =true;

                // ws.on("pong",() => {
                //         ws.isAlive =true;
                //     }
                // );

                /*
                 * =====================================
                 * CONNECTION READY
                 * =====================================
                 *
                 * websocket.connection.js already
                 * sends webrtc.ready.
                 *
                 * Here we only send the general
                 * connection.ready event.
                 */
                

                // publisher.send(ws,EVENT.CONNECTION_READY,
                //     {
                //         connectionId,
                //         actorType:"AGENT",
                //         agentId,
                //         companyId
                //     }
                // );

                if (actorType === "AGENT") {
                    console.log(
                        `[WS] Agent connected ` +
                        `agent=${auth.agentId} ` +
                        `company=${auth.companyId} ` +
                        `connection=${connectionId}`
                    );

                } else {

                    console.log(
                        `[WS] User connected ` +
                        `user=${auth.externalUserId} ` +
                        `session=${auth.sessionId} ` +
                        `company=${auth.companyId} ` +
                        `connection=${connectionId}`
                    );
                }

            } catch (error) {
                console.error("[WS CONNECTION ERROR]",error);
                try {
                    ws.close(1011,"WebSocket initialization failed");
                } catch (closeError) {
                    console.error("[WS CLOSE ERROR]",closeError);
                }
            }
        }
    );

    /*
     * =========================================
     * SERVER HEARTBEAT
     * =========================================
     *
     * Detect dead WebSocket connections.
     */

    const interval =setInterval(() => {
                wss.clients.forEach(ws => {
                        if (ws.isAlive === false) {
                            console.log("[WS] Terminating dead connection");
                            ws.terminate();
                            return;
                        }
                        ws.isAlive =false;
                        ws.ping();
                    }
                );
            },
            15000
        );

    /*
     * =========================================
     * SERVER CLOSE
     * =========================================
     */

    wss.on("close",() => {
            clearInterval(interval);
        });
    return wss;
}


module.exports = {
    setupWebSocketServer
};