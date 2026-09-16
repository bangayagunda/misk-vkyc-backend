const publisher =
    require("../../realtime/websocket.publisher");

const {
    EVENT
} =
    require("../../realtime/websocket.events");


function notifyAgentAssigned({
    agentId,
    session
}) {

    return publisher.sendToAgent(
        agentId,
        EVENT.KYC_ASSIGNED,
        {
            sessionId:
                session.id,

            sessionCode:
                session.session_code,

            externalUserId:
                session.external_user_id,

            clientReference:
                session.client_reference ||
                null,

            metadata:
                session.metadata_json
                    ? JSON.parse(
                        session.metadata_json
                    )
                    : null,

            assignedAt:
                new Date().toISOString()
        }
    );
}


function notifyUserRinging({
    sessionId,
    session
}) {

    return publisher.sendToSession(
        sessionId,
        EVENT.KYC_RINGING,
        {
            sessionId:
                session.id,

            sessionCode:
                session.session_code,

            status:
                "RINGING",

            assignedAgentId:
                session.assigned_agent_id,

            ringingAt:
                new Date().toISOString()
        }
    );
}


module.exports = {
    notifyAgentAssigned,
    notifyUserRinging
};