import express from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/user.route';

dotenv.config();

const app = express();
app.use(express.json());

// Rotas principais
app.use('/users', userRoutes);

export default app;
