#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { MongoClient } from 'mongodb';
import http from 'http';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import { io } from 'socket.io-client';

// ... imports
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Parse Args
const args = process.argv.slice(2);
function getArg(flag: string, def: string | null = null): string | null {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

// Global Config (Mutable)
let API_URL = '';
let NODES: { name: string; uri: string }[] = [];
let DOCKER_NODES: string[] = [];
let NO_DOCKER = false;

// Config Persistence
const CONFIG_FILE = path.join(process.cwd(), 'dashboard.json');
dotenv.config();

// TUI State (Lazy Init)
let screen: blessed.Widgets.Screen;
let grid: any;
let topologyTable: any;
let latencyLine: any;
let logBox: any;
let controls: blessed.Widgets.ListElement;

let latencyData = {
    title: 'Latency',
    x: Array(20).fill('.'),
    y: Array(20).fill(0)
};

// Utils
function log(msg: string) {
    if (!logBox) {
        console.log(msg);
        return;
    }
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
    if (!latencyLine) return;
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
    if (!topologyTable) return;
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

    if (NO_DOCKER) {
        log('Skipping Chaos (No Docker Mode)');
    } else {
        // Chaos
        const primaryName = await getPrimary();
        const primaryIndex = NODES.findIndex(n => n.name === primaryName);
        const containerName = primaryIndex !== -1 ? DOCKER_NODES[primaryIndex] : null;

        if (containerName) {
            log(`💥 Stopping PRIMARY: ${containerName}`);
            try { execSync(`docker stop ${containerName}`); } catch (e) { log('Error stopping node'); }
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
        if (containerName) {
            log(`♻️  Restarting ${containerName}`);
            try { execSync(`docker start ${containerName}`); } catch (e) { log('Error starting node'); }
        }
    }

    // Phase 3
    log('Phase 3: Recovery State');
    await sleep(5000);
    await runBatch();
    log('✅ DEMO COMPLETED');
}

function initTui() {
    screen = blessed.screen({
        smartCSR: true,
        title: 'NodeBalancer Control Center'
    });

    grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

    topologyTable = grid.set(0, 0, 6, 4, contrib.table, {
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

    latencyLine = grid.set(0, 4, 6, 8, contrib.line, {
        style: { line: "yellow", text: "green", baseline: "black" },
        xLabelPadding: 3,
        xPadding: 5,
        showLegend: true,
        legend: { width: 20 },
        label: 'API Response Time (ms)'
    });

    logBox = grid.set(6, 0, 6, 8, contrib.log, {
        fg: "green",
        selectedFg: "green",
        label: 'Execution Logs'
    });

    controls = grid.set(6, 8, 6, 4, blessed.list, {
        label: 'Actions (Enter to Execute)',
        keys: true,
        vi: true,
        mouse: true,
        style: { selected: { bg: 'blue' }, item: { fg: 'white' } },
        items: [
            'RUN CHAOS DEMO (Auto)',
            'SEND BATCH (2 POST + 1 GET)',
            ...(NO_DOCKER ? [] : [
                'STOP PRIMARY',
                ...DOCKER_NODES.map(n => `START ${n.toUpperCase()}`),
                'START STACK'
            ]),
            'EXIT'
        ]
    });

    controls.on('select', async (item: blessed.Widgets.BoxElement, index: number) => {
        const cmd = item.getText();

        if (cmd.includes('RUN CHAOS DEMO')) {
            runChaosDemo();
        } else if (cmd.includes('SEND BATCH')) {
            runBatch();
        } else if (cmd.includes('STOP PRIMARY')) {
            if (NO_DOCKER) return log('Docker disabled.');
            const pName = await getPrimary();
            const pIdx = NODES.findIndex(n => n.name === pName);
            const container = pIdx !== -1 ? DOCKER_NODES[pIdx] : null;

            if (container) {
                log(`Stopping ${container}...`);
                try { execSync(`docker stop ${container}`); log('Stopped.'); } catch (e) { log('Error.'); }
            } else {
                log('No Primary found.');
            }
        } else if (cmd.includes('START MONGO') || cmd.includes('START NODE')) {
            if (NO_DOCKER) return log('Docker disabled.');
            const parts = cmd.split(' ');
            const container = parts[1].toLowerCase();
            log(`Starting ${container}...`);
            try { execSync(`docker start ${container}`); log('Started.'); } catch (e) { log('Error.'); }
        } else if (cmd.includes('START STACK')) {
            if (NO_DOCKER) return log('Docker disabled.');
            log('Starting stack...');
            try { execSync('docker-compose up -d'); log('Stack up.'); } catch (e: any) { log(`Error: ${e.message.split('\n')[0]}`); }
        } else if (cmd.includes('EXIT')) {
            process.exit(0);
        }
    });

    screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
    controls.focus();
    screen.render();
}

// Main Execution
async function main() {
    // Check if flags are provided, otherwise prompt
    const argApiUrl = getArg('--api-url');
    const argNodes = getArg('--nodes');
    const argDocker = getArg('--docker-containers');
    const argNoDocker = args.includes('--no-docker');

    // 1. Priority: Flags
    if (argApiUrl && argNodes) {
        API_URL = argApiUrl;
        NODES = argNodes.split(',').map((uri, i) => ({ name: `node${i + 1}`, uri: uri.trim() }));
        DOCKER_NODES = (argDocker || 'mongo1,mongo2,mongo3').split(',').map(n => n.trim());
        NO_DOCKER = argNoDocker;
    }
    // 2. Priority: Config File
    else if (fs.existsSync(CONFIG_FILE)) {
        console.log('📄 Loading configuration from dashboard.json...');
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            API_URL = config.apiUrl;
            NODES = config.nodes;
            DOCKER_NODES = config.dockerNodes;
            NO_DOCKER = config.noDocker;
        } catch (err) {
            console.error('❌ Failed to load config file:', err);
            process.exit(1);
        }
    }
    // 3. Priority: Env Vars (Auto-Discovery)
    else if (process.env.MONGODB_URI || process.env.MONGO_URL || process.env.CONNECTION_STRING) {
        const envUri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.CONNECTION_STRING;
        console.log('🔍 Auto-detected MongoDB URI from .env');

        // Parse Nodes
        const uris = (envUri || '').split(',').map(u => u.trim());
        NODES = uris.map((uri, i) => ({ name: `node${i + 1}`, uri }));

        // Defaults for Docker
        DOCKER_NODES = ['mongo1', 'mongo2', 'mongo3'];
        NO_DOCKER = false;

        console.log(`   Nodes: ${NODES.length} found`);

        if (process.env.API_URL) {
            API_URL = process.env.API_URL;
            console.log(`   API: ${API_URL} (from .env)`);
            console.log('   (To change this, run with flags or create dashboard.json)\n');
            await sleep(1500);
        } else {
            console.log('⚠️  API_URL not found in .env');
            const ans = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'apiUrl',
                    message: 'Please enter API URL:',
                    default: 'http://localhost:3000/api/users'
                },
                {
                    type: 'confirm',
                    name: 'save',
                    message: '💾 Save this configuration (dashboard.json)?',
                    default: true
                }
            ]);
            API_URL = ans.apiUrl;

            if (ans.save) {
                fs.writeFileSync(CONFIG_FILE, JSON.stringify({
                    apiUrl: API_URL,
                    nodes: NODES,
                    dockerNodes: DOCKER_NODES,
                    noDocker: NO_DOCKER
                }, null, 2));
                console.log('✅ Configuration saved.');
                await sleep(1000);
            }
        }
    }
    else {
        // 4. Fallback: Interactive Mode
        console.clear();
        console.log('🤖 NodeBalancer Dashboard Setup\n');

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'apiUrl',
                message: 'API URL:',
                default: 'http://localhost:3000/api/users'
            },
            {
                type: 'input',
                name: 'nodes',
                message: 'MongoDB Nodes (comma separated):',
                default: 'mongodb://localhost:27017/node-balancer,mongodb://localhost:27018/node-balancer,mongodb://localhost:27019/node-balancer'
            },
            {
                type: 'confirm',
                name: 'enableDocker',
                message: 'Enable Docker Control (Stop/Start containers)?',
                default: true
            },
            {
                type: 'input',
                name: 'dockerContainers',
                message: 'Docker Container Names (comma separated):',
                default: 'mongo1,mongo2,mongo3',
                when: (answers) => answers.enableDocker
            },
            {
                type: 'confirm',
                name: 'save',
                message: '💾 Save this configuration for next time?',
                default: true
            }
        ]);

        API_URL = answers.apiUrl;
        NODES = answers.nodes.split(',').map((uri: string, i: number) => ({ name: `node${i + 1}`, uri: uri.trim() }));
        NO_DOCKER = !answers.enableDocker;
        DOCKER_NODES = (answers.dockerContainers || '').split(',').map((n: string) => n.trim());

        if (answers.save) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({
                apiUrl: API_URL,
                nodes: NODES,
                dockerNodes: DOCKER_NODES,
                noDocker: NO_DOCKER
            }, null, 2));
            console.log('✅ Configuration saved to dashboard.json');
            await sleep(1000);
        }
    }

    // Init TUI AFTER prompts
    initTui();

    log('Control Center Ready.');
    if (NO_DOCKER) log('Docker Control: DISABLED');
    log(`API: ${API_URL}`);

    // Init WebSocket
    const socket = io(API_URL.replace('/api/users', '').replace('/api', ''));

    socket.on('connect', () => log('✅ WebSocket Connected'));
    socket.on('disconnect', () => log('❌ WebSocket Disconnected'));
    socket.on('log', (data: any) => {
        let msg = '';
        if (data.type === 'promote') msg = `👑 NEW PRIMARY: ${data.payload.node}`;
        else if (data.type === 'no-writable') msg = `🚨 CRITICAL: NO WRITABLE NODES`;
        else if (data.op) msg = `${data.op.toUpperCase()} ${data.collection} (${data.durationMs}ms) ${data.success ? '✅' : '❌'}`;
        else msg = JSON.stringify(data);
        log(`[WS] ${msg}`);
    });
    socket.on('topology-change', () => {
        log(`[WS] Topology Change`);
        updateTopology();
    });

    // Loops
    setInterval(updateTopology, 2000);
    updateTopology();
}

// Start
main().catch(err => {
    console.error(err);
    process.exit(1);
});
