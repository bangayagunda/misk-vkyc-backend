const {redis} = require("../../database/redis");

function queueKey(companyId) {
    return `company:${companyId}:kyc_queue`;
}

async function enqueue(
    companyId,
    sessionId
) {
    await redis.rPush(
        queueKey(companyId),
        sessionId
    );
    return {
        queued: true
    };
}

async function remove(companyId,sessionId) {
    await redis.lRem(
        queueKey(companyId),
        0,
        sessionId
    );
}

async function size(companyId) {
    return redis.lLen(
        queueKey(companyId)
    );
}

async function peek(companyId) {
    return redis.lIndex(
        queueKey(companyId),
        0
    );
}

async function dequeue(companyId) {
    return redis.lPop(
        queueKey(companyId)
    );
}


module.exports = {
    queueKey,
    enqueue,
    remove,
    size,
    peek,
    dequeue
};