import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../middlewares/logger';

let io: Server | null = null;

export const initWebSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket: Socket) => {
        logger.info(`New WebSocket connection: ${socket.id}`);
        
        socket.on('disconnect', () => {
            logger.info(`WebSocket disconnected: ${socket.id}`);
        });
    });

    logger.info('WebSocket Server initialized');
    return io;
};

export const getIO = (): Server | null => {
    if (!io) {
        logger.warn('getIO called before initialization');
    }
    return io;
};
