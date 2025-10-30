import mongoose from 'mongoose';

const uri = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/mydb?replicaSet=rs0&retryWrites=true&w=majority';

mongoose.connect(uri, {
    // opções recomendadas
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    // se você usa TLS/usuario, adicione authSource, tls=true etc.
}).then(() => console.log('Mongo conectado (replica set)'))
    .catch(err => console.error('Erro conexão mongo:', err));
