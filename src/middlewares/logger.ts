import morgan from 'morgan';
import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(
            ({ level, message, timestamp }) =>
                `${timestamp} [${level.toUpperCase()}] ${message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'server.log' }),
    ],
});

export const morganMiddleware = morgan((tokens, req, res) => {
    const status = Number(tokens.status(req, res));
    const method = tokens.method(req, res);
    const url = tokens.url(req, res);
    const responseTime = tokens['response-time'](req, res);

    const color =
        status >= 500
            ? '\x1b[31m' // vermelho
            : status >= 400
                ? '\x1b[33m' // amarelo
                : status >= 300
                    ? '\x1b[36m' // ciano
                    : '\x1b[32m'; // verde

    const methodColor =
        method === 'GET'
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
    stream: { write: (msg) => logger.info(msg.trim()) },
});
