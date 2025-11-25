#!/usr/bin/env node
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
const blessed_1 = __importDefault(require("blessed"));
const blessed_contrib_1 = __importDefault(require("blessed-contrib"));
const mongodb_1 = require("mongodb");
const http_1 = __importDefault(require("http"));
const child_process_1 = require("child_process");
// Parse Args
const args = process.argv.slice(2);
function getArg(flag, def) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
const API_URL = getArg('--api-url', 'http://localhost:3000/api/users');
const NODES_ARG = getArg('--nodes', 'mongodb://localhost:27017/node-balancer,mongodb://localhost:27018/node-balancer,mongodb://localhost:27019/node-balancer');
const DOCKER_CONTAINERS_ARG = getArg('--docker-containers', 'mongo1,mongo2,mongo3');
const NO_DOCKER = args.includes('--no-docker');
const NODES = NODES_ARG.split(',').map((uri, i) => ({
    name: `node${i + 1}`,
    uri: uri.trim()
}));
const DOCKER_NODES = DOCKER_CONTAINERS_ARG.split(',').map(n => n.trim());
// Screen Setup
const screen = blessed_1.default.screen({
    smartCSR: true,
    title: 'NodeBalancer Control Center'
});
const grid = new blessed_contrib_1.default.grid({ rows: 12, cols: 12, screen: screen });
// Components
const topologyTable = grid.set(0, 0, 6, 4, blessed_contrib_1.default.table, {
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
const latencyLine = grid.set(0, 4, 6, 8, blessed_contrib_1.default.line, {
    style: { line: "yellow", text: "green", baseline: "black" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    legend: { width: 20 },
    label: 'API Response Time (ms)'
});
const logBox = grid.set(6, 0, 6, 8, blessed_contrib_1.default.log, {
    fg: "green",
    selectedFg: "green",
    label: 'Execution Logs'
});
const controls = grid.set(6, 8, 6, 4, blessed_1.default.list, {
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
// State
let latencyData = {
    title: 'Latency',
    x: Array(20).fill('.'),
    y: Array(20).fill(0)
};
// Utils
function log(msg) {
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    logBox.log(`[${time}] ${msg}`);
    screen.render();
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => setTimeout(resolve, ms));
    });
}
// API Interaction
function request(method) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const start = Date.now();
            const data = method === 'POST' ? JSON.stringify({
                name: `User ${Date.now()}`,
                email: `user${Date.now()}@test.com`,
                password: '123'
            }) : undefined;
            const req = http_1.default.request(API_URL, {
                method,
                headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': data === null || data === void 0 ? void 0 : data.length } : {},
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
            if (data)
                req.write(data);
            req.end();
        });
    });
}
function updateLatencyGraph(ms) {
    latencyData.y.shift();
    latencyData.y.push(ms);
    latencyLine.setData([latencyData]);
    screen.render();
}
// Cluster Logic
function getPrimary() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const node of NODES) {
            try {
                const client = new mongodb_1.MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
                yield client.connect();
                const hello = yield client.db('admin').command({ hello: 1 });
                yield client.close();
                if (hello.isWritablePrimary)
                    return node.name;
            }
            catch (e) { }
        }
        return null;
    });
}
function updateTopology() {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = [];
        for (const node of NODES) {
            let status = 'DOWN';
            let count = '-';
            try {
                const client = new mongodb_1.MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
                yield client.connect();
                const db = client.db('node-balancer'); // Assuming DB name is consistent or part of URI, but here hardcoded for now or could be arg
                const hello = yield db.command({ hello: 1 });
                count = (yield db.collection('users').countDocuments()).toString();
                yield client.close();
                status = hello.isWritablePrimary ? 'PRIMARY' : 'SECONDARY';
            }
            catch (e) { }
            rows.push([node.name, status, count]);
        }
        topologyTable.setData({ headers: ['Node', 'State', 'Docs'], data: rows });
        screen.render();
    });
}
// Actions
function runBatch() {
    return __awaiter(this, void 0, void 0, function* () {
        log('Sending 2 POST + 1 GET...');
        const s1 = yield request('POST');
        log(`POST: ${s1}`);
        const s2 = yield request('POST');
        log(`POST: ${s2}`);
        const s3 = yield request('GET');
        log(`GET: ${s3}`);
    });
}
function runChaosDemo() {
    return __awaiter(this, void 0, void 0, function* () {
        log('🚀 STARTING CHAOS DEMO');
        // Phase 1
        log('Phase 1: Healthy State');
        yield runBatch();
        if (NO_DOCKER) {
            log('Skipping Chaos (No Docker Mode)');
        }
        else {
            // Chaos
            const primaryName = yield getPrimary(); // returns node1, node2...
            // We need to map node name to container name if they differ, but here we assume index matching or we need smarter logic
            // For simplicity in this generic version, let's try to find the container name based on index
            const primaryIndex = NODES.findIndex(n => n.name === primaryName);
            const containerName = primaryIndex !== -1 ? DOCKER_NODES[primaryIndex] : null;
            if (containerName) {
                log(`💥 Stopping PRIMARY: ${containerName}`);
                try {
                    (0, child_process_1.execSync)(`docker stop ${containerName}`);
                }
                catch (e) {
                    log('Error stopping node');
                }
            }
            else {
                log('No Primary found to stop!');
            }
            // Phase 2
            log('Phase 2: Failover State');
            yield sleep(2000);
            yield runBatch();
            // Recovery
            log('Waiting 5s before recovery...');
            yield sleep(5000);
            if (containerName) {
                log(`♻️  Restarting ${containerName}`);
                try {
                    (0, child_process_1.execSync)(`docker start ${containerName}`);
                }
                catch (e) {
                    log('Error starting node');
                }
            }
        }
        // Phase 3
        log('Phase 3: Recovery State');
        yield sleep(5000);
        yield runBatch();
        log('✅ DEMO COMPLETED');
    });
}
// Controls Event Handler
controls.on('select', (item, index) => __awaiter(void 0, void 0, void 0, function* () {
    const cmd = item.getText();
    if (cmd.includes('RUN CHAOS DEMO')) {
        runChaosDemo();
    }
    else if (cmd.includes('SEND BATCH')) {
        runBatch();
    }
    else if (cmd.includes('STOP PRIMARY')) {
        if (NO_DOCKER)
            return log('Docker disabled.');
        const pName = yield getPrimary();
        const pIdx = NODES.findIndex(n => n.name === pName);
        const container = pIdx !== -1 ? DOCKER_NODES[pIdx] : null;
        if (container) {
            log(`Stopping ${container}...`);
            try {
                (0, child_process_1.execSync)(`docker stop ${container}`);
                log('Stopped.');
            }
            catch (e) {
                log('Error.');
            }
        }
        else {
            log('No Primary found.');
        }
    }
    else if (cmd.includes('START MONGO') || cmd.includes('START NODE')) { // Generic match
        if (NO_DOCKER)
            return log('Docker disabled.');
        // Extract container name from string "START MONGO1"
        const parts = cmd.split(' ');
        const container = parts[1].toLowerCase(); // mongo1
        log(`Starting ${container}...`);
        try {
            (0, child_process_1.execSync)(`docker start ${container}`);
            log('Started.');
        }
        catch (e) {
            log('Error.');
        }
    }
    else if (cmd.includes('START STACK')) {
        if (NO_DOCKER)
            return log('Docker disabled.');
        log('Starting stack...');
        try {
            (0, child_process_1.execSync)('docker-compose up -d');
            log('Stack up.');
        }
        catch (e) {
            log(`Error: ${e.message.split('\n')[0]}`);
        }
    }
    else if (cmd.includes('EXIT')) {
        process.exit(0);
    }
}));
// Loops
setInterval(updateTopology, 2000);
// Init
controls.focus();
log('Control Center Ready.');
if (NO_DOCKER)
    log('Docker Control: DISABLED');
log(`API: ${API_URL}`);
updateTopology();
screen.render();
// Exit
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
