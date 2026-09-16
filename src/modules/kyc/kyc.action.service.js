const repository =require("./kyc.action.repository");

async function getActionsForAgent(companyId) {
    const actions =await repository.getCompanyActions(
            companyId
        );

    return actions.map(
        action => ({
            code:
                action.action_code,

            label:
                action.action_label,

            description:
                action.action_description,

            type:
                action.action_type,

            sortOrder:
                action.sort_order
        })
    );
}


module.exports = {
    getActionsForAgent
};