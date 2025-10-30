import app from './app';
import { connectDatabase } from './config/database';

const port = process.env.PORT || 3000;

connectDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });
});
