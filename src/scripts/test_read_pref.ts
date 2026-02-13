
import { ConnectionManager } from '../config/connectionManager';
import { logger } from '../middlewares/logger';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function run() {
    const envNodes = process.env.MONGODB_NODES || '';
    const nodes = envNodes ? envNodes.split(',') : [
        'mongodb://localhost:27017',
        'mongodb://localhost:27018',
        'mongodb://localhost:27019'
    ];

    console.log('--- Testing Read Preference and Multi-Node support ---');
    console.log(`Nodes: ${nodes.join(', ')}`);

    const db = new ConnectionManager({
        nodes,
        healthCheckIntervalMs: 2000,
        maxPoolSize: 5,
        minPoolSize: 1
    });

    try {
        await db.init();
        console.log('✅ Initialization complete.');

        // Test Write (Primary)
        console.log('📝 Testing Write (Primary)...');
        try {
            await db.write('test_reads', async (col) => {
                await col.insertOne({ test: 'read_pref', date: new Date() });
            });
            console.log('✅ Write successful.');
        } catch (err) {
            console.warn('⚠️ Write failed (No Primary?), skipping to read tests... Error:', (err as Error).message);
        }

        // Test Read (Primary default)
        console.log('📖 Testing Read (Primary Default)...');
        try {
            const res1 = await db.read('test_reads', async (col) => {
                return col.findOne({ test: 'read_pref' });
            });
            console.log('✅ Read Primary result:', res1?._id);
        } catch (err) {
            console.warn('⚠️ Read Primary failed (No Primary?), skipping... Error:', (err as Error).message);
        }

        // Test Read (Secondary Strict)
        console.log('📖 Testing Read (Secondary Strict)...');
        try {
            const res2 = await db.read('test_reads', async (col) => {
                return col.findOne({ test: 'read_pref' });
            }, {}, 'secondary'); // <--- requesting secondary
            console.log('✅ Read Secondary result:', res2?._id);
        } catch (err) {
            console.error('❌ Read Secondary failed:', (err as Error).message);
        }

        // Test Read (Secondary Preferred)
        console.log('📖 Testing Read (Secondary Preferred)...');
        const res3 = await db.read('test_reads', async (col) => {
            return col.findOne({ test: 'read_pref' });
        }, {}, 'secondaryPreferred');
        console.log('✅ Read SecondaryPreferred result:', res3?._id);

    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await db.close();
        console.log('👋 Connection closed.');
        process.exit(0);
    }
}

run();
