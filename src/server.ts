import app from './app';
import { logger } from './middlewares/logger';

import { initWebSocket } from './config/websocket';

import { register } from './config/metrics';

const PORT = process.env.PORT || 3000;

app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (ex) {
        logger.error('Error while serving /metrics endpoint', ex);
        res.status(500).end('Internal server error');
    }
});

const server = app.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT}`);
});

initWebSocket(server);
