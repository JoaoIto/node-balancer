import { spawn, execSync } from 'child_process';
import http from 'http';

// Configuration
const API_URL = 'http://localhost:3000/api/users';
const CHECK_INTERVAL_MS = 1000;
const CHAOS_DELAY_MS = 5000; // Wait 10s before stopping node
const RECOVERY_DELAY_MS = 10000; // Wait 20s before restarting node

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

function log(prefix: string, msg: string, color: string = colors.reset) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`${colors.reset}[${timestamp}] ${color}${prefix}${colors.reset} ${msg}`);
}

async function startDemo() {
    console.clear();
    log('DEMO', '🚀 Starting NodeBalancer Failover Demo', colors.cyan);

    // 1. Ensure Stack is Up
    log('SETUP', 'Ensuring docker-compose stack is up...', colors.blue);
    try {
        execSync('docker-compose up -d', { stdio: 'ignore' });
    } catch (e) {
        log('ERROR', 'Failed to start docker-compose', colors.red);
        process.exit(1);
    }

    // 2. Stream API Logs
    log('LOGS', 'Streaming API logs...', colors.magenta);
    const dockerLogs = spawn('docker', ['logs', '-f', 'node-api']);

    dockerLogs.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) console.log(`${colors.magenta}[API]${colors.reset} ${line.trim()}`);
        });
    });

    dockerLogs.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) console.log(`${colors.red}[API-ERR]${colors.reset} ${line.trim()}`);
        });
    });

    // 3. Start Traffic Loop
    log('CLIENT', 'Starting traffic loop...', colors.green);
    setInterval(() => {
        const start = Date.now();
        const req = http.get(API_URL, (res) => {
            const duration = Date.now() - start;
            const statusColor = res.statusCode === 200 ? colors.green : colors.red;
            log('CLIENT', `${statusColor}${res.statusCode} OK${colors.reset} - ${duration}ms`, statusColor);
        });

        req.on('error', (e) => {
            const duration = Date.now() - start;
            log('CLIENT', `❌ ERROR: ${e.message} - ${duration}ms`, colors.red);
        });
    }, CHECK_INTERVAL_MS);

    // 4. Chaos Scenario
    setTimeout(() => {
        log('CHAOS', '💥 STOPPING PRIMARY NODE (mongo1)...', colors.red);
        try {
            execSync('docker stop mongo1');
            log('CHAOS', '✅ mongo1 stopped. Watch for failover!', colors.yellow);
        } catch (e) {
            log('CHAOS', 'Failed to stop mongo1', colors.red);
        }

        // 5. Recovery
        setTimeout(() => {
            log('CHAOS', '♻️  RESTARTING PRIMARY NODE (mongo1)...', colors.green);
            try {
                execSync('docker start mongo1');
                log('CHAOS', '✅ mongo1 started. It should rejoin as Secondary.', colors.cyan);
            } catch (e) {
                log('CHAOS', 'Failed to start mongo1', colors.red);
            }
        }, RECOVERY_DELAY_MS);

    }, CHAOS_DELAY_MS);
}

startDemo();
