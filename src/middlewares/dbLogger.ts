import { Request, Response, NextFunction } from 'express';
import { Log } from '../models/Log.model';

// Middleware para gravar logs de operações no banco
export const dbLogger = async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', async () => {
        const duration = Date.now() - start;
        const status = res.statusCode;

        const isRead = req.method === 'GET';
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

        if ((isRead || isWrite) && status >= 200 && status < 300) {
            const operation = isRead ? 'READ' : 'WRITE';

            try {
                await Log.create({
                    method: req.method,
                    route: req.originalUrl,
                    operation,
                    status,
                    responseTime: duration,
                });
            } catch (err) {
                console.error('Erro ao salvar log no banco:', err);
            }
        }
    });

    next();
};
