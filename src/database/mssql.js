const sql = require("mssql");
const env = require("../config/env");

const config = {
    server: env.mssql.server,
    port: env.mssql.port,
    database: env.mssql.database,
    user: env.mssql.user,
    password: env.mssql.password,

    options: {
        encrypt: env.mssql.encrypt,
        trustServerCertificate: env.mssql.trustServerCertificate
    },

    pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000
    },

    requestTimeout: 30000,
    connectionTimeout: 10000
};

let poolPromise = null;

async function getPool() {
    if (!poolPromise) {
        poolPromise = sql.connect(config);
    }

    return poolPromise;
}

async function closeDatabase() {
    if (poolPromise) {
        const pool = await poolPromise;
        await pool.close();
        poolPromise = null;
    }
}

module.exports = {
    sql,
    getPool,
    closeDatabase
};