# Node Balancer

## Sobre o Projeto: "Node Balancer"

O Node Balancer é uma API escalável construída utilizando Node.js, MongoDB com replica set para alta disponibilidade, e Nginx como balanceador de carga. O sistema foi projetado para garantir resiliência, escalabilidade e alta disponibilidade. A arquitetura permite a adição manual de instâncias backend (Node.js) e garante que, em caso de falhas, o sistema continue operando sem interrupções, com a replicação automática dos dados e balanceamento de carga eficiente.

## Arquitetura - Diagrama ilustrativo

![img.png](https://raw.githubusercontent.com/JoaoIto/node-balancer/refs/heads/main/docs/images/diagramEscale.png)

## Sumário

1.  [Tecnologias](#tecnologias)
2.  [Como Rodar o Projeto](#como-rodar-o-projeto)
3.  [Testes e Automação (Chaos Testing)](#testes-e-automação-chaos-testing)
4.  [Documentação Detalhada](#documentação-detalhada)
5.  [Configuração Manual (Referência)](#configuração-manual-referência)

---

## Tecnologias

O Node Balancer utiliza as seguintes tecnologias:

-   **Node.js (com Express.js)**: Para a criação de APIs RESTful escaláveis e modularizadas.
-   **MongoDB Replica Set**: Para garantir alta disponibilidade e redundância de dados, com failover automático.
-   **Nginx**: Como balanceador de carga para distribuir as requisições entre as instâncias do backend.
-   **Docker**: Para containerização das instâncias Node.js, permitindo fácil replicação e deploy.
-   **Monitoramento**: O sistema está em processo de monitoramento para garantir a continuidade e performance da aplicação.

---

## Como Rodar o Projeto

### Pré-requisitos
-   Docker e Docker Compose instalados.
-   Node.js (para rodar os scripts de teste localmente).

### Passo a Passo

1.  **Clone o repositório e entre na pasta:**
    ```bash
    git clone <repo-url>
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

## Testes e Automação (Chaos Testing)

Implementamos scripts automatizados para testar a resiliência do sistema. O principal teste é o **Demo de Failover**, que simula a queda do nó primário do banco de dados enquanto a API está recebendo tráfego.

### Executando o Demo

```bash
npm run ops:demo
```

*(Se estiver no Windows/PowerShell e tiver problemas, use: `cmd /c "npm run ops:demo"`)*

**O que esperar:**
1.  O script verificará a topologia do cluster (quem é Primary/Secondary).
2.  Enviará requisições de teste (POST e GET).
3.  **Derrubará automaticamente o nó Primary**.
4.  Continuará enviando requisições para provar que a API não parou (Failover).
5.  Reiniciará o nó e verificará a recuperação.

---

## Documentação Detalhada

Para mais detalhes, consulte os guias na pasta `docs/`:

-   📄 **[Guia de Testes e Execução (Demo Runner)](docs/demo-runner.md)**: Passo a passo detalhado de como rodar os testes manuais e automatizados, com exemplos de logs.
-   🛠️ **[Documentação dos Scripts](docs/scripts.md)**: Explicação técnica de como os scripts de automação (`src/scripts/`) funcionam.

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
