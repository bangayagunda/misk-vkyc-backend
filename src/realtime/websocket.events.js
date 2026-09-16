const EVENT = Object.freeze({

    /*
     * Connection
     */
    CONNECTION_READY:
        "connection.ready",

    PING:
        "ping",

    PONG:
        "pong",

    ERROR:
        "error",


    /*
     * Agent
     */
    AGENT_ONLINE:
        "agent.online",

    AGENT_OFFLINE:
        "agent.offline",

    AGENT_STATUS:
        "agent.status",


    /*
     * KYC
     */
    KYC_ASSIGNED:
        "kyc.assigned",

    KYC_CANCELLED:
        "kyc.cancelled",

    KYC_TIMEOUT:
        "kyc.timeout",

    KYC_UPDATED:
        "kyc.updated",

    KYC_RINGING:
        "kyc.ringing",
    
    KYC_ACCEPT:
        "kyc.accept",

    KYC_REJECT:
        "kyc.reject",

    KYC_ACCEPTED:
        "kyc.accepted",

    KYC_REJECTED:
        "kyc.rejected",

    KYC_CONNECTED:
        "kyc.connected",

    KYC_COMPLETED:
        "kyc.completed",

    /*
    * Final KYC Decision
    */
    KYC_APPROVE:
        "kyc.approve",

    KYC_REJECT_FINAL:
        "kyc.reject.final",

    KYC_APPROVED:
        "kyc.approved",

    KYC_REJECTED_FINAL:
        "kyc.rejected.final",    

    /**
     * call */    
    CALL_CONNECT:
    "call.connect",

    CALL_CONNECTED:
        "call.connected",

    CALL_START:
        "call.start",

    CALL_ENDED:
        "call.ended",
});


module.exports = {
    EVENT
};