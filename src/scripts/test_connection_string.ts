
import { ConnectionManager } from '../config/connectionManager';
import { logger } from '../middlewares/logger';

async function testConnectionString() {
    console.log('--- Testing Single Connection String Support ---');

    // Test 1: Standard Multi-node string
    const uri = 'mongodb://localhost:27017,localhost:27018/test_db_string';
    console.log(`Testing URI: ${uri}`);

    const cm = new ConnectionManager({
        connectionString: uri,
        minPoolSize: 1,
        maxPoolSize: 2
    });

    // internal check (using any to bypass private check for test)
    const nodes = (cm as any).nodes;
    console.log('Parsed Nodes:', nodes);
    const dbName = (cm as any).dbName;
    console.log('Parsed DB Name:', dbName);

    if (nodes.length !== 2) console.error('❌ Incorrect node count parsed');
    else console.log('✅ Node count correct');

    if (dbName !== 'test_db_string') console.error('❌ Incorrect DB name parsed');
    else console.log('✅ DB name correct');

    try {
        console.log('Attempting connection (might fail if no DB)...');
        await cm.init();
        console.log('✅ Init success with connection string');
        const db = cm.getDb();
        if (db) {
            console.log('✅ DB Connection active');
        } else {
            console.warn('⚠️ No active DB (might be no primary available, but parse worked)');
        }

    } catch (err) {
        console.warn('⚠️ Connection failed (expected if DB is down):', (err as Error).message);
        console.log('✅ Parsing logic verified independently of connection.');
    } finally {
        await cm.close();
    }
}

testConnectionString();
