require("dotenv").config();

function required(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const env = {
    nodeEnv: process.env.NODE_ENV || "development",

    host: process.env.HOST || "0.0.0.0",

    port: Number(process.env.PORT || 8080),

    mssql: {
        server: required("MSSQL_SERVER"),
        port: Number(process.env.MSSQL_PORT || 1433),
        database: required("MSSQL_DATABASE"),
        user: required("MSSQL_USER"),
        password: required("MSSQL_PASSWORD"),
        encrypt: process.env.MSSQL_ENCRYPT === "true",
        trustServerCertificate:
            process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== "false"
    },

    redis: {
        url: required("REDIS_URL")
    },

    jwt: {
        accessSecret: required("JWT_ACCESS_SECRET"),
        refreshSecret: required("JWT_REFRESH_SECRET"),
        accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
        refreshExpires: process.env.JWT_REFRESH_EXPIRES || "30d"
    },

    kycUserWs: {
        secret:required("KYC_USER_WS_SECRET"),
        expires:process.env.KYC_USER_WS_EXPIRES || "10m"
    },

    logLevel: process.env.LOG_LEVEL || "info"
};

module.exports = env;