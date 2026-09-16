const {
    getPool,
    sql
} = require("../../database/mssql");


/*
 * =========================================
 * AUDIT LOGGER
 * =========================================
 *
 * Generic platform audit logger.
 *
 * IMPORTANT:
 * Audit failure should NOT break the main
 * business operation.
 */

async function writeAudit({
    companyId = null,
    actorUserId = null,
    actorType,
    action,
    entityType = null,
    entityId = null,
    ipAddress = null,
    userAgent = null,
    details = null
}) {

    if (!actorType) {
        throw new Error(
            "AUDIT_ACTOR_TYPE_REQUIRED"
        );
    }

    if (!action) {
        throw new Error(
            "AUDIT_ACTION_REQUIRED"
        );
    }

    let detailsJson = null;

    if (details !== null) {

        try {

            detailsJson =
                JSON.stringify(details);

        } catch (error) {

            detailsJson =
                JSON.stringify({
                    auditSerializationError:
                        true
                });
        }
    }

    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    request.input(
        "actorUserId",
        sql.UniqueIdentifier,
        actorUserId
    );

    request.input(
        "actorType",
        sql.VarChar(30),
        actorType
    );

    request.input(
        "action",
        sql.VarChar(100),
        action
    );

    request.input(
        "entityType",
        sql.VarChar(100),
        entityType
    );

    request.input(
        "entityId",
        sql.VarChar(100),
        entityId
    );

    request.input(
        "ipAddress",
        sql.VarChar(64),
        ipAddress
    );

    request.input(
        "userAgent",
        sql.NVarChar(1000),
        userAgent
    );

    request.input(
        "detailsJson",
        sql.NVarChar(sql.MAX),
        detailsJson
    );

    await request.query(`
        INSERT INTO audit_logs
        (
            company_id,
            actor_user_id,
            actor_type,
            action,
            entity_type,
            entity_id,
            ip_address,
            user_agent,
            details_json
        )
        VALUES
        (
            @companyId,
            @actorUserId,
            @actorType,
            @action,
            @entityType,
            @entityId,
            @ipAddress,
            @userAgent,
            @detailsJson
        )
    `);

    return true;
}


/*
 * =========================================
 * SAFE AUDIT
 * =========================================
 *
 * Audit must never break KYC/call flow.
 */

async function safeAudit(payload) {

    try {

        await writeAudit(
            payload
        );

    } catch (error) {

        console.error(
            "[AUDIT LOG ERROR]",
            {
                action:
                    payload &&
                    payload.action,

                entityType:
                    payload &&
                    payload.entityType,

                entityId:
                    payload &&
                    payload.entityId,

                error:
                    error.message
            }
        );
    }
}


module.exports = {
    writeAudit,
    safeAudit
};