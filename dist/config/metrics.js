"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationDuration = exports.failoverCount = exports.connectionStatus = exports.register = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
// Create a Registry
exports.register = new prom_client_1.default.Registry();
// Add default metrics (cpu, memory, etc.)
prom_client_1.default.collectDefaultMetrics({ register: exports.register });
// Define custom metrics
exports.connectionStatus = new prom_client_1.default.Gauge({
    name: 'node_balancer_connection_status',
    help: 'Status of the MongoDB connection (1 = connected, 0 = disconnected)',
    registers: [exports.register]
});
exports.failoverCount = new prom_client_1.default.Counter({
    name: 'node_balancer_failover_count',
    help: 'Total number of failover events triggered',
    registers: [exports.register]
});
exports.operationDuration = new prom_client_1.default.Histogram({
    name: 'node_balancer_operation_duration_seconds',
    help: 'Duration of database operations in seconds',
    labelNames: ['operation', 'collection', 'success'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [exports.register]
});
