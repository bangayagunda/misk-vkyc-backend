const queue =require("./kyc.queue");
const matcher =require("./kyc.matcher");
const repository =require("./kyc.repository");
const agentRepository =require("../agents/agent.repository");
const {redis} = require("../../database/redis");
const PROCESSOR_LOCK_TTL = 15;

const publisher =require("../../realtime/websocket.publisher");
const {EVENT} = require("../../realtime/websocket.events");
const assignmentService =require("./kyc.assignment.service");

/*
 * One processor per company at a time.
 *
 * This is important because:
 *
 * Agent FREE
 *       ↓
 * multiple events
 *       ↓
 * processor
 *
 * We don't want 5 processors fighting
 * over the same queue.
 */
function processorLockKey(companyId) {
    return `company:${companyId}:kyc_queue_processor_lock`;
}

async function acquireProcessorLock(companyId) {
    const key =processorLockKey(companyId);
    const token =`${process.pid}:${Date.now()}:${Math.random()}`;
    const result =await redis.set(key,token,
            {
                NX: true,
                EX: PROCESSOR_LOCK_TTL
            }
        );

    if (result !== "OK") {
        return null;
    }
    return {key,token};
}


async function releaseProcessorLock(lock) {
    if (!lock) {
        return;
    }
    const script = `
        if redis.call(
            'GET',
            KEYS[1]
        ) == ARGV[1]
        then
            return redis.call(
                'DEL',
                KEYS[1]
            )
        end

        return 0
    `;

    await redis.eval(script,
        {
            keys: [
                lock.key
            ],
            arguments: [
                lock.token
            ]
        }
    );
}


/*
 * Process one company queue.
 */
async function processCompanyQueue(companyId) {
    const lock =await acquireProcessorLock(
            companyId
        );
    /*
     * Another worker is already
     * processing this company.
     */
    if (!lock) {
        return {
            processed: false,
            reason: "PROCESSOR_BUSY"
        };
    }
    let assignedCount = 0;
    try {
        /*
         * Keep assigning while:
         *
         * queue has requests
         * AND
         * free agents exist
         */
        while (true) {
            const sessionId =
                await queue.peek(
                    companyId
                );
            /*
             * Queue empty.
             */
            if (!sessionId) {
                break;
            }

            /*
             * Atomically claim an agent.
             */
            const agentId =
                await matcher.acquireAgent(
                    companyId,
                    sessionId
                );

            /*
             * No free agent.
             */
            if (!agentId) {
                break;
            }

            /*
             * Verify the agent still belongs
             * to this company and is active.
             */
            const agent =await agentRepository
                    .findActiveAgent(
                        agentId,
                        companyId
                    );

            if (!agent) {
                /*
                 * Something became invalid between
                 * Redis and DB.
                 *
                 * Don't leave agent locked.
                 */
                await matcher.releaseAgent(
                    companyId,
                    agentId,
                    0,
                    sessionId
                );
                continue;
            }

            /*
             * Check that queue item still exists
             * and session is still WAITING.
             */
            const session =await repository
                    .findWaitingSession(
                        sessionId,
                        companyId
                    );
            if (!session) {
                /*
                 * Stale/cancelled queue entry.
                 */
                await queue.remove(
                    companyId,
                    sessionId
                );
                await matcher.releaseAgent(
                    companyId,
                    agentId,
                    agent.priority,
                    sessionId
                );
                continue;
            }
            /*
             * Persist assignment.
             *
             * WHERE status = WAITING
             * protects against duplicate assignment.
             */
            const assigned =
                await repository.assignAgent({
                    sessionId,
                    companyId,
                    agentId
                });
            if (!assigned) {
                /*
                 * DB rejected assignment.
                 */
                await matcher.releaseAgent(
                    companyId,
                    agentId,
                    agent.priority,
                    sessionId
                );
                continue;
            }
            /*
             * Only remove from queue after
             * DB assignment succeeded.
             */
            await queue.dequeue(
                companyId
            );
            assignedCount++;
            // publisher.sendToAgent(
            //     agentId,
            //     EVENT.KYC_ASSIGNED,
            //     {
            //         sessionId:session.id,
            //         sessionCode:session.session_code,
            //         externalUserId:session.external_user_id,
            //         clientReference:session.client_reference,
            //         metadata:session.metadata_json
            //                 ? JSON.parse(
            //                     session.metadata_json
            //                 )
            //                 : null,
            //         assignedAt:new Date().toISOString()
            //     }
            // );
            assignmentService.notifyAgentAssigned({
                agentId,
                session
            });

            assignmentService.notifyUserRinging({
                sessionId,
                session: {
                    ...session,
                    assigned_agent_id:agentId
                }
            });
            /*
             * Important:
             *
             * We DO NOT immediately emit WebSocket
             * here.
             *
             * Next module will publish:
             *
             * kyc.assigned
             *
             * to the exact agent.
             */
        }
        return {
            processed: true,
            assignedCount
        };
    } finally {
        await releaseProcessorLock(lock);
    }
}

module.exports = {
    processCompanyQueue
};