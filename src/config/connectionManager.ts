
import { MongoClient, Db } from 'mongodb';
import { logger } from '../middlewares/logger';

type NodeInfo = { uri: string; name: string };

interface ConnectionManagerOptions {
    replicaUri?: string;
    nodes?: string[];
    dbName?: string;
    healthCheckIntervalMs?: number;
}

export class ConnectionManager {
    private primaryClient: MongoClient | null = null;
    private primaryDb: Db | null = null;
    private nodes: NodeInfo[] = [];
    private replicaUri?: string;
    private dbName: string;
    private healthInterval?: NodeJS.Timeout;
    private healthCheckIntervalMs: number;

    constructor(opts: ConnectionManagerOptions) {
        this.replicaUri = opts.replicaUri;
        this.nodes = (opts.nodes || []).map((u, i) => ({ uri: u, name: `node${i + 1}` }));
        this.dbName = opts.dbName || 'node-balancer';
        this.healthCheckIntervalMs = opts.healthCheckIntervalMs ?? 5000;
    }

    public async init(): Promise<void> {
        logger.info('ConnectionManager: init() starting');
        // First try replica uri if provided (let driver handle replica set)
        if (this.replicaUri) {
            logger.info(`Trying replica URI: ${this.replicaUri}`);
            try {
                const c = new MongoClient(this.replicaUri, { monitorCommands: true });
                await c.connect();
                const isWritable = await this.checkWritable(c);
                if (isWritable) {
                    logger.info('Connected to replicaSet URI and found writable primary.');
                    this.attachClient(c);
                    this.startHealthChecks();
                    return;
                } else {
                    logger.warn('Replica URI connected but did not find writable primary. Closing.');
                    await c.close();
                }
            } catch (err) {
                logger.warn(`Replica URI connect failed: ${(err as Error).message}`);
            }
        }

        // Fallback: iterate nodes and find a writable node
        for (const n of this.nodes) {
            logger.info(`Trying node ${n.uri}`);
            try {
                const c = new MongoClient(n.uri, { directConnection: true, monitorCommands: true });
                await c.connect();
                const writable = await this.checkWritable(c);
                if (writable) {
                    logger.info(`Found writable node at ${n.uri}`);
                    this.attachClient(c);
                    this.startHealthChecks();
                    return;
                } else {
                    await c.close();
                }
            } catch (err) {
                logger.warn(`Node connect failed ${n.uri}: ${(err as Error).message}`);
            }
        }

        throw new Error('No writable MongoDB node found. Check your nodes/replica set.');
    }

    private attachClient(client: MongoClient) {
        this.primaryClient = client;
        this.primaryDb = client.db(this.dbName);

        // register monitoring events on the client
        client.on('topologyDescriptionChanged', (td) => {
            logger.info(`topologyDescriptionChanged: ${JSON.stringify(this.summarizeTopology(td))}`);
            this.recordEvent('topologyDescriptionChanged', { td: this.summarizeTopology(td) }).catch(() => { });
        });

        client.on('serverHeartbeatFailed', (event) => {
            logger.warn(`serverHeartbeatFailed: ${JSON.stringify(event)}`);
            this.recordEvent('serverHeartbeatFailed', { event }).catch(() => { });
        });

        client.on('serverHeartbeatSucceeded', (event) => {
            logger.debug(`serverHeartbeatSucceeded: ${JSON.stringify(event)}`);
        });

        client.on('close', () => {
            logger.warn('MongoClient close event');
            this.recordEvent('clientClose', {}).catch(() => { });
        });

        logger.info('Primary client attached.');
    }

    private summarizeTopology(td: any) {
        // gentle summary - driver topologyDescription shape may vary
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
            // isWritablePrimary command is supported
            const res = await admin.command({ isWritablePrimary: 1 }).catch(() => null);
            if (res && (res as any).isWritablePrimary) return true;
            // fallback: isMaster / hello
            const info = await admin.command({ hello: 1 }).catch(() => null);
            if (info && ((info as any).isWritablePrimary || (info as any).isWritablePrimary === true)) return true;
            // if driver can't tell, assume writable if connected and write to a temp collection test (careful)
            return false;
        } catch (err) {
            logger.warn('checkWritable error: ' + (err as Error).message);
            return false;
        }
    }

    private async recordEvent(type: string, payload: any) {
        try {
            if (!this.primaryDb) return;
            await this.primaryDb.collection('logs').insertOne({
                ts: new Date(),
                level: 'event',
                type,
                payload,
            });
        } catch (err) {
            logger.warn('recordEvent failed: ' + (err as Error).message);
        }
    }

    private startHealthChecks() {
        if (this.healthInterval) clearInterval(this.healthInterval);
        this.healthInterval = setInterval(() => this.healthCheckLoop().catch(err => logger.warn('healthCheck error: ' + err.message)), this.healthCheckIntervalMs);
        logger.info('Started health checks.');
    }

    private async healthCheckLoop() {
        // If primary still writable -> do nothing
        if (this.primaryClient) {
            const ok = await this.checkWritable(this.primaryClient).catch(() => false);
            if (ok) return;
            logger.warn('Primary client no longer writable. Will search for a writable node.');
            try {
                await this.primaryClient.close();
            } catch { }
            this.primaryClient = null;
            this.primaryDb = null;
        }

        // attempt to find a writable node among nodes (directConnection)
        for (const n of this.nodes) {
            try {
                const c = new MongoClient(n.uri, { directConnection: true, monitorCommands: true });
                await c.connect();
                const writable = await this.checkWritable(c);
                if (writable) {
                    logger.info(`Health-check: promoted ${n.uri} to primary connection`);
                    this.attachClient(c);
                    await this.recordEvent('promote', { node: n.uri });
                    return;
                } else {
                    await c.close();
                }
            } catch (err) {
                logger.debug(`Health-check connect failed ${n.uri}: ${(err as Error).message}`);
            }
        }

        // no writable found
        logger.error('Health-check: no writable nodes found.');
        await this.recordEvent('no-writable', {});
    }

    public getDb(): Db | null {
        return this.primaryDb;
    }

    // Generic wrappers that log operations to collection 'logs'
    public async read<T = any>(collectionName: string, op: (c: any) => Promise<T>, meta: any = {}) {
        const db = this.getDb();
        const start = Date.now();
        try {
            if (!db) throw new Error('No DB connection');
            const res = await op(db.collection(collectionName));
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'read',
                collection: collectionName,
                success: true,
                meta,
                durationMs: took,
            });
            return res;
        } catch (err) {
            const took = Date.now() - start;
            await this.safeLog({
                ts: new Date(),
                op: 'read',
                collection: collectionName,
                success: false,
                error: (err as Error).message,
                meta,
                durationMs: took,
            });
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
            throw err;
        }
    }

    private async safeLog(doc: any) {
        try {
            if (!this.primaryDb) {
                logger.warn('safeLog: no primaryDb, skipping db log. Logging to console instead.');
                logger.info(JSON.stringify(doc));
                return;
            }
            await this.primaryDb.collection('logs').insertOne(doc);
        } catch (err) {
            logger.warn('safeLog failed: ' + (err as Error).message);
        }
    }

    public async close(): Promise<void> {
        if (this.healthInterval) clearInterval(this.healthInterval);
        if (this.primaryClient) {
            await this.primaryClient.close().catch(() => { });
            this.primaryClient = null;
            this.primaryDb = null;
        }
    }
}
