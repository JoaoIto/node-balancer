
import { ConnectionManager } from '../config/connectionManager';
import { logger } from '../middlewares/logger';

async function testMonitoring() {
    console.log('--- Testing Monitoring & Events ---');

    const uri = 'mongodb://localhost:27017,localhost:27018/test_monitor_db';
    const cm = new ConnectionManager({
        connectionString: uri,
        minPoolSize: 1
    });

    // Check Initial Status
    console.log('Initial Status:', cm.getStatus());

    // Listen to Events
    cm.on('ready', (info) => {
        console.log('✅ EVENT: ready', info);
    });

    cm.on('primary-elected', (info) => {
        console.log('✅ EVENT: primary-elected', info);
    });

    try {
        console.log('Initializing...');
        // We expect this to fail connecting if DB is down, but 'warn' event might emit?
        // Or if it connects, 'ready' emits.

        await cm.init();

        console.log('Post-Init Status:', cm.getStatus());

    } catch (err) {
        console.warn('⚠️ Connection failed (expected if DB is down). Checking status anyway...');
        console.log('Final Status:', cm.getStatus());
    } finally {
        await cm.close();
    }
}

testMonitoring();
