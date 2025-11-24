"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const uri = process.env.MONGO_URI || 'mongodb://192.168.0.70:27017,192.168.0.70:27018,192.168.0.70:27019/node-balancer?replicaSet=rs0&retryWrites=true&w=majority';
mongoose_1.default.connect(uri)
    .then(() => console.log('✅ Mongo conectado (replica set local)'))
    .catch(err => console.error('❌ Erro conexão mongo:', err));
