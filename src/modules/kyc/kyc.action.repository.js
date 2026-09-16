const {
    getPool,
    sql
} = require("../../database/mssql");


async function getCompanyActions(
    companyId
) {
    const pool =
        await getPool();

    const request =
        pool.request();

    request.input(
        "companyId",
        sql.UniqueIdentifier,
        companyId
    );

    const result =
        await request.query(`
            SELECT
                id,
                company_id,
                action_code,
                action_label,
                action_description,
                action_type,
                sort_order,
                enabled,
                requires_callback
            FROM kyc_actions
            WHERE
                company_id = @companyId
                AND enabled = 1
            ORDER BY
                sort_order ASC,
                action_label ASC
        `);

    return result.recordset;
}


async function getActionByCode(
    companyId,
    actionCode
) {
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
        "actionCode",
        sql.VarChar(100),
        actionCode
    );

    const result =
        await request.query(`
            SELECT
                id,
                company_id,
                action_code,
                action_label,
                action_description,
                action_type,
                sort_order,
                enabled,
                requires_callback
            FROM kyc_actions
            WHERE
                company_id = @companyId
                AND action_code = @actionCode
                AND enabled = 1
        `);

    return result.recordset[0] || null;
}


module.exports = {
    getCompanyActions,
    getActionByCode
};