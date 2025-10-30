import app from './app';
import { logger } from './middlewares/logger';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT}`);
});
