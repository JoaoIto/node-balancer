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
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbLogger = void 0;
const Log_model_1 = require("../models/Log.model");
// Middleware para gravar logs de operações no banco
const dbLogger = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const start = Date.now();
    res.on('finish', () => __awaiter(void 0, void 0, void 0, function* () {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const isRead = req.method === 'GET';
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if ((isRead || isWrite) && status >= 200 && status < 300) {
            const operation = isRead ? 'READ' : 'WRITE';
            try {
                yield Log_model_1.Log.create({
                    method: req.method,
                    route: req.originalUrl,
                    operation,
                    status,
                    responseTime: duration,
                });
            }
            catch (err) {
                console.error('Erro ao salvar log no banco:', err);
            }
        }
    }));
    next();
});
exports.dbLogger = dbLogger;
