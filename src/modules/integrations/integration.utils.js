function parseJson(
    value,
    fallback = null
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    if (
        typeof value === "object"
    ) {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}


function getByPath(
    object,
    path
) {
    if (
        !object ||
        !path
    ) {
        return undefined;
    }

    const parts =
        path.split(".")
            .filter(Boolean);

    let current = object;

    for (
        const part of parts
    ) {
        if (
            current === null ||
            current === undefined
        ) {
            return undefined;
        }

        current =
            current[part];
    }

    return current;
}


function replaceTemplate(
    template,
    data
) {
    if (
        template === null ||
        template === undefined
    ) {
        return template;
    }

    if (
        typeof template === "string"
    ) {
        return template.replace(
            /\{\{\s*([^}]+)\s*\}\}/g,
            (_, path) => {
                const value =
                    getByPath(
                        data,
                        path.trim()
                    );

                return value === undefined ||
                    value === null
                    ? ""
                    : String(value);
            }
        );
    }


    if (
        Array.isArray(template)
    ) {
        return template.map(
            item =>
                replaceTemplate(
                    item,
                    data
                )
        );
    }


    if (
        typeof template === "object"
    ) {
        const result = {};

        for (
            const [
                key,
                value
            ] of Object.entries(template)
        ) {
            result[key] =
                replaceTemplate(
                    value,
                    data
                );
        }

        return result;
    }


    return template;
}


function applyResponseMapping(
    response,
    mapping
) {
    if (
        !mapping ||
        typeof mapping !== "object"
    ) {
        return response;
    }

    const result = {};

    for (
        const [
            outputKey,
            sourcePath
        ] of Object.entries(mapping)
    ) {
        result[outputKey] =
            getByPath(
                response,
                sourcePath
            );
    }

    return result;
}


module.exports = {
    parseJson,
    getByPath,
    replaceTemplate,
    applyResponseMapping
};