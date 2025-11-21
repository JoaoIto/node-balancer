import mongoose from 'mongoose';

const uri = process.env.MONGO_URI || 'mongodb://192.168.0.70:27017,192.168.0.70:27018,192.168.0.70:27019/node-balancer?replicaSet=rs0&retryWrites=true&w=majority';

mongoose.connect(uri)
    .then(() => console.log('✅ Mongo conectado (replica set local)'))
    .catch(err => console.error('❌ Erro conexão mongo:', err));
