class InMemoryDb {
    constructor() {
        this.users = new Map();
        this.events = new Map();
        this.userEvents = new Map();
    }

    // Add methods to interact with the data structures
    static getInstance() {
        if (!InMemoryDb.instance) {
            InMemoryDb.instance = new InMemoryDb();
        }
        return InMemoryDb.instance;
    }
}

module.exports = InMemoryDb.getInstance();