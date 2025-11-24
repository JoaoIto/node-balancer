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
exports.connectDatabase = connectDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../middlewares/logger"); // garante logs visuais
const Log_model_1 = require("../models/Log.model"); // para registrar no banco
function connectDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/node-balancer?replicaSet=rs0&retryWrites=true&w=majority';
            // Log informativo
            logger_1.logger.info(`Tentando conectar ao MongoDB em: ${mongoUri}`);
            yield mongoose_1.default.connect(mongoUri, {
                // opções recomendadas para estabilidade
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                maxPoolSize: 10,
            });
            logger_1.logger.info('✅ Conectado ao MongoDB com sucesso!');
            // Eventos de conexão e desconexão
            mongoose_1.default.connection.on('connected', () => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.info('🟢 Conexão estabelecida com o MongoDB.');
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'CONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (err) {
                    logger_1.logger.error('Erro ao registrar log de conexão:', err);
                }
            }));
            mongoose_1.default.connection.on('disconnected', () => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.warn('🔴 MongoDB desconectado.');
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'DISCONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (err) {
                    logger_1.logger.error('Erro ao registrar log de desconexão:', err);
                }
            }));
            mongoose_1.default.connection.on('connected', () => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.info('🟢 Conexão estabelecida com o MongoDB.');
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'CONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (err) {
                    logger_1.logger.error('Erro ao registrar log de conexão:', err);
                }
            }));
            mongoose_1.default.connection.on('disconnected', () => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.warn('🔴 MongoDB desconectado.');
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'DISCONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (err) {
                    logger_1.logger.error('Erro ao registrar log de desconexão:', err);
                }
            }));
            mongoose_1.default.connection.on('reconnected', () => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.info('🟡 MongoDB reconectado!');
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'RECONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (err) {
                    logger_1.logger.error('Erro ao registrar log de reconexão:', err);
                }
            }));
            mongoose_1.default.connection.on('error', (err) => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.error('Erro na conexão MongoDB:', err);
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'CONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (e) {
                    logger_1.logger.error('Erro ao registrar log de erro de conexão:', e);
                }
            }));
            mongoose_1.default.connection.on('error', (err) => __awaiter(this, void 0, void 0, function* () {
                logger_1.logger.error('Erro na conexão MongoDB:', err);
                try {
                    yield new Log_model_1.Log({
                        method: 'SYSTEM',
                        route: 'DATABASE',
                        operation: 'CONNECTED',
                        status: 200,
                        responseTime: 0,
                    }).save();
                }
                catch (e) {
                    logger_1.logger.error('Erro ao registrar log de erro de conexão:', e);
                }
            }));
        }
        catch (error) {
            logger_1.logger.error('❌ Falha ao conectar ao MongoDB:', error);
            process.exit(1);
        }
    });
}
