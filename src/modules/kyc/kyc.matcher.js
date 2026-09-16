const {redis} = require("../../database/redis");

const {
    PRESENCE_TTL,
    statusKey,
    companyFreeAgentsKey,
    kycAgentLockKey
} = require("../agents/agent.presence");


/*
 * Atomically:
 *
 * 1. Get first candidate
 * 2. Remove candidate from FREE set
 * 3. Verify status == FREE
 * 4. Verify no existing KYC lock
 * 5. Set BUSY
 * 6. Create session lock
 *
 * Everything happens inside ONE Redis Lua execution.
 */
const MATCH_SCRIPT = `
local freeKey = KEYS[1]

local candidate = redis.call(
    'ZRANGE',
    freeKey,
    0,
    0
)[1]

if not candidate then
    return nil
end

local statusKeyName =
    'agent:' .. candidate .. ':status'

local lockKeyName =
    'agent:' .. candidate .. ':kyc_lock'

local status =
    redis.call(
        'GET',
        statusKeyName
    )

if status ~= 'FREE' then

    redis.call(
        'ZREM',
        freeKey,
        candidate
    )

    return 'STALE'

end

local existingLock =
    redis.call(
        'GET',
        lockKeyName
    )

if existingLock then

    redis.call(
        'ZREM',
        freeKey,
        candidate
    )

    return 'STALE'

end

redis.call(
    'ZREM',
    freeKey,
    candidate
)

redis.call(
    'SET',
    statusKeyName,
    'BUSY',
    'EX',
    ARGV[2]
)

redis.call(
    'SET',
    lockKeyName,
    ARGV[1],
    'EX',
    ARGV[2]
)

return candidate
`;


async function acquireAgent(
    companyId,
    sessionId
) {
    const freeKey =companyFreeAgentsKey(companyId);
    /*
     * Retry a few stale candidates.
     */
    for (let attempt = 0; attempt < 10; attempt++) {
        const result =await redis.eval(MATCH_SCRIPT,
                {
                    keys: [
                        freeKey
                    ],

                    arguments: [
                        sessionId,
                        String(PRESENCE_TTL)
                    ]
                }
            );

        if (!result) {
            return null;
        }
        if (result === "STALE") {
            continue;
        }
        return result;
    }
    return null;
}


async function releaseAgentOld(
    companyId,
    agentId,
    priority = 0
) {
    const now =Date.now();
    const score =now -(Number(priority) *1000000);
    await redis.multi()
        .del(kycAgentLockKey(
                agentId)
        ).set(statusKey(agentId),
            "FREE",
            {
                EX: PRESENCE_TTL
            }
        ).zAdd(companyFreeAgentsKey(companyId),
            {
                score,
                value: agentId
            }
        ).exec();
}

async function releaseAgent(companyId, agentId, priority = 0, expectedSessionId = null) {
    const now = Date.now();
    const score = now - (Number(priority) * 1000000);
    const lockKey = kycAgentLockKey(agentId);
    const freeKey = companyFreeAgentsKey(companyId);
    const status = statusKey(agentId);

    // A stale completion must never free an agent that has already
    // been assigned to a new session. If a session id is supplied,
    // the Redis lock must still belong to that exact session.
    const script = `
        local lock = redis.call('GET', KEYS[1])
        local expected = ARGV[1]
        if expected ~= '' and lock ~= expected then
            return 0
        end
        redis.call('DEL', KEYS[1])
        redis.call('SET', KEYS[2], 'FREE', 'EX', ARGV[3])
        redis.call('ZADD', KEYS[3], ARGV[2], ARGV[4])
        return 1
    `;
    const result = await redis.eval(script, {
        keys: [lockKey, status, freeKey],
        arguments: [expectedSessionId || '', String(score), String(PRESENCE_TTL), agentId]
    });

    if (result === 1) {
        setImmediate(async () => {
            try {
                const processor = require("./kyc.queue.processor");
                await processor.processCompanyQueue(companyId);
            } catch (error) {
                console.error("[KYC QUEUE PROCESSOR]", error);
            }
        });
    }
    return result === 1;
}


module.exports = {
    acquireAgent,
    releaseAgent
};