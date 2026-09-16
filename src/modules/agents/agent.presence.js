const { redis } = require("../../database/redis");

const PRESENCE_TTL = 30;

function statusKey(agentId) {
    return `agent:${agentId}:status`;
}

function heartbeatKey(agentId) {
    return `agent:${agentId}:heartbeat`;
}

function companyAgentsKey(companyId) {
    return `company:${companyId}:agents`;
}

function companyFreeAgentsKey(companyId) {
    return `company:${companyId}:free_agents`;
}

function kycAgentLockKey(agentId) {
    return `agent:${agentId}:kyc_lock`;
}


/*
 * =========================================
 * AGENT ONLINE
 * =========================================
 */

async function setOnline(
    agentId,
    companyId,
    priority = 0
) {
    const now = Date.now();

    const score =
        now -
        (Number(priority) * 1000000);

    await redis
        .multi()
        .set(statusKey(agentId), "FREE", { EX: PRESENCE_TTL })
        .set(heartbeatKey(agentId), now.toString(), { EX: PRESENCE_TTL })
        .sAdd(companyAgentsKey(companyId), agentId)
        .zAdd(companyFreeAgentsKey(companyId), { score, value: agentId })
        .exec();

    // An agent becoming FREE is also a queue-processing trigger.
    // Without this, WAITING customers remain in Redis until another
    // unrelated event happens.
    setImmediate(async () => {
        try {
            const processor = require("../kyc/kyc.queue.processor");
            await processor.processCompanyQueue(companyId);
        } catch (error) {
            console.error("[KYC QUEUE PROCESSOR]", error);
        }
    });

    return { status: "FREE", timestamp: now };
}


/*
 * =========================================
 * HEARTBEAT
 * =========================================
 */

async function heartbeat(
    agentId,
    companyId
) {
    const currentStatus =
        await redis.get(
            statusKey(agentId)
        );

    if (!currentStatus) {
        return {
            status: "OFFLINE"
        };
    }

    const now = Date.now();

    const multi =
        redis.multi();

    multi.expire(statusKey(agentId), PRESENCE_TTL);
    if (currentStatus === "BUSY") {
        // Keep the assignment lock alive for the duration of a long KYC call.
        multi.expire(kycAgentLockKey(agentId), PRESENCE_TTL);
    }

    multi.set(
        heartbeatKey(agentId),
        now.toString(),
        {
            EX: PRESENCE_TTL
        }
    );

    if (currentStatus === "FREE") {
        multi.zAdd(
            companyFreeAgentsKey(companyId),
            {
                score: now,
                value: agentId
            }
        );
    }

    await multi.exec();

    return {
        status: currentStatus,
        timestamp: now
    };
}


/*
 * =========================================
 * AGENT OFFLINE
 * =========================================
 */

async function setOffline(
    agentId,
    companyId
) {
    await redis
        .multi()
        .del(
            statusKey(agentId)
        )
        .del(
            heartbeatKey(agentId)
        )
        .sRem(
            companyAgentsKey(companyId),
            agentId
        )
        .zRem(
            companyFreeAgentsKey(companyId),
            agentId
        )
        .del(
            kycAgentLockKey(agentId)
        )
        .exec();

    return {
        status: "OFFLINE"
    };
}


/*
 * =========================================
 * GET AGENT STATUS
 * =========================================
 */

async function getStatus(agentId) {
    const status =
        await redis.get(
            statusKey(agentId)
        );

    return status || "OFFLINE";
}


/*
 * =========================================
 * SET AGENT BUSY
 * =========================================
 */

async function setBusy(
    agentId,
    sessionId,
    companyId
) {
    const script = `
        local statusKey = KEYS[1]
        local freeAgentsKey = KEYS[2]
        local lockKey = KEYS[3]

        local expectedSession = ARGV[1]
        local ttl = tonumber(ARGV[2])
        local agentId = ARGV[3]

        local status =
            redis.call(
                'GET',
                statusKey
            )

        if status ~= 'FREE' then
            return 0
        end

        local lock =
            redis.call(
                'GET',
                lockKey
            )

        if lock then
            return 0
        end

        redis.call(
            'SET',
            lockKey,
            expectedSession,
            'EX',
            ttl
        )

        redis.call(
            'SET',
            statusKey,
            'BUSY',
            'EX',
            ttl
        )

        redis.call(
            'ZREM',
            freeAgentsKey,
            agentId
        )

        return 1
    `;

    const result =
        await redis.eval(
            script,
            {
                keys: [
                    statusKey(agentId),
                    companyFreeAgentsKey(companyId),
                    kycAgentLockKey(agentId)
                ],
                arguments: [
                    sessionId,
                    PRESENCE_TTL.toString(),
                    agentId
                ]
            }
        );

    return result === 1;
}


/*
 * =========================================
 * RESTORE AGENT BUSY STATE
 * =========================================
 *
 * Used when an Agent reconnects to the
 * same KYC session.
 *
 * We must NOT put the Agent back into
 * FREE state.
 */

async function restoreBusy(
    agentId,
    companyId,
    sessionId
) {
    const lockKey =
        kycAgentLockKey(agentId);

    await redis
        .multi()
        .set(
            statusKey(agentId),
            "BUSY",
            {
                EX: PRESENCE_TTL
            }
        )
        .set(
            heartbeatKey(agentId),
            Date.now().toString(),
            {
                EX: PRESENCE_TTL
            }
        )
        .sAdd(
            companyAgentsKey(companyId),
            agentId
        )
        .zRem(
            companyFreeAgentsKey(companyId),
            agentId
        )
        .set(
            lockKey,
            sessionId,
            {
                EX: PRESENCE_TTL
            }
        )
        .exec();

    return {
        status: "BUSY",
        sessionId
    };
}


/*
 * =========================================
 * SET AGENT FREE
 * =========================================
 */

async function setFree(
    agentId,
    companyId,
    priority = 0
) {
    const now = Date.now();

    const lockKey =
        kycAgentLockKey(agentId);

    await redis
        .multi()
        .del(lockKey)
        .set(
            statusKey(agentId),
            "FREE",
            {
                EX: PRESENCE_TTL
            }
        )
        .set(
            heartbeatKey(agentId),
            now.toString(),
            {
                EX: PRESENCE_TTL
            }
        )
        .sAdd(
            companyAgentsKey(companyId),
            agentId
        )
        .zAdd(
            companyFreeAgentsKey(companyId),
            {
                score:
                    now -
                    (
                        Number(priority) *
                        1000000
                    ),
                value: agentId
            }
        )
        .exec();

    return {
        status: "FREE"
    };
}


/*
 * =========================================
 * KYC RECONNECT
 * =========================================
 *
 * Agent aur User ke reconnect markers
 * independent rahenge.
 *
 * Example:
 *
 * kyc:session:{sessionId}:reconnect:AGENT:{agentId}
 * kyc:session:{sessionId}:reconnect:USER:{externalUserId}
 */

const RECONNECT_GRACE_TTL = 30;

function reconnectKey(
    sessionId,
    actorType,
    actorId
) {
    return (
        `kyc:session:${sessionId}` +
        `:reconnect:${actorType}:${actorId}`
    );
}


/*
 * =========================================
 * MARK RECONNECTING
 * =========================================
 */

async function markReconnecting({
    sessionId,
    actorType,
    actorId,
    previousStatus
}) {

    if (
        !sessionId ||
        !actorType ||
        !actorId
    ) {
        throw new Error(
            "Invalid reconnect parameters"
        );
    }

    const key = reconnectKey(
        sessionId,
        actorType,
        actorId
    );

    await redis.set(
        key,
        JSON.stringify({
            sessionId,
            actorType,
            actorId,
            previousStatus,
            disconnectedAt: Date.now()
        }),
        {
            EX: RECONNECT_GRACE_TTL
        }
    );

    console.log(
        `[KYC RECONNECT MARKED] ` +
        `session=${sessionId} ` +
        `actor=${actorType}:${actorId} ` +
        `previousStatus=${previousStatus}`
    );

    return true;
}


/*
 * =========================================
 * GET RECONNECTING
 * =========================================
 */

async function getReconnecting({
    sessionId,
    actorType,
    actorId
}) {
    const value =
        await redis.get(
            reconnectKey(
                sessionId,
                actorType,
                actorId
            )
        );

    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}


/*
 * =========================================
 * CLEAR RECONNECTING
 * =========================================
 */

async function clearReconnecting({
    sessionId,
    actorType,
    actorId
}) {
    await redis.del(
        reconnectKey(
            sessionId,
            actorType,
            actorId
        )
    );

    return true;
}


/*
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports = {
    PRESENCE_TTL,
    RECONNECT_GRACE_TTL,

    statusKey,
    heartbeatKey,
    companyAgentsKey,
    companyFreeAgentsKey,
    kycAgentLockKey,

    setOnline,
    heartbeat,
    setOffline,
    getStatus,
    setBusy,
    setFree,

    markReconnecting,
    reconnectKey,
    getReconnecting,
    clearReconnecting
};