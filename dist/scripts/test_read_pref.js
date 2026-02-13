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
const connectionManager_1 = require("../config/connectionManager");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const envNodes = process.env.MONGODB_NODES || '';
        const nodes = envNodes ? envNodes.split(',') : [
            'mongodb://localhost:27017',
            'mongodb://localhost:27018',
            'mongodb://localhost:27019'
        ];
        console.log('--- Testing Read Preference and Multi-Node support ---');
        console.log(`Nodes: ${nodes.join(', ')}`);
        const db = new connectionManager_1.ConnectionManager({
            nodes,
            healthCheckIntervalMs: 2000,
            maxPoolSize: 5,
            minPoolSize: 1
        });
        try {
            yield db.init();
            console.log('✅ Initialization complete.');
            // Test Write (Primary)
            console.log('📝 Testing Write (Primary)...');
            try {
                yield db.write('test_reads', (col) => __awaiter(this, void 0, void 0, function* () {
                    yield col.insertOne({ test: 'read_pref', date: new Date() });
                }));
                console.log('✅ Write successful.');
            }
            catch (err) {
                console.warn('⚠️ Write failed (No Primary?), skipping to read tests... Error:', err.message);
            }
            // Test Read (Primary default)
            console.log('📖 Testing Read (Primary Default)...');
            try {
                const res1 = yield db.read('test_reads', (col) => __awaiter(this, void 0, void 0, function* () {
                    return col.findOne({ test: 'read_pref' });
                }));
                console.log('✅ Read Primary result:', res1 === null || res1 === void 0 ? void 0 : res1._id);
            }
            catch (err) {
                console.warn('⚠️ Read Primary failed (No Primary?), skipping... Error:', err.message);
            }
            // Test Read (Secondary Strict)
            console.log('📖 Testing Read (Secondary Strict)...');
            try {
                const res2 = yield db.read('test_reads', (col) => __awaiter(this, void 0, void 0, function* () {
                    return col.findOne({ test: 'read_pref' });
                }), {}, 'secondary'); // <--- requesting secondary
                console.log('✅ Read Secondary result:', res2 === null || res2 === void 0 ? void 0 : res2._id);
            }
            catch (err) {
                console.error('❌ Read Secondary failed:', err.message);
            }
            // Test Read (Secondary Preferred)
            console.log('📖 Testing Read (Secondary Preferred)...');
            const res3 = yield db.read('test_reads', (col) => __awaiter(this, void 0, void 0, function* () {
                return col.findOne({ test: 'read_pref' });
            }), {}, 'secondaryPreferred');
            console.log('✅ Read SecondaryPreferred result:', res3 === null || res3 === void 0 ? void 0 : res3._id);
        }
        catch (err) {
            console.error('❌ Test failed:', err);
        }
        finally {
            yield db.close();
            console.log('👋 Connection closed.');
            process.exit(0);
        }
    });
}
run();
