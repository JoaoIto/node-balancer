
import { spawn, execSync } from 'child_process';
import http from 'http';
import { MongoClient } from 'mongodb';

// Configuration
const API_URL = 'http://localhost:3000/api/users';
const NODES = [
    { name: 'mongo1', uri: 'mongodb://localhost:27017/node-balancer' },
    { name: 'mongo2', uri: 'mongodb://localhost:27018/node-balancer' },
    { name: 'mongo3', uri: 'mongodb://localhost:27019/node-balancer' }
];

const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
};

function log(prefix: string, msg: string, color: string = colors.reset) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`${colors.gray}[${timestamp}]${colors.reset} ${color}${prefix.padEnd(10)}${colors.reset} ${msg}`);
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPrimary() {
    for (const node of NODES) {
        const client = new MongoClient(node.uri, { serverSelectionTimeoutMS: 1000, directConnection: true });
        try {
            await client.connect();
            const hello = await client.db('admin').command({ hello: 1 });
            await client.close();
            if (hello.isWritablePrimary) return node.name;
        } catch (e) { }
    }
    return null;
}

async function checkTopology() {
    const statuses = await Promise.all(NODES.map(async (node) => {
        const client = new MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
        try {
            await client.connect();
            const db = client.db('node-balancer');
            const hello = await db.command({ hello: 1 });
            const count = await db.collection('users').countDocuments();
            await client.close();

            const state = hello.isWritablePrimary ? 'PRIMARY' : 'SECONDARY';
            const color = hello.isWritablePrimary ? colors.green : colors.blue;
            return `${node.name}: ${color}${state}${colors.reset} (${count})`;
        } catch (e) {
            return `${node.name}: ${colors.red}DOWN${colors.reset}`;
        }
    }));
    log('CLUSTER', statuses.join(' | '), colors.magenta);
}

async function request(method: 'GET' | 'POST') {
    return new Promise<void>((resolve) => {
        const start = Date.now();
        const data = method === 'POST' ? JSON.stringify({
            name: `User ${Date.now()}`,
            email: `user${Date.now()}@test.com`,
            password: '123'
        }) : undefined;

        const req = http.request(API_URL, {
            method,
            headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': data?.length } : {}
        }, (res) => {
            const duration = Date.now() - start;
            const color = res.statusCode && res.statusCode < 300 ? colors.green : colors.red;
            log('CLIENT', `${method} ${res.statusCode} - ${duration}ms`, color);
            resolve();
        });

        req.on('error', (e) => {
            log('CLIENT', `${method} ERROR: ${e.message}`, colors.red);
            resolve();
        });

        if (data) req.write(data);
        req.end();
    });
}

async function runBatch() {
    log('TEST', 'Running Batch: 2 POST + 1 GET', colors.cyan);
    await request('POST');
    await request('POST');
    await request('GET');
    await checkTopology();
}

async function startDemo() {
    console.clear();
    log('DEMO', '🚀 Starting Succinct Failover Demo', colors.cyan);

    // 1. Ensure Stack
    try { execSync('docker-compose up -d', { stdio: 'ignore' }); } catch (e) { }

    // 2. Stream Logs
    const dockerLogs = spawn('docker', ['logs', '-f', 'node-api']);
    dockerLogs.stdout.on('data', (d) => {
        d.toString().split('\n').forEach((l: string) => {
            if (l.trim()) console.log(`${colors.gray}[API]      ${l.trim()}${colors.reset}`);
        });
    });

    // 3. Initial State
    await sleep(2000);
    await checkTopology();

    // 4. Phase 1: Healthy
    await runBatch();

    // 5. Chaos: Stop Primary
    const primary = await getPrimary();
    if (primary) {
        log('CHAOS', `💥 Stopping PRIMARY: ${primary}`, colors.red);
        execSync(`docker stop ${primary}`);
    } else {
        log('CHAOS', 'Could not find primary!', colors.red);
    }

    // 6. Phase 2: Failover
    await sleep(2000); // Give a moment for election
    await runBatch();

    // 7. Wait 5s
    log('WAIT', 'Waiting 5 seconds...', colors.yellow);
    await sleep(5000);

    // 8. Recovery
    if (primary) {
        log('CHAOS', `♻️  Restarting ${primary}`, colors.green);
        execSync(`docker start ${primary}`);
    }

    // 9. Phase 3: Recovery
    await sleep(5000); // Wait for rejoin
    await runBatch();

    log('DEMO', '✅ Demo Completed', colors.cyan);
    process.exit(0);
}

startDemo();
