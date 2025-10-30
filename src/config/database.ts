import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/node-balancer';
        await mongoose.connect(mongoUri);
        console.log('Conectado ao MongoDB');
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        process.exit(1);
    }
}
