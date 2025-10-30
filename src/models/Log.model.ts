import mongoose, { Schema, Document } from 'mongoose';

export interface ILog extends Document {
    method: string;
    route: string;
    operation: 'READ' | 'WRITE';
    status: number;
    responseTime: number;
    timestamp: Date;
}

const LogSchema = new Schema<ILog>({
    method: { type: String, required: true },
    route: { type: String, required: true },
    operation: { type: String, enum: ['READ', 'WRITE'], required: true },
    status: { type: Number, required: true },
    responseTime: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
});

export const Log = mongoose.model<ILog>('Log', LogSchema);
