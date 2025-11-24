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
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const mongodb_1 = require("mongodb");
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
function log(prefix, msg, color = colors.reset) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`${colors.gray}[${timestamp}]${colors.reset} ${color}${prefix.padEnd(10)}${colors.reset} ${msg}`);
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => setTimeout(resolve, ms));
    });
}
function getPrimary() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const node of NODES) {
            const client = new mongodb_1.MongoClient(node.uri, { serverSelectionTimeoutMS: 1000, directConnection: true });
            try {
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
function checkTopology() {
    return __awaiter(this, void 0, void 0, function* () {
        const statuses = yield Promise.all(NODES.map((node) => __awaiter(this, void 0, void 0, function* () {
            const client = new mongodb_1.MongoClient(node.uri, { serverSelectionTimeoutMS: 500, directConnection: true });
            try {
                yield client.connect();
                const db = client.db('node-balancer');
                const hello = yield db.command({ hello: 1 });
                const count = yield db.collection('users').countDocuments();
                yield client.close();
                const state = hello.isWritablePrimary ? 'PRIMARY' : 'SECONDARY';
                const color = hello.isWritablePrimary ? colors.green : colors.blue;
                return `${node.name}: ${color}${state}${colors.reset} (${count})`;
            }
            catch (e) {
                return `${node.name}: ${colors.red}DOWN${colors.reset}`;
            }
        })));
        log('CLUSTER', statuses.join(' | '), colors.magenta);
    });
}
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
                headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': data === null || data === void 0 ? void 0 : data.length } : {}
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
            if (data)
                req.write(data);
            req.end();
        });
    });
}
function runBatch() {
    return __awaiter(this, void 0, void 0, function* () {
        log('TEST', 'Running Batch: 2 POST + 1 GET', colors.cyan);
        yield request('POST');
        yield request('POST');
        yield request('GET');
        yield checkTopology();
    });
}
function startDemo() {
    return __awaiter(this, void 0, void 0, function* () {
        console.clear();
        log('DEMO', '🚀 Starting Succinct Failover Demo', colors.cyan);
        // 1. Ensure Stack
        try {
            (0, child_process_1.execSync)('docker-compose up -d', { stdio: 'ignore' });
        }
        catch (e) { }
        // 2. Stream Logs
        const dockerLogs = (0, child_process_1.spawn)('docker', ['logs', '-f', 'node-api']);
        dockerLogs.stdout.on('data', (d) => {
            d.toString().split('\n').forEach((l) => {
                if (l.trim())
                    console.log(`${colors.gray}[API]      ${l.trim()}${colors.reset}`);
            });
        });
        // 3. Initial State
        yield sleep(2000);
        yield checkTopology();
        // 4. Phase 1: Healthy
        yield runBatch();
        // 5. Chaos: Stop Primary
        const primary = yield getPrimary();
        if (primary) {
            log('CHAOS', `💥 Stopping PRIMARY: ${primary}`, colors.red);
            (0, child_process_1.execSync)(`docker stop ${primary}`);
        }
        else {
            log('CHAOS', 'Could not find primary!', colors.red);
        }
        // 6. Phase 2: Failover
        yield sleep(2000); // Give a moment for election
        yield runBatch();
        // 7. Wait 5s
        log('WAIT', 'Waiting 5 seconds...', colors.yellow);
        yield sleep(5000);
        // 8. Recovery
        if (primary) {
            log('CHAOS', `♻️  Restarting ${primary}`, colors.green);
            (0, child_process_1.execSync)(`docker start ${primary}`);
        }
        // 9. Phase 3: Recovery
        yield sleep(5000); // Wait for rejoin
        yield runBatch();
        log('DEMO', '✅ Demo Completed', colors.cyan);
        process.exit(0);
    });
}
startDemo();
