"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.morganMiddleware = exports.logger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const winston_1 = __importDefault(require("winston"));
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] ${message}`)),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'server.log' }),
    ],
});
exports.morganMiddleware = (0, morgan_1.default)((tokens, req, res) => {
    const status = Number(tokens.status(req, res));
    const method = tokens.method(req, res);
    const url = tokens.url(req, res);
    const responseTime = tokens['response-time'](req, res);
    const color = status >= 500
        ? '\x1b[31m' // vermelho
        : status >= 400
            ? '\x1b[33m' // amarelo
            : status >= 300
                ? '\x1b[36m' // ciano
                : '\x1b[32m'; // verde
    const methodColor = method === 'GET'
        ? '\x1b[34m' // azul
        : method === 'POST'
            ? '\x1b[32m' // verde
            : method === 'PUT'
                ? '\x1b[33m' // amarelo
                : method === 'DELETE'
                    ? '\x1b[31m' // vermelho
                    : '\x1b[0m';
    const reset = '\x1b[0m';
    return `${color}${status}${reset} ${methodColor}${method}${reset} ${url} - ${responseTime} ms`;
}, {
    stream: { write: (msg) => exports.logger.info(msg.trim()) },
});
