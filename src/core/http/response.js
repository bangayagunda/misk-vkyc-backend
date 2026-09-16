function json(res, statusCode, data) {
    res.statusCode = statusCode;

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    res.end(JSON.stringify(data));
}

function success(res, data, statusCode = 200) {
    return json(res, statusCode, {
        success: true,
        data
    });
}

function error(
    res,
    statusCode,
    code,
    message
) {
    return json(res, statusCode, {
        success: false,
        error: {
            code,
            message
        }
    });
}

module.exports = {
    json,
    success,
    error
};