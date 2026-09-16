class ConnectionRegistry {
    constructor() {
        this.connections = new Map();
    }
    add({connectionId,socket,actorType,actorId,companyId}) {
        const connection = {
            connectionId,
            socket,
            actorType,
            actorId,
            companyId,
            sessionId: null,
            connectedAt: Date.now()
        };
        this.connections.set(connectionId,connection);
        return connection;
        // this.connections.set(connectionId,{
        //         connectionId,
        //         socket,
        //         actorType,
        //         actorId,
        //         companyId,
        //         sessionId: null,
        //         connectedAt:
        //             Date.now()
        //     }
        // );
    }
    remove(connectionId) {
        this.connections.delete(connectionId);
    }

    get(connectionId) {
        return this.connections.get(connectionId);
    }

    attachSession(connectionId,sessionId) {
        const connection =this.get(connectionId);
        if (!connection) {
            return false;
        }
        connection.sessionId =sessionId;
        return true;
    }


    getSessionConnections(sessionId) {
        const result = [];
        for (const connection of this.connections.values()) {
            if (String(connection.sessionId) ===String(sessionId)) {
                result.push(connection);
            }
        }
        return result;
    }

    getCompanyConnections(companyId) {
        const result = [];
        for (const connection of this.connections.values()) {
            if (String(connection.companyId) === String(companyId)) result.push(connection);
        }
        return result;
    }

    getActor( actorType,actorId) {
        for (const connection of this.connections.values()) {
            if ( connection.actorType ===actorType &&
                String(connection.actorId) === String(actorId)) {
                return connection;
            }
        }
        return null;
    }
}


const registry =new ConnectionRegistry();
module.exports =registry;