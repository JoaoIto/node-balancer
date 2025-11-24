
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { MongoClient } from 'mongodb';
import http from 'http';
import { execSync } from 'child_process';

// Configuration
const API_URL = 'http://localhost:3000/api/users';
const NODES = [
    { name: 'mongo1', uri: 'mongodb://localhost:27017/node-balancer' },
    { name: 'mongo2', uri: 'mongodb://localhost:27018/node-balancer' },
    { name: 'mongo3', uri: 'mongodb://localhost:27019/node-balancer' }
];

// Screen Setup
const screen = blessed.screen({
    smartCSR: true,
    title: 'NodeBalancer Control Center'
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Components
const topologyTable = grid.set(0, 0, 6, 4, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: 'Cluster Topology',
    border: { type: "line", fg: "cyan" },
    columnSpacing: 3,
    columnWidth: [10, 15, 10]
});

const latencyLine = grid.set(0, 4, 6, 8, contrib.line, {
    style: { line: "yellow", text: "green", baseline: "black" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    legend: { width: 20 },
    label: 'API Response Time (ms)'
});

const logBox = grid.set(6, 0, 6, 8, contrib.log, {
    fg: "green",
    selectedFg: "green",
    label: 'Execution Logs'
});

const controls = grid.set(6, 8, 6, 4, blessed.list, {
    label: 'Actions (Enter to Execute)',
    keys: true,
    vi: true,
    mouse: true,
    style: { selected: { bg: 'blue' }, item: { fg: 'white' } },
    items: [
        'RUN CHAOS DEMO (Auto)',
        'SEND BATCH (2 POST + 1 GET)',
        'STOP PRIMARY',
        'START MONGO1',
        'START MONGO2',
        'START MONGO3',
        'START STACK',
        'EXIT'
    ]
});

// State
let latencyData = {
    title: 'Latency',
    x: Array(20).fill('.'),
    y: Array(20).fill(0)
};

// Utils
function log(msg: string) {
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    logBox.log(`[${time}] ${msg}`);
    screen.render();
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API Interaction
async function request(method: 'GET' | 'POST') {
    return new Promise<number>((resolve) => {
        const start = Date.now();
        const data = method === 'POST' ? JSON.stringify({
            name: `User ${Date.now()}`,
            email: `user${Date.now()}@test.com`,
            password: '123'
        }) : undefined;

        const req = http.request(API_URL, {
            method,
            headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': data?.length } : {},
            timeout: 2000
        }, (res) => {
            const duration = Date.now() - start;
            updateLatencyGraph(duration);
            resolve(res.statusCode || 500);
        });

        req.on('error', (e) => {
            updateLatencyGraph(0);
            resolve(0);
        });

        req.on('timeout', () => {
            req.destroy();
            updateLatencyGraph(0);
            resolve(408);
        });

        if (data) req.write(data);
        req.end();
    });
}

function updateLatencyGraph(ms: number) {
    latencyData.y.shift();
    latencyData.y.push(ms);
    latencyLine.setData([latencyData]);
    screen.render();
}

// Cluster Logic
async function getPrimary() {
    for (const node of NODES) {
        try {
            const client = new MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
            await client.connect();
            const hello = await client.db('admin').command({ hello: 1 });
            await client.close();
            if (hello.isWritablePrimary) return node.name;
        } catch (e) { }
    }
    return null;
}

async function updateTopology() {
    const rows = [];
    for (const node of NODES) {
        let status = 'DOWN';
        let count = '-';
        try {
            const client = new MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
            await client.connect();
            const db = client.db('node-balancer');
            const hello = await db.command({ hello: 1 });
            count = (await db.collection('users').countDocuments()).toString();
            await client.close();

            status = hello.isWritablePrimary ? 'PRIMARY' : 'SECONDARY';
        } catch (e) { }
        rows.push([node.name, status, count]);
    }
    topologyTable.setData({ headers: ['Node', 'State', 'Docs'], data: rows });
    screen.render();
}

// Actions
async function runBatch() {
    log('Sending 2 POST + 1 GET...');
    const s1 = await request('POST');
    log(`POST: ${s1}`);
    const s2 = await request('POST');
    log(`POST: ${s2}`);
    const s3 = await request('GET');
    log(`GET: ${s3}`);
}

async function runChaosDemo() {
    log('🚀 STARTING CHAOS DEMO');

    // Phase 1
    log('Phase 1: Healthy State');
    await runBatch();

    // Chaos
    const primary = await getPrimary();
    if (primary) {
        log(`💥 Stopping PRIMARY: ${primary}`);
        try { execSync(`docker stop ${primary}`); } catch (e) { log('Error stopping node'); }
    } else {
        log('No Primary found to stop!');
    }

    // Phase 2
    log('Phase 2: Failover State');
    await sleep(2000);
    await runBatch();

    // Recovery
    log('Waiting 5s before recovery...');
    await sleep(5000);
    if (primary) {
        log(`♻️  Restarting ${primary}`);
        try { execSync(`docker start ${primary}`); } catch (e) { log('Error starting node'); }
    }

    // Phase 3
    log('Phase 3: Recovery State');
    await sleep(5000);
    await runBatch();
    log('✅ DEMO COMPLETED');
}

// Controls Event Handler
controls.on('select', async (item: blessed.Widgets.BoxElement, index: number) => {
    const cmd = item.getText();

    if (cmd.includes('RUN CHAOS DEMO')) {
        runChaosDemo();
    } else if (cmd.includes('SEND BATCH')) {
        runBatch();
    } else if (cmd.includes('STOP PRIMARY')) {
        const p = await getPrimary();
        if (p) {
            log(`Stopping ${p}...`);
            try { execSync(`docker stop ${p}`); log('Stopped.'); } catch (e) { log('Error.'); }
        } else {
            log('No Primary found.');
        }
    } else if (cmd.includes('START MONGO')) {
        const node = cmd.split(' ')[1].toLowerCase();
        log(`Starting ${node}...`);
        try { execSync(`docker start ${node}`); log('Started.'); } catch (e) { log('Error.'); }
    } else if (cmd.includes('START STACK')) {
        log('Starting stack...');
        try { execSync('docker-compose up -d'); log('Stack up.'); } catch (e: any) { log(`Error: ${e.message.split('\n')[0]}`); }
    } else if (cmd.includes('EXIT')) {
        process.exit(0);
    }
});

// Loops
setInterval(updateTopology, 2000);

// Init
controls.focus();
log('Control Center Ready.');
updateTopology();
screen.render();

// Exit
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
