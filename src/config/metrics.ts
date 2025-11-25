import client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (cpu, memory, etc.)
client.collectDefaultMetrics({ register });

// Define custom metrics
export const connectionStatus = new client.Gauge({
    name: 'node_balancer_connection_status',
    help: 'Status of the MongoDB connection (1 = connected, 0 = disconnected)',
    registers: [register]
});

export const failoverCount = new client.Counter({
    name: 'node_balancer_failover_count',
    help: 'Total number of failover events triggered',
    registers: [register]
});

export const operationDuration = new client.Histogram({
    name: 'node_balancer_operation_duration_seconds',
    help: 'Duration of database operations in seconds',
    labelNames: ['operation', 'collection', 'success'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
});
