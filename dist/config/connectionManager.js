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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const mongodb_1 = require("mongodb");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../middlewares/logger");
const websocket_1 = require("./websocket");
const metrics_1 = require("./metrics");
class ConnectionManager {
    constructor(opts) {
        var _a, _b, _c;
        this.primaryClient = null;
        this.primaryDb = null;
        this.secondaryClients = [];
        this.rrIndex = 0;
        this.nodes = [];
        this.replicaUri = opts.replicaUri;
        this.nodes = (opts.nodes || []).map((u, i) => ({ uri: u, name: `node${i + 1}` }));
        this.dbName = opts.dbName || 'node-balancer';
        this.healthCheckIntervalMs = (_a = opts.healthCheckIntervalMs) !== null && _a !== void 0 ? _a : 5000;
        this.webhookUrl = opts.webhookUrl;
        this.maxPoolSize = (_b = opts.maxPoolSize) !== null && _b !== void 0 ? _b : 20;
        this.minPoolSize = (_c = opts.minPoolSize) !== null && _c !== void 0 ? _c : 1;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('ConnectionManager: init() starting');
            // 1. Try Replica URI
            if (this.replicaUri) {
                logger_1.logger.info(`Trying replica URI: ${this.replicaUri}`);
                try {
                    const c = new mongodb_1.MongoClient(this.replicaUri, {
                        monitorCommands: true,
                        minPoolSize: this.minPoolSize,
                        maxPoolSize: this.maxPoolSize
                    });
                    // Attach events BEFORE connecting to capture initial pool creation (optional but good)
                    this.attachPoolMonitor(c, 'primary', 'replica-uri');
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
            // 2. Fallback: Multi-node Manual Connection
            logger_1.logger.info('Initializing multi-node connection...');
            let connectedCount = 0;
            for (const n of this.nodes) {
                logger_1.logger.info(`Connecting to node ${n.uri}`);
                try {
                    const c = new mongodb_1.MongoClient(n.uri, {
                        directConnection: true,
                        monitorCommands: true,
                        minPoolSize: this.minPoolSize,
                        maxPoolSize: this.maxPoolSize
                    });
                    this.attachPoolMonitor(c, 'unknown', n.uri); // Type unknown until verified
                    yield c.connect();
                    connectedCount++;
                    const writable = yield this.checkWritable(c);
                    if (writable && !this.primaryClient) {
                        logger_1.logger.info(`Found Primary node at ${n.uri}`);
                        this.attachClient(c);
                        // Re-tag metrics if needed? 
                        // Metrics are tagged by 'node' URI, so type label 'unknown' might be set once.
                        // Ideally we update the label but exposed gauges don't support re-labeling easily without removing.
                        // For now, node URI is the main identifier.
                    }
                    else {
                        logger_1.logger.info(`Connected to Secondary node at ${n.uri}`);
                        this.secondaryClients.push(c);
                    }
                }
                catch (err) {
                    logger_1.logger.warn(`Node connect failed ${n.uri}: ${err.message}`);
                }
            }
            if (connectedCount === 0) {
                throw new Error('No available MongoDB nodes found. Check your cluster.');
            }
            if (!this.primaryClient) {
                logger_1.logger.warn('Initialized without a Primary node! System in Read-Only mode until a node becomes writable.');
            }
            this.startHealthChecks();
        });
    }
    attachPoolMonitor(client, type, nodeUri) {
        const label = { type, node: nodeUri };
        client.on('connectionCreated', () => metrics_1.poolSize.inc(label));
        client.on('connectionClosed', () => metrics_1.poolSize.dec(label));
        client.on('connectionCheckedOut', () => {
            metrics_1.poolCheckedOut.inc(label);
        });
        client.on('connectionCheckedIn', () => {
            metrics_1.poolCheckedOut.dec(label);
        });
        // 'connectionCheckOutStarted' indicates a request entered the queue (or is about to grab one)
        // 'connectionCheckOutFailed' indicates it failed to get one (timeout)
        // We can use these to track queue depth approximately.
        client.on('connectionCheckOutStarted', () => metrics_1.poolWaitQueue.inc(label));
        client.on('connectionCheckOutFailed', () => metrics_1.poolWaitQueue.dec(label));
        // When successfully checked out, it also leaves the queue
        client.on('connectionCheckedOut', () => metrics_1.poolWaitQueue.dec(label));
    }
    attachClient(client) {
        this.primaryClient = client;
        this.primaryDb = client.db(this.dbName);
        client.on('topologyDescriptionChanged', (td) => {
            var _a;
            const summary = this.summarizeTopology(td);
            // logger.info(`topologyDescriptionChanged: ${JSON.stringify(summary)}`); 
            this.recordEvent('topologyDescriptionChanged', { td: summary }).catch(() => { });
            (_a = (0, websocket_1.getIO)()) === null || _a === void 0 ? void 0 : _a.emit('topology-change', summary);
        });
        client.on('serverHeartbeatFailed', (event) => {
            logger_1.logger.warn(`serverHeartbeatFailed: ${JSON.stringify(event)}`);
            this.recordEvent('serverHeartbeatFailed', { event }).catch(() => { });
            this.sendAlert('serverHeartbeatFailed', event).catch(() => { });
        });
        client.on('serverHeartbeatSucceeded', (event) => {
            // verbose
        });
        client.on('close', () => {
            logger_1.logger.warn('MongoClient close event');
            this.recordEvent('clientClose', {}).catch(() => { });
        });
        logger_1.logger.info('Primary client attached.');
        metrics_1.connectionStatus.set(1);
    }
    summarizeTopology(td) {
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
                const res = yield admin.command({ isWritablePrimary: 1 }).catch(() => null);
                if (res && res.isWritablePrimary)
                    return true;
                const info = yield admin.command({ hello: 1 }).catch(() => null);
                if (info && (info.isWritablePrimary ||
                    info.isWritablePrimary === true ||
                    info.ismaster === true))
                    return true;
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
            var _a;
            try {
                const event = { ts: new Date(), level: 'event', type, payload };
                (_a = (0, websocket_1.getIO)()) === null || _a === void 0 ? void 0 : _a.emit('log', event);
                if (!this.primaryDb)
                    return;
                yield this.primaryDb.collection('logs').insertOne(event);
            }
            catch (err) {
                // logger.warn('recordEvent failed: ' + (err as Error).message);
            }
        });
    }
    sendAlert(event, details) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.webhookUrl)
                return;
            try {
                yield axios_1.default.post(this.webhookUrl, {
                    text: `⚠️ **NodeBalancer Alert**\n**Event**: ${event}\n**Details**: \`\`\`${JSON.stringify(details, null, 2)}\`\`\``
                });
            }
            catch (err) {
                logger_1.logger.warn(`Failed to send webhook alert: ${err.message}`);
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
            // 1. Check Primary
            if (this.primaryClient) {
                const ok = yield this.checkWritable(this.primaryClient).catch(() => false);
                if (!ok) {
                    logger_1.logger.warn('Primary client no longer writable. Demoting to potential secondary.');
                    this.secondaryClients.push(this.primaryClient);
                    this.primaryClient = null;
                    this.primaryDb = null;
                    metrics_1.connectionStatus.set(0);
                }
            }
            // 2. Check Secondaries
            for (let i = this.secondaryClients.length - 1; i >= 0; i--) {
                const sec = this.secondaryClients[i];
                try {
                    yield sec.db('admin').command({ ping: 1 });
                }
                catch (err) {
                    logger_1.logger.warn('Secondary node lost connection. Removing.');
                    try {
                        yield sec.close();
                    }
                    catch (_a) { }
                    this.secondaryClients.splice(i, 1);
                }
            }
            // 3. Promote if needed
            if (!this.primaryClient) {
                // logger.warn('No Primary! Searching among secondaries...');
                for (let i = 0; i < this.secondaryClients.length; i++) {
                    const client = this.secondaryClients[i];
                    const isWritable = yield this.checkWritable(client);
                    if (isWritable) {
                        logger_1.logger.info('Promoting secondary to Primary!');
                        this.attachClient(client);
                        this.secondaryClients.splice(i, 1);
                        yield this.recordEvent('promote', { message: 'Promoted secondary to primary' });
                        yield this.sendAlert('promote', { message: 'Promoted new primary connection' });
                        metrics_1.failoverCount.inc();
                        break;
                    }
                }
            }
        });
    }
    getSecondary() {
        if (this.secondaryClients.length === 0)
            return null;
        const c = this.secondaryClients[this.rrIndex % this.secondaryClients.length];
        this.rrIndex++;
        return c;
    }
    getDb() {
        return this.primaryDb;
    }
    read(collectionName_1, op_1) {
        return __awaiter(this, arguments, void 0, function* (collectionName, op, meta = {}, readPref = 'primary') {
            let clientToUse = this.primaryClient;
            let effectivePref = readPref;
            if (readPref === 'secondary') {
                const sec = this.getSecondary();
                if (sec) {
                    clientToUse = sec;
                }
                else {
                    throw new Error('No secondary node available for read preference "secondary"');
                }
            }
            else if (readPref === 'secondaryPreferred') {
                const sec = this.getSecondary();
                if (sec) {
                    clientToUse = sec;
                    effectivePref = 'secondary';
                }
                else {
                    clientToUse = this.primaryClient;
                    effectivePref = 'primary';
                }
            }
            if (!clientToUse) {
                throw new Error('No active connection available for requested read preference');
            }
            const db = clientToUse.db(this.dbName);
            const start = Date.now();
            try {
                const collection = db.collection(collectionName);
                const res = yield op(collection);
                const took = Date.now() - start;
                yield this.safeLog({
                    ts: new Date(),
                    op: 'read',
                    collection: collectionName,
                    success: true,
                    meta: Object.assign(Object.assign({}, meta), { readPref: effectivePref }),
                    durationMs: took,
                });
                metrics_1.operationDuration.observe({
                    operation: 'read',
                    collection: collectionName,
                    success: 'true',
                    read_preference: effectivePref
                }, took / 1000);
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
                    meta: Object.assign(Object.assign({}, meta), { readPref: effectivePref }),
                    durationMs: took,
                });
                metrics_1.operationDuration.observe({
                    operation: 'read',
                    collection: collectionName,
                    success: 'false',
                    read_preference: effectivePref
                }, took / 1000);
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
                metrics_1.operationDuration.observe({ operation: 'write', collection: collectionName, success: 'true' }, took / 1000);
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
                metrics_1.operationDuration.observe({ operation: 'write', collection: collectionName, success: 'false' }, took / 1000);
                throw err;
            }
        });
    }
    safeLog(doc) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                (_a = (0, websocket_1.getIO)()) === null || _a === void 0 ? void 0 : _a.emit('log', doc);
                if (!this.primaryDb) {
                    // logger.warn('safeLog: no primaryDb, skipping db log.');
                    return;
                }
                yield this.primaryDb.collection('logs').insertOne(doc);
            }
            catch (err) {
                // silent fail for log
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.healthInterval)
                clearInterval(this.healthInterval);
            if (this.primaryClient)
                yield this.primaryClient.close().catch(() => { });
            for (const c of this.secondaryClients)
                yield c.close().catch(() => { });
            this.primaryClient = null;
            this.primaryDb = null;
            this.secondaryClients = [];
        });
    }
}
exports.ConnectionManager = ConnectionManager;
