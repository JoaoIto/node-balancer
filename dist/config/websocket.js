"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initWebSocket = void 0;
const socket_io_1 = require("socket.io");
const logger_1 = require("../middlewares/logger");
let io = null;
const initWebSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    io.on('connection', (socket) => {
        logger_1.logger.info(`New WebSocket connection: ${socket.id}`);
        socket.on('disconnect', () => {
            logger_1.logger.info(`WebSocket disconnected: ${socket.id}`);
        });
    });
    logger_1.logger.info('WebSocket Server initialized');
    return io;
};
exports.initWebSocket = initWebSocket;
const getIO = () => {
    if (!io) {
        logger_1.logger.warn('getIO called before initialization');
    }
    return io;
};
exports.getIO = getIO;
