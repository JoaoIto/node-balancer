# Documentação de Execução e Testes (Doc Runner)

Este guia cobre todo o processo de configuração, execução, verificação e testes de falha (failover) do ambiente Node.js + MongoDB Replica Set.

## 1. Configuração do Ambiente

### Arquivos Principais

#### `docker-compose.yml`
Define a infraestrutura com 3 nós MongoDB (`mongo1`, `mongo2`, `mongo3`), um script de inicialização (`replica-init`) e a API (`api`).

```yaml
services:
  mongo1:
    image: mongo:6
    container_name: mongo1
    ports:
      - "27017:27017"
    volumes:
      - ./data/mongo1:/data/db
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    networks:
      - mongo-cluster

  mongo2:
    image: mongo:6
    container_name: mongo2
    ports:
      - "27018:27017"
    volumes:
      - ./data/mongo2:/data/db
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    networks:
      - mongo-cluster

  mongo3:
    image: mongo:6
    container_name: mongo3
    ports:
      - "27019:27017"
    volumes:
      - ./data/mongo3:/data/db
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    networks:
      - mongo-cluster

  replica-init:
    image: mongo:6
    container_name: replica-init
    depends_on:
      - mongo1
      - mongo2
      - mongo3
    volumes:
      - ./init-replica.sh:/init-replica.sh:ro
    entrypoint: ["/bin/bash","/init-replica.sh"]
    networks:
      - mongo-cluster

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: node-api
    depends_on:
      - mongo1
      - mongo2
      - mongo3
      - replica-init
    environment:
      - MONGODB_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/node-balancer?replicaSet=rs0&retryWrites=true&w=majority
      - PORT=3000
    ports:
      - "3000:3000"
    networks:
      - mongo-cluster

networks:
  mongo-cluster:
    driver: bridge
```

#### `init-replica.sh`
Script executado pelo container `replica-init` para configurar o Replica Set `rs0`.

```bash
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
```

## 2. Inicialização

### Comandos
Para subir todo o ambiente:

```powershell
docker-compose up -d --build
```

### Verificação Inicial
Verifique se todos os containers estão rodando:

```powershell
docker-compose ps
```

**Saída esperada:**
Todos os containers (`mongo1`, `mongo2`, `mongo3`, `replica-init`, `node-api`) devem estar com status `Up` (ou `Exited (0)` para o `replica-init` após a conclusão).

## 3. Verificações de Saúde

### Verificar Replica Set
Confira se o cluster MongoDB formou o Replica Set corretamente.

```powershell
docker exec mongo1 mongosh --eval "rs.status()"
```

**O que procurar na saída:**
- `set: 'rs0'`
- `members`: Deve listar 3 membros.
- Um membro deve estar com `stateStr: 'PRIMARY'`.
- Dois membros devem estar com `stateStr: 'SECONDARY'`.

### Verificar Conexão da API
Confira os logs da API para garantir que ela conectou ao banco.

```powershell
docker logs node-api
```

**Saída esperada:**
```
[INFO] Tentando conectar ao MongoDB em: ...
[INFO] ✅ Conectado ao MongoDB com sucesso!
```

### Teste de Requisição
Faça uma requisição para a API para garantir que ela está respondendo.

```powershell
curl http://localhost:3000/api/users
```
(Ou abra no navegador: `http://localhost:3000/api/users`)

## 4. Teste de Failover (Simulação de Falha)

Este teste verifica se a API continua funcionando quando o nó PRIMÁRIO do banco cai.

### Passo 1: Identificar o Primário
Descubra qual container é o primário atual (geralmente `mongo1` no início).

```powershell
docker exec mongo1 mongosh --eval "rs.isMaster().primary"
```

### Passo 2: Iniciar Monitoramento
Abra um terminal separado e rode um loop de requisições para ver a disponibilidade em tempo real.

**PowerShell:**
```powershell
while ($true) { curl http://localhost:3000/api/users; Start-Sleep -Seconds 1 }
```

### Passo 3: Derrubar o Primário
No terminal principal, pare o container que é o primário (ex: `mongo1`).

```powershell
docker stop mongo1
```

### Passo 4: Observar Comportamento
1.  No terminal de monitoramento, você pode ver um ou dois erros de conexão ou timeout brevemente.
2.  Rapidamente (em alguns segundos), as requisições devem voltar a funcionar (status 200).
3.  Isso indica que o driver do MongoDB na API detectou a falha e reconectou automaticamente ao novo Primário eleito.

### Passo 5: Verificar Novo Primário
Verifique quem é o novo primário (provavelmente `mongo2` ou `mongo3`).

```powershell
docker exec mongo2 mongosh --eval "rs.isMaster().primary"
```

### Passo 6: Recuperação
Inicie o nó parado novamente.

```powershell
docker start mongo1
```

Ele deve voltar como SECUNDÁRIO e sincronizar os dados automaticamente.

---
**Fim do Guia**
