# Node Balancer

[![NPM Version](https://img.shields.io/npm/v/replica-failover-mongodb-ts?style=flat-square)](https://www.npmjs.com/package/replica-failover-mongodb-ts)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

## 🚀 QuickStart (Plug & Play)

Escolha como você quer usar o projeto:

### Opção A: Via NPM (Apenas Dashboard)
Ideal se você já tem um cluster MongoDB e quer apenas visualizar/controlar.

1.  **Instale a ferramenta globalmente:**
    ```bash
    npm install -g replica-failover-mongodb-ts
    ```

2.  **Rode o dashboard:**
    ```bash
    node-balancer-dashboard
    ```

3.  **Responda às perguntas de configuração:**
    O sistema pedirá os dados do seu ambiente. Exemplo de preenchimento:

    -   **API URL**: `http://localhost:3000/api/users`
    -   **MongoDB Nodes**: `mongodb://localhost:27017,mongodb://localhost:27018`
    -   **Enable Docker Control?**: `Yes` (Se quiser parar/iniciar containers pelo painel)
    -   **Docker Container Names**: `mongo1,mongo2,mongo3`

### Opção B: Via Git (Ambiente Completo)
Ideal para ver a mágica acontecer do zero (cria API + Banco + Réplicas).

1.  **Clone e Instale:**
    ```bash
    git clone https://github.com/JoaoIto/node-balancer.git
    cd node-balancer
    npm install
    ```

2.  **Suba o Ambiente (Docker):**
    ```bash
    docker-compose up -d --build
    ```
    *Aguarde ~30s para o cluster configurar.*

3.  **Rode o Dashboard:**
    ```bash
    npm run dashboard
    ```
    *Pronto! Selecione "RUN CHAOS DEMO" e divirta-se.*

---

## Sobre o Projeto: "Node Balancer"

O Node Balancer é uma API escalável construída utilizando Node.js, MongoDB com replica set para alta disponibilidade, e Nginx como balanceador de carga. O sistema foi projetado para garantir resiliência, escalabilidade e alta disponibilidade. A arquitetura permite a adição manual de instâncias backend (Node.js) e garante que, em caso de falhas, o sistema continue operando sem interrupções, com a replicação automática dos dados e balanceamento de carga eficiente.

## Arquitetura - Diagrama ilustrativo

[![DiagramaScale](docs/images/diagramEscale.png)](https://raw.githubusercontent.com/JoaoIto/node-balancer/refs/heads/main/docs/images/diagramEscale.png)

## Sumário

1.  [Tecnologias](#tecnologias)
2.  [Como Rodar o Projeto (Dev)](#como-rodar-o-projeto-dev)
3.  [Uso como Biblioteca (Library)](#uso-como-biblioteca-library)
4.  [Visual Dashboard (Painel de Controle)](#visual-dashboard-painel-de-controle)
5.  [Uso Avançado do Dashboard (CLI)](#uso-avançado-do-dashboard-cli)
6.  [Testes e Automação (Chaos Testing)](#testes-e-automação-chaos-testing)
7.  [Observabilidade (v3.0)](#observabilidade-v30)
8.  [Documentação Detalhada](#documentação-detalhada)
9.  [Configuração Manual (Referência)](#configuração-manual-referência)

---

## Tecnologias

O Node Balancer utiliza as seguintes tecnologias:

-   **Node.js (com Express.js)**: Para a criação de APIs RESTful escaláveis e modularizadas.
-   **MongoDB Replica Set**: Para garantir alta disponibilidade e redundância de dados, com failover automático.
-   **Nginx**: Como balanceador de carga para distribuir as requisições entre as instâncias do backend.
-   **Docker**: Para containerização das instâncias Node.js, permitindo fácil replicação e deploy.
-   **Monitoramento**: O sistema está em processo de monitoramento para garantir a continuidade e performance da aplicação.

---

## Como Rodar o Projeto (Dev)

### Pré-requisitos
-   Docker e Docker Compose instalados.
-   Node.js (para rodar os scripts de teste localmente).

### Passo a Passo

1.  **Clone o repositório e entre na pasta:**
    ```bash
    git clone https://github.com/JoaoIto/node-balancer.git
    cd NodeBalancer
    ```

2.  **Suba o ambiente com Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
    Isso iniciará:
    -   3 nós MongoDB (`mongo1`, `mongo2`, `mongo3`).
    -   1 container de inicialização (`replica-init`) que configura o cluster.
    -   1 API Node.js (`node-api`).

3.  **Verifique se tudo está rodando:**
    ```bash
    docker-compose ps
    ```

---

## Uso como Biblioteca (Library)

Você pode usar o gerenciador de conexões resiliente deste projeto em sua própria aplicação Node.js ou NestJS.

### Modo Simples (Recomendado)

Basta passar a string de conexão padrão do MongoDB. A lib detecta automaticamente os nós e o banco de dados.

1.  **Instale a lib:**
    ```bash
    npm install replica-failover-mongodb-ts
    ```

2.  **Importe e use:**
    ```typescript
    import { ConnectionManager } from 'replica-failover-mongodb-ts';

    // ✨ Plug & Play: Apenas a string de conexão!
    const db = new ConnectionManager({
        connectionString: 'mongodb://mongo1:27017,mongo2:27017/mydb'
    });

    await db.init();
    
    // ✅ Failover automático para QUALQUER collection
    // Você NÃO precisa configurar as collections antes. Basta usar o nome.
    
    // Leitura na collection 'users'
    const users = await db.read('users', c => c.find().toArray());
    
    // Escrita na collection 'logs'
    await db.write('logs', c => c.insertOne({ event: 'login' }));
    
    // Leitura na collection 'products' com preferência Secundária
    const products = await db.read('products', c => c.find().toArray(), {}, 'secondaryPreferred');
    ```

    const products = await db.read('products', c => c.find().toArray(), {}, 'secondaryPreferred');
    ```


### �️ Dashboard "Plug & Play" (Zero Config)

O Dashboard do NodeBalancer é inteligente:
1.  **Auto-Detecção**: Se você tiver um arquivo `.env` com `MONGODB_URI` ou `CONNECTION_STRING`, ele conecta automaticamente!
2.  **Persistência**: Se você configurar manualmente, ele pergunta se quer salvar (cria um `dashboard.json`). Nas próximas vezes, abre direto!

**Para rodar:**
```bash
npm run dashboard
# ou
npx replica-failover-mongodb-ts-dashboard
```

### �🛰️ Monitoramento e Status (Plug & Play)

Você pode verificar a saúde das conexões a qualquer momento ou ouvir eventos em tempo real.

**Verificar Status:**
```typescript
const status = db.getStatus();
console.log(status);
/* Retorno:
{
  isConnected: true,
  dbName: 'mydb',
  primary: 'mongodb://mongo1:27017/mydb',
  secondaries: ['mongodb://mongo2:27017/mydb'],
  totalNodes: 2
}
*/
```

**Ouvir Eventos (Real-time):**
A classe `ConnectionManager` emite eventos que você pode escutar:

```typescript
db.on('failover-start', (reason) => {
    console.warn('⚠️ O banco principal caiu! Iniciando failover...', reason);
});

db.on('failover-complete', ({ newPrimary }) => {
    console.info('✅ Novo banco principal eleito:', newPrimary);
});

db.on('node-lost', ({ count }) => {
    console.error('❌ Um nó secundário caiu. Total restante:', count);
});
```

```typescript
const db = new ConnectionManager({
    nodes: [
        'mongodb://mongo1:27017/mydb',
        'mongodb://mongo2:27017/mydb'
    ],
    healthCheckIntervalMs: 5000,
    minPoolSize: 5
});
```

### Uso com NestJS

Se você usa NestJS, a integração é nativa:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { NodeBalancerModule } from 'replica-failover-mongodb-ts/dist/nestjs';

@Module({
  imports: [
    NodeBalancerModule.forRoot({
      connectionString: 'mongodb://localhost:27017,localhost:27018/mydb',
    }),
  ],
})
export class AppModule {}
```

E para usar nos seus services:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnectionManager } from 'replica-failover-mongodb-ts/dist/nestjs';
import { ConnectionManager } from 'replica-failover-mongodb-ts';

@Injectable()
export class UserService {
  constructor(@InjectConnectionManager() private readonly db: ConnectionManager) {}

  async getUsers() {
    return this.db.read('users', (col) => col.find().toArray());
  }
}
```

---

## Visual Dashboard (Painel de Controle)

Para uma experiência visual e interativa, utilize o nosso Dashboard via Terminal (TUI). Ele permite monitorar a topologia do cluster, gráficos de latência e controlar os nós (Stop/Start) manualmente.

### Como Rodar o Dashboard

```bash
npm run dashboard
```

### O que você verá

![Dashboard](https://raw.githubusercontent.com/JoaoIto/node-balancer/refs/heads/main/docs/images/dashboard-preview.png)

O painel exibe:
-   **Topologia**: Quem é o nó `PRIMARY` (Verde) e quem são os `SECONDARY` (Azul).
-   **Latência**: Gráfico em tempo real do tempo de resposta da API.
-   **Logs**: Histórico de ações e testes.

### Exemplo de Resposta da API (JSON)

Ao realizar testes de carga ou criar usuários via dashboard, a API retornará respostas como:

**Sucesso (201 Created):**
```json
{
  "message": "Usuário criado com sucesso",
  "data": {
    "name": "User 1732500000000",
    "email": "user1732500000000@test.com",
    "_id": "6560f...",
    "createdAt": "2025-11-24T23:00:00.000Z"
  }
}
```

**Erro (Se o banco estiver caindo/failover - 500/Timeout):**
```json
{
  "error": "Database connection failed"
}
```

---

## Uso Avançado do Dashboard (CLI)

O dashboard pode ser configurado para monitorar **qualquer API** e **qualquer cluster MongoDB**, não apenas o deste projeto.

```bash
node-balancer-dashboard [opções]
```

### Opções Disponíveis

| Flag | Descrição | Padrão |
| :--- | :--- | :--- |
| `--api-url` | URL da API para testar latência/requests | `http://localhost:3000/api/users` |
| `--nodes` | Lista de URIs do MongoDB (separados por vírgula) | `mongodb://localhost:27017...` |
| `--no-docker` | Desabilita controles do Docker (para clusters remotos) | `false` |

### Exemplo Real

Testando uma API de produção sem acesso ao Docker local:

```bash
node-balancer-dashboard \
  --api-url https://api.minhaempresa.com/health \
  --nodes mongodb://mongo-prod-1:27017,mongodb://mongo-prod-2:27017 \
  --no-docker
```

---

## Testes e Automação (Chaos Testing)

Se preferir rodar apenas o script de teste sem o dashboard visual:

### Executando o Demo Automatizado

```bash
npm run ops:demo
```

*(Se estiver no Windows/PowerShell e tiver problemas, use: `cmd /c "npm run ops:demo"`)*

**O que este script faz:**
1.  Verifica a topologia do cluster.
2.  Envia requisições de teste (POST e GET).
3.  **Derruba automaticamente o nó Primary**.
4.  Prova que a API continua funcionando (Failover).
5.  Reinicia o nó e verifica a recuperação.

---

## Observabilidade (v3.0)

A versão 3.0 introduz recursos avançados de monitoramento para produção:

### 🔔 Webhooks (Rápido)
Receba alertas no seu Slack ou Discord. Basta passar a URL ao iniciar:

```typescript
const db = new ConnectionManager({
    nodes: [...],
    webhookUrl: 'https://discord.com/api/webhooks/...' // Sua URL aqui
});
```
*O sistema fará um POST automático com JSON sempre que houver um failover.*

### 📊 Métricas e Real-time
-   **Prometheus**: Acesse `http://localhost:3000/metrics` para ver dados de latência e conexão.
-   **WebSocket**: Conecte via Socket.io para receber logs em tempo real.

👉 **[Leia o guia completo de Observabilidade (Português)](docs/observability.md)**

---

## Documentação Detalhada

Para mais detalhes, consulte os guias na pasta `docs/`:

-   🖥️ **[Guia do Dashboard (Visual Runner)](docs/dashboard-runner.md)**: Manual completo do painel interativo.
-   📄 **[Guia de Testes e Execução (Demo Runner)](docs/demo-runner.md)**: Passo a passo detalhado de como rodar os testes manuais e automatizados.
-   🛠️ **[Documentação dos Scripts](docs/scripts.md)**: Explicação técnica de como os scripts de automação funcionam.
-   📡 **[Observabilidade e Alertas](docs/observability.md)**: Guia de configuração de Webhooks, Métricas e WebSocket.

---

## Configuração Manual (Referência)

### Configuração Banco de Dados

#### **Verifique a Configuração do Replica Set**

-   As variáveis base estão no arquivo de **`.env.local`**

Se você estiver usando o **MongoDB replica set**, a URL de conexão deve ser configurada corretamente para isso. Em um replica set, a URL de conexão precisa incluir **todos os membros** do replica set. A URL de conexão para um MongoDB replica set deve ser algo assim:

```env
MONGODB_URI=mongodb://localhost:27017,localhost:27018,localhost:27019/node-balancer?replicaSet=rs0
```

#### **Configuração do Replica Set no MongoDB**

Se você está utilizando o **MongoDB replica set**, certifique-se de que o replica set está configurado corretamente no MongoDB:

1.  **Verifique se o MongoDB está rodando** no modo replica set. Você pode iniciar o MongoDB com o seguinte comando:

    ```bash
    mongod --replSet rs0
    ```

2.  **Configuração do Replica Set**: Após iniciar o MongoDB, conecte-se a ele e configure o replica set:

    ```bash
    mongo
    ```

    Dentro do shell do MongoDB, inicialize o replica set:

    ```javascript
    rs.initiate({
      _id: "rs0",
      members: [
        { _id: 0, host: "localhost:27017" },
        { _id: 1, host: "localhost:27018" },
        { _id: 2, host: "localhost:27019" }
      ]
    });
    ```

3.  **Verifique o status do replica set**:

    ```javascript
    rs.status();
    ```

---

## Autor

| [<img src="https://github.com/JoaoIto.png" width="100px;" alt="João Ito"/>](https://github.com/JoaoIto) |
| :---: |
| **João Ito** |
| [GitHub](https://github.com/JoaoIto) • [Email](mailto:joaovictorpfr@gmail.com) |

Feito com ❤️ por João Ito. Entre em contato!

## Licença

Este projeto está licenciado sob a licença ISC - veja o arquivo [LICENSE](LICENSE) para detalhes.
