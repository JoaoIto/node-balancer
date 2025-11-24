"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const mongodb_1 = require("mongodb");
const logger_1 = require("../middlewares/logger");
class ConnectionManager {
    constructor(opts) {
        var _a;
        this.primaryClient = null;
        this.primaryDb = null;
        this.nodes = [];
        this.replicaUri = opts.replicaUri;
        this.nodes = (opts.nodes || []).map((u, i) => ({ uri: u, name: `node${i + 1}` }));
        this.dbName = opts.dbName || 'node-balancer';
        this.healthCheckIntervalMs = (_a = opts.healthCheckIntervalMs) !== null && _a !== void 0 ? _a : 5000;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('ConnectionManager: init() starting');
            // First try replica uri if provided (let driver handle replica set)
            if (this.replicaUri) {
                logger_1.logger.info(`Trying replica URI: ${this.replicaUri}`);
                try {
                    const c = new mongodb_1.MongoClient(this.replicaUri, { monitorCommands: true });
                    yield c.connect();
                    const isWritable = yield this.checkWritable(c);
                    if (isWritable) {
                        logger_1.logger.info('Connected to replicaSet URI and found writable primary.');
                        this.attachClient(c);
                        this.startHealthChecks();
                        return;
                    }
                    else {
                        logger_1.logger.warn('Replica URI connected but did not find writable primary. Closing.');
                        yield c.close();
                    }
                }
                catch (err) {
                    logger_1.logger.warn(`Replica URI connect failed: ${err.message}`);
                }
            }
            // Fallback: iterate nodes and find a writable node
            for (const n of this.nodes) {
                logger_1.logger.info(`Trying node ${n.uri}`);
                try {
                    const c = new mongodb_1.MongoClient(n.uri, { directConnection: true, monitorCommands: true });
                    yield c.connect();
                    const writable = yield this.checkWritable(c);
                    if (writable) {
                        logger_1.logger.info(`Found writable node at ${n.uri}`);
                        this.attachClient(c);
                        this.startHealthChecks();
                        return;
                    }
                    else {
                        yield c.close();
                    }
                }
                catch (err) {
                    logger_1.logger.warn(`Node connect failed ${n.uri}: ${err.message}`);
                }
            }
            throw new Error('No writable MongoDB node found. Check your nodes/replica set.');
        });
    }
    attachClient(client) {
        this.primaryClient = client;
        this.primaryDb = client.db(this.dbName);
        // register monitoring events on the client
        client.on('topologyDescriptionChanged', (td) => {
            logger_1.logger.info(`topologyDescriptionChanged: ${JSON.stringify(this.summarizeTopology(td))}`);
            this.recordEvent('topologyDescriptionChanged', { td: this.summarizeTopology(td) }).catch(() => { });
        });
        client.on('serverHeartbeatFailed', (event) => {
            logger_1.logger.warn(`serverHeartbeatFailed: ${JSON.stringify(event)}`);
            this.recordEvent('serverHeartbeatFailed', { event }).catch(() => { });
        });
        client.on('serverHeartbeatSucceeded', (event) => {
            logger_1.logger.debug(`serverHeartbeatSucceeded: ${JSON.stringify(event)}`);
        });
        client.on('close', () => {
            logger_1.logger.warn('MongoClient close event');
            this.recordEvent('clientClose', {}).catch(() => { });
        });
        logger_1.logger.info('Primary client attached.');
    }
    summarizeTopology(td) {
        // gentle summary - driver topologyDescription shape may vary
        try {
            return {
                servers: Object.keys(td.servers || {}).map((k) => ({
                    addr: k,
                    type: td.servers[k].type,
                })),
            };
        }
        catch (_a) {
            return { raw: td };
        }
    }
    checkWritable(client) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const admin = client.db('admin');
                // isWritablePrimary command is supported
                const res = yield admin.command({ isWritablePrimary: 1 }).catch(() => null);
                if (res && res.isWritablePrimary)
                    return true;
                // fallback: isMaster / hello
                const info = yield admin.command({ hello: 1 }).catch(() => null);
                if (info && (info.isWritablePrimary || info.isWritablePrimary === true))
                    return true;
                // if driver can't tell, assume writable if connected and write to a temp collection test (careful)
                return false;
            }
            catch (err) {
                logger_1.logger.warn('checkWritable error: ' + err.message);
                return false;
            }
        });
    }
    recordEvent(type, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.primaryDb)
                    return;
                yield this.primaryDb.collection('logs').insertOne({
                    ts: new Date(),
                    level: 'event',
                    type,
                    payload,
                });
            }
            catch (err) {
                logger_1.logger.warn('recordEvent failed: ' + err.message);
            }
        });
    }
    startHealthChecks() {
        if (this.healthInterval)
            clearInterval(this.healthInterval);
        this.healthInterval = setInterval(() => this.healthCheckLoop().catch(err => logger_1.logger.warn('healthCheck error: ' + err.message)), this.healthCheckIntervalMs);
        logger_1.logger.info('Started health checks.');
    }
    healthCheckLoop() {
        return __awaiter(this, void 0, void 0, function* () {
            // If primary still writable -> do nothing
            if (this.primaryClient) {
                const ok = yield this.checkWritable(this.primaryClient).catch(() => false);
                if (ok)
                    return;
                logger_1.logger.warn('Primary client no longer writable. Will search for a writable node.');
                try {
                    yield this.primaryClient.close();
                }
                catch (_a) { }
                this.primaryClient = null;
                this.primaryDb = null;
            }
            // attempt to find a writable node among nodes (directConnection)
            for (const n of this.nodes) {
                try {
                    const c = new mongodb_1.MongoClient(n.uri, { directConnection: true, monitorCommands: true });
                    yield c.connect();
                    const writable = yield this.checkWritable(c);
                    if (writable) {
                        logger_1.logger.info(`Health-check: promoted ${n.uri} to primary connection`);
                        this.attachClient(c);
                        yield this.recordEvent('promote', { node: n.uri });
                        return;
                    }
                    else {
                        yield c.close();
                    }
                }
                catch (err) {
                    logger_1.logger.debug(`Health-check connect failed ${n.uri}: ${err.message}`);
                }
            }
            // no writable found
            logger_1.logger.error('Health-check: no writable nodes found.');
            yield this.recordEvent('no-writable', {});
        });
    }
    getDb() {
        return this.primaryDb;
    }
    // Generic wrappers that log operations to collection 'logs'
    read(collectionName_1, op_1) {
        return __awaiter(this, arguments, void 0, function* (collectionName, op, meta = {}) {
            const db = this.getDb();
            const start = Date.now();
            try {
                if (!db)
                    throw new Error('No DB connection');
                const res = yield op(db.collection(collectionName));
                const took = Date.now() - start;
                yield this.safeLog({
                    ts: new Date(),
                    op: 'read',
                    collection: collectionName,
                    success: true,
                    meta,
                    durationMs: took,
                });
                return res;
            }
            catch (err) {
                const took = Date.now() - start;
                yield this.safeLog({
                    ts: new Date(),
                    op: 'read',
                    collection: collectionName,
                    success: false,
                    error: err.message,
                    meta,
                    durationMs: took,
                });
                throw err;
            }
        });
    }
    write(collectionName_1, op_1) {
        return __awaiter(this, arguments, void 0, function* (collectionName, op, meta = {}) {
            const db = this.getDb();
            const start = Date.now();
            try {
                if (!db)
                    throw new Error('No DB connection');
                const res = yield op(db.collection(collectionName));
                const took = Date.now() - start;
                yield this.safeLog({
                    ts: new Date(),
                    op: 'write',
                    collection: collectionName,
                    success: true,
                    meta,
                    durationMs: took,
                });
                return res;
            }
            catch (err) {
                const took = Date.now() - start;
                yield this.safeLog({
                    ts: new Date(),
                    op: 'write',
                    collection: collectionName,
                    success: false,
                    error: err.message,
                    meta,
                    durationMs: took,
                });
                throw err;
            }
        });
    }
    safeLog(doc) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.primaryDb) {
                    logger_1.logger.warn('safeLog: no primaryDb, skipping db log. Logging to console instead.');
                    logger_1.logger.info(JSON.stringify(doc));
                    return;
                }
                yield this.primaryDb.collection('logs').insertOne(doc);
            }
            catch (err) {
                logger_1.logger.warn('safeLog failed: ' + err.message);
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.healthInterval)
                clearInterval(this.healthInterval);
            if (this.primaryClient) {
                yield this.primaryClient.close().catch(() => { });
                this.primaryClient = null;
                this.primaryDb = null;
            }
        });
    }
}
exports.ConnectionManager = ConnectionManager;
