import express from 'express';
import dotenv from 'dotenv';
import { morganMiddleware, logger } from './middlewares/logger';
import { connectDatabase } from './config/database';
import userRoutes from './routes/user.route';
import {dbLogger} from "./middlewares/dbLogger";

dotenv.config();
connectDatabase();

const app = express();
app.use(express.json());
app.use(morganMiddleware);
app.use(dbLogger);

app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Node balancer online!' });
});

export default app;
