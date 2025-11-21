import mongoose from 'mongoose';
import { logger } from '../middlewares/logger'; // garante logs visuais
import { Log } from '../models/Log.model';      // para registrar no banco

export async function connectDatabase(): Promise<void> {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/node-balancer?replicaSet=rs0&retryWrites=true&w=majority';

        // Log informativo
        logger.info(`Tentando conectar ao MongoDB em: ${mongoUri}`);

        await mongoose.connect(mongoUri, {
            // opções recomendadas para estabilidade
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        });

        logger.info('✅ Conectado ao MongoDB com sucesso!');

        // Eventos de conexão e desconexão
        mongoose.connection.on('connected', async () => {
            logger.info('🟢 Conexão estabelecida com o MongoDB.');
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'CONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (err) {
                logger.error('Erro ao registrar log de conexão:', err);
            }
        });

        mongoose.connection.on('disconnected', async () => {
            logger.warn('🔴 MongoDB desconectado.');
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'DISCONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (err) {
                logger.error('Erro ao registrar log de desconexão:', err);
            }
        });

        mongoose.connection.on('connected', async () => {
            logger.info('🟢 Conexão estabelecida com o MongoDB.');
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'CONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (err) {
                logger.error('Erro ao registrar log de conexão:', err);
            }
        });

        mongoose.connection.on('disconnected', async () => {
            logger.warn('🔴 MongoDB desconectado.');
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'DISCONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (err) {
                logger.error('Erro ao registrar log de desconexão:', err);
            }
        });

        mongoose.connection.on('reconnected', async () => {
            logger.info('🟡 MongoDB reconectado!');
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'RECONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (err) {
                logger.error('Erro ao registrar log de reconexão:', err);
            }
        });

        mongoose.connection.on('error', async (err) => {
            logger.error('Erro na conexão MongoDB:', err);
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'CONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (e) {
                logger.error('Erro ao registrar log de erro de conexão:', e);
            }
        });

        mongoose.connection.on('error', async (err) => {
            logger.error('Erro na conexão MongoDB:', err);
            try {
                await new Log({
                    method: 'SYSTEM',
                    route: 'DATABASE',
                    operation: 'CONNECTED',
                    status: 200,
                    responseTime: 0,
                }).save();

            } catch (e) {
                logger.error('Erro ao registrar log de erro de conexão:', e);
            }
        });

    } catch (error) {
        logger.error('❌ Falha ao conectar ao MongoDB:', error);
        process.exit(1);
    }
}
