import { EventEmitter } from 'events';
import { MongoClient, Db } from 'mongodb';
import axios from 'axios';
import { logger } from '../middlewares/logger';
import { getIO } from './websocket';
import { connectionStatus, failoverCount, operationDuration, poolSize, poolCheckedOut, poolWaitQueue } from './metrics';

type NodeInfo = { uri: string; name: string };

export interface ConnectionManagerOptions {
    connectionString?: string;
    replicaUri?: string;
    nodes?: string[];
    dbName?: string;
    healthCheckIntervalMs?: number;
    webhookUrl?: string;
    maxPoolSize?: number;
    minPoolSize?: number;
}

export type ReadPreferenceMode = 'primary' | 'secondary' | 'secondaryPreferred';

export class ConnectionManager extends EventEmitter {
    private primaryClient: MongoClient | null = null;
    private primaryDb: Db | null = null;
    private secondaryClients: MongoClient[] = [];
    private rrIndex = 0;

    private nodes: NodeInfo[] = [];
    private replicaUri?: string;
    private dbName: string;
    private healthInterval?: NodeJS.Timeout;
    private healthCheckIntervalMs: number;
    private webhookUrl?: string;
    private maxPoolSize: number;
    private minPoolSize: number;

    constructor(opts: ConnectionManagerOptions) {
        super();
        this.replicaUri = opts.replicaUri;
        this.healthCheckIntervalMs = opts.healthCheckIntervalMs ?? 5000;
        this.webhookUrl = opts.webhookUrl;
        this.maxPoolSize = opts.maxPoolSize ?? 20;
        this.minPoolSize = opts.minPoolSize ?? 1;

        let parsedDbName: string | undefined;

        if (opts.connectionString) {
            parsedDbName = this.parseConnectionString(opts.connectionString);
        } else {
            this.nodes = (opts.nodes || []).map((u, i) => ({ uri: u, name: `node${i + 1}` }));
        }

        // Use parsed dbName if allowed, or fallback to opts, or default
        this.dbName = opts.dbName || parsedDbName || 'node-balancer';
    }

    private parseConnectionString(uri: string): string | undefined {
        // Basic Regex to capture: protocol, auth(optional), hosts, db(optional), options(optional)
        const regex = /^(mongodb(?:\+srv)?):\/\/((?:[^@\/]+@)?)?([^/?]+)(?:\/([^?]+))?(?:\?.*)?$/;
        const match = uri.match(regex);
        let foundDbName: string | undefined;

        if (!match) {
            logger.warn('Invalid connection string format. Fallback to manual nodes if provided.');
            return undefined;
        }

        const protocol = match[1];
        const auth = match[2] || '';
        const hostsPart = match[3];
        const dbPart = match[4];

        if (dbPart) foundDbName = dbPart;

        if (protocol === 'mongodb+srv') {
            logger.info('Detected SRV connection string. Using as replicaUri.');
            this.replicaUri = uri;
        } else {
            const hosts = hostsPart.split(',');
            this.nodes = hosts.map((h, i) => ({
                uri: `${protocol}://${auth}${h}`,
                name: `node${i + 1}`
            }));
            logger.info(`Parsed ${this.nodes.length} nodes from connection string.`);
        }
        return foundDbName;
    }

    public async init(): Promise<void> {
        logger.info('ConnectionManager: init() starting');

        // 1. Try Replica URI
        if (this.replicaUri) {
            logger.info(`Trying replica URI: ${this.replicaUri}`);
            try {
                const c = new MongoClient(this.replicaUri, {
                    monitorCommands: true,
                    minPoolSize: this.minPoolSize,
                    maxPoolSize: this.maxPoolSize
                });
                (c as any)._uri = this.replicaUri;
                // Attach events BEFORE connecting to capture initial pool creation
                this.attachPoolMonitor(c, 'primary', 'replica-uri');

                await c.connect();
                const isWritable = await this.checkWritable(c);
                if (isWritable) {
                    logger.info('Connected to replicaSet URI and found writable primary.');
                    this.attachClient(c);
                    this.startHealthChecks();
                    this.emit('ready', { mode: 'replica-set', uri: this.replicaUri });
                    return;
                } else {
                    logger.warn('Replica URI connected but did not find writable primary. Closing.');
                    await c.close();
                }
            } catch (err) {
                logger.warn(`Replica URI connect failed: ${(err as Error).message}`);
            }
        }

        // 2. Fallback: Multi-node Manual Connection
        logger.info('Initializing multi-node connection...');
        let connectedCount = 0;

        for (const n of this.nodes) {
            logger.info(`Connecting to node ${n.uri}`);
            try {
                const c = new MongoClient(n.uri, {
                    directConnection: true,
                    monitorCommands: true,
                    minPoolSize: this.minPoolSize,
                    maxPoolSize: this.maxPoolSize
                });
                (c as any)._uri = n.uri;

                this.attachPoolMonitor(c, 'unknown', n.uri);

                await c.connect();
                connectedCount++;

                const writable = await this.checkWritable(c);
                if (writable && !this.primaryClient) {
                    logger.info(`Found Primary node at ${n.uri}`);
                    this.attachClient(c);
                } else {
                    logger.info(`Connected to Secondary node at ${n.uri}`);
                    this.secondaryClients.push(c);
                }
            } catch (err) {
                logger.warn(`Node connect failed ${n.uri}: ${(err as Error).message}`);
            }
        }

        if (connectedCount === 0) {
            throw new Error('No available MongoDB nodes found. Check your cluster.');
        }

        if (!this.primaryClient) {
            logger.warn('Initialized without a Primary node! System in Read-Only mode until a node becomes writable.');
            this.emit('warn', 'Initialized in Read-Only mode (No Primary)');
        } else {
            this.emit('ready', { mode: 'multi-node' });
        }

        this.startHealthChecks();
    }

    public getStatus() {
        return {
            isConnected: !!this.primaryClient,
            dbName: this.dbName,
            primary: this.primaryClient ? (this.primaryClient as any)._uri : null,
            secondaries: this.secondaryClients.map(c => (c as any)._uri),
            totalNodes: (this.primaryClient ? 1 : 0) + this.secondaryClients.length
        };
    }

    private attachPoolMonitor(client: MongoClient, type: string, nodeUri: string) {
        const label = { type, node: nodeUri };

        client.on('connectionCreated', () => poolSize.inc(label));
        client.on('connectionClosed', () => poolSize.dec(label));

        client.on('connectionCheckedOut', () => {
            poolCheckedOut.inc(label);
        });
        client.on('connectionCheckedIn', () => {
            poolCheckedOut.dec(label);
        });

        client.on('connectionCheckOutStarted', () => poolWaitQueue.inc(label));
        client.on('connectionCheckOutFailed', () => poolWaitQueue.dec(label));
        client.on('connectionCheckedOut', () => poolWaitQueue.dec(label));
    }

    private attachClient(client: MongoClient) {
        this.primaryClient = client;
        this.primaryDb = client.db(this.dbName);

        const uri = (client as any)._uri;
        this.emit('primary-elected', { uri });

        client.on('topologyDescriptionChanged', (td) => {
            const summary = this.summarizeTopology(td);
            this.recordEvent('topologyDescriptionChanged', { td: summary }).catch(() => { });
            getIO()?.emit('topology-change', summary);
            this.emit('topology-change', summary);
        });

        client.on('serverHeartbeatFailed', (event) => {
            logger.warn(`serverHeartbeatFailed: ${JSON.stringify(event)}`);
            this.recordEvent('serverHeartbeatFailed', { event }).catch(() => { });
            this.sendAlert('serverHeartbeatFailed', event).catch(() => { });
            this.emit('server-heartbeat-failed', event);
        });

        client.on('serverHeartbeatSucceeded', (event) => {
            // verbose
        });

        client.on('close', () => {
            logger.warn('MongoClient close event');
            this.recordEvent('clientClose', {}).catch(() => { });
            this.emit('close');
        });

        logger.info('Primary client attached.');
        connectionStatus.set(1);
    }

    private summarizeTopology(td: any) {
        try {
            return {
                servers: Object.keys(td.servers || {}).map((k: string) => ({
                    addr: k,
                    type: td.servers[k].type,
                })),
            };
        } catch {
            return { raw: td };
        }
    }

    private async checkWritable(client: MongoClient): Promise<boolean> {
        try {
            const admin = client.db('admin');
            const res = await admin.command({ isWritablePrimary: 1 }).catch(() => null);
            if (res && (res as any).isWritablePrimary) return true;
            const info = await admin.command({ hello: 1 }).catch(() => null);
            if (info && (
                (info as any).isWritablePrimary ||
                (info as any).isWritablePrimary === true ||
                (info as any).ismaster === true
            )) return true;
            return false;
        } catch (err) {
            logger.warn('checkWritable error: ' + (err as Error).message);
            return false;
        }
    }

    private async recordEvent(type: string, payload: any) {
        try {
            const event = { ts: new Date(), level: 'event', type, payload };
            getIO()?.emit('log', event);
            if (!this.primaryDb) return;
            await this.primaryDb.collection('logs').insertOne(event);
        } catch (err) {
            // logger.warn('recordEvent failed: ' + (err as Error).message);
        }
    }

    private async sendAlert(event: string, details: any) {
        if (!this.webhookUrl) return;
        try {
            await axios.post(this.webhookUrl, {
                text: `⚠️ **NodeBalancer Alert**\n**Event**: ${event}\n**Details**: \`\`\`${JSON.stringify(details, null, 2)}\`\`\``
            });
        } catch (err) {
            logger.warn(`Failed to send webhook alert: ${(err as Error).message}`);
        }
    }

    private startHealthChecks() {
        if (this.healthInterval) clearInterval(this.healthInterval);
        this.healthInterval = setInterval(() => this.healthCheckLoop().catch(err => logger.warn('healthCheck error: ' + err.message)), this.healthCheckIntervalMs);
        logger.info('Started health checks.');
    }

    private async healthCheckLoop() {
        // 1. Check Primary
        if (this.primaryClient) {
            const ok = await this.checkWritable(this.primaryClient).catch(() => false);
            if (!ok) {
                logger.warn('Primary client no longer writable. Demoting to potential secondary.');
                this.secondaryClients.push(this.primaryClient);
                this.primaryClient = null;
                this.primaryDb = null;
                connectionStatus.set(0);
                this.emit('failover-start', { reason: 'Primary not writable' });
            }
        }

        // 2. Check Secondaries
        for (let i = this.secondaryClients.length - 1; i >= 0; i--) {
            const sec = this.secondaryClients[i];
            try {
                await sec.db('admin').command({ ping: 1 });
            } catch (err) {
                logger.warn('Secondary node lost connection. Removing.');
                try { await sec.close(); } catch { }
                this.secondaryClients.splice(i, 1);
                this.emit('node-lost', { count: this.secondaryClients.length });
            }
        }

        // 3. Promote if needed
        if (!this.primaryClient) {
            // logger.warn('No Primary! Searching among secondaries...');
            for (let i = 0; i < this.secondaryClients.length; i++) {
                const client = this.secondaryClients[i];
                const isWritable = await this.checkWritable(client);
                if (isWritable) {
                    logger.info('Promoting secondary to Primary!');
                    this.attachClient(client);
                    this.secondaryClients.splice(i, 1);
                    await this.recordEvent('promote', { message: 'Promoted secondary to primary' });
                    await this.sendAlert('promote', { message: 'Promoted new primary connection' });
                    failoverCount.inc();
                    this.emit('failover-complete', { newPrimary: (client as any)._uri });
                    break;
                }
            }
        }
    }

    private getSecondary(): MongoClient | null {
        if (this.secondaryClients.length === 0) return null;
        const c = this.secondaryClients[this.rrIndex % this.secondaryClients.length];
        this.rrIndex++;
        return c;
    }

    public getDb(): Db | null {
        return this.primaryDb;
    }

    public async read<T = any>(collectionName: string, op: (c: any) => Promise<T>, meta: any = {}, readPref: ReadPreferenceMode = 'primary') {
        let clientToUse: MongoClient | null = this.primaryClient;
        let effectivePref = readPref;

        if (readPref === 'secondary') {
            const sec = this.getSecondary();
            if (sec) {
                clientToUse = sec;
            } else {
                throw new Error('No secondary node available for read preference "secondary"');
            }
        } else if (readPref === 'secondaryPreferred') {
            const sec = this.getSecondary();
            if (sec) {
                clientToUse = sec;
                effectivePref = 'secondary';
            } else {
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
            const res = await op(collection);
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'read',
                collection: collectionName,
                success: true,
                meta: { ...meta, readPref: effectivePref },
                durationMs: took,
            });
            operationDuration.observe({
                operation: 'read',
                collection: collectionName,
                success: 'true',
                read_preference: effectivePref
            }, took / 1000);
            return res;
        } catch (err) {
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'read',
                collection: collectionName,
                success: false,
                error: (err as Error).message,
                meta: { ...meta, readPref: effectivePref },
                durationMs: took,
            });
            operationDuration.observe({
                operation: 'read',
                collection: collectionName,
                success: 'false',
                read_preference: effectivePref
            }, took / 1000);
            throw err;
        }
    }

    public async write<T = any>(collectionName: string, op: (c: any) => Promise<T>, meta: any = {}) {
        const db = this.getDb();
        const start = Date.now();
        try {
            if (!db) throw new Error('No DB connection');
            const res = await op(db.collection(collectionName));
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'write',
                collection: collectionName,
                success: true,
                meta,
                durationMs: took,
            });
            operationDuration.observe({ operation: 'write', collection: collectionName, success: 'true' }, took / 1000);
            return res;
        } catch (err) {
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'write',
                collection: collectionName,
                success: false,
                error: (err as Error).message,
                meta,
                durationMs: took,
            });
            operationDuration.observe({ operation: 'write', collection: collectionName, success: 'false' }, took / 1000);
            throw err;
        }
    }

    private async safeLog(doc: any) {
        try {
            getIO()?.emit('log', doc);
            if (!this.primaryDb) {
                // logger.warn('safeLog: no primaryDb, skipping db log.');
                return;
            }
            await this.primaryDb.collection('logs').insertOne(doc);
        } catch (err) {
            // silent fail for log
        }
    }

    public async close(): Promise<void> {
        if (this.healthInterval) clearInterval(this.healthInterval);
        if (this.primaryClient) await this.primaryClient.close().catch(() => { });
        for (const c of this.secondaryClients) await c.close().catch(() => { });
        this.primaryClient = null;
        this.primaryDb = null;
        this.secondaryClients = [];
        this.removeAllListeners();
    }
}
