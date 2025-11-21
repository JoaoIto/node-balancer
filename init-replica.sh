#!/bin/bash

echo "Aguardando os nós do MongoDB iniciarem..."
sleep 15

echo "Iniciando configuração do Replica Set..."
mongosh --host mongo1:27017 --eval '
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo1:27017" },
      { _id: 1, host: "mongo2:27017" },
      { _id: 2, host: "mongo3:27017" }
    ]
  })
'

echo "Configuração do Replica Set concluída."
