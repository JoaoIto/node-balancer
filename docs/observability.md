# Observabilidade e Alertas (v3.0)

A biblioteca NodeBalancer agora inclui recursos robustos de observabilidade para ajudar você a monitorar seu cluster MongoDB em produção.

## 1. Alertas via Webhook (Slack/Discord)
Você pode configurar o `ConnectionManager` para enviar alertas em tempo real para o Slack, Discord ou qualquer URL de webhook personalizada quando eventos críticos ocorrerem (como um failover).

### Como Configurar
Passe a opção `webhookUrl` ao inicializar o gerenciador:

```typescript
const manager = new ConnectionManager({
    nodes: ['mongodb://node1:27017', 'mongodb://node2:27017'],
    // Exemplo: URL do Webhook do Slack ou Discord
    webhookUrl: 'https://discord.com/api/webhooks/SEU_ID/SEU_TOKEN'
});
```

### Eventos Disparados
-   `promote`: Disparado quando um novo nó Primary é encontrado e promovido. (Informativo)
-   `no-writable`: Disparado quando **NENHUM** nó de escrita está disponível. (Crítico)
-   `serverHeartbeatFailed`: Disparado quando o heartbeat de um nó falha. (Aviso)

### Formato do Payload
O payload enviado é um POST JSON simples, compatível com a maioria dos chats:
```json
{
  "text": "⚠️ **NodeBalancer Alert**\n**Event**: promote\n**Details**: ```{ \"node\": \"mongodb://node2:27017\" }```"
}
```

---

## 2. Métricas Prometheus (Grafana)
A biblioteca expõe um endpoint `/metrics` compatível com o Prometheus. Isso permite que você crie dashboards visuais no Grafana.

### Como Visualizar
1.  **Configure o Prometheus** para ler (scrape) a URL da sua API: `http://seu-servidor:3000/metrics`.
2.  **No Grafana**, adicione o Prometheus como fonte de dados.
3.  **Crie um Dashboard** usando as métricas abaixo.

### Métricas Disponíveis
| Nome da Métrica | Tipo | Descrição | Exemplo de Uso no Grafana |
|---|---|---|---|
| `node_balancer_connection_status` | Gauge | 1 = Conectado, 0 = Desconectado | Painel "Status do Banco": Verde (1) ou Vermelho (0) |
| `node_balancer_failover_count` | Counter | Número total de failovers ocorridos | Gráfico de barras mostrando instabilidade ao longo do tempo |
| `node_balancer_operation_duration_seconds` | Histogram | Latência das operações (leitura/escrita) | Gráfico de linha "Tempo de Resposta Médio" |

### Acessando as Métricas Manualmente
Se você estiver rodando o servidor localmente, acesse:
`GET http://localhost:3000/metrics`

Você verá algo como:
```text
# HELP node_balancer_connection_status Status of the MongoDB connection
# TYPE node_balancer_connection_status gauge
node_balancer_connection_status 1
```

---

## 3. WebSocket em Tempo Real
Você pode conectar via WebSocket (Socket.io) para receber logs e atualizações de topologia instantaneamente. Isso é ideal para criar **dashboards de monitoramento ao vivo** (como o nosso CLI Dashboard).

### Como Conectar (Frontend/Client)
```javascript
import { io } from "socket.io-client";

// Conecta no mesmo host/porta da API
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Conectado ao stream do NodeBalancer");
});

// Recebe logs de operações (leitura, escrita, erros)
socket.on("log", (data) => {
  console.log("Log recebido:", data);
  // Ex: { op: 'read', durationMs: 12, success: true ... }
});

// Recebe avisos de mudança na estrutura do cluster
socket.on("topology-change", (data) => {
  console.log("Mudança na topologia:", data);
});
```

### Eventos
-   `log`: Stream de todas as operações de banco e eventos internos.
-   `topology-change`: Atualizações quando o driver do MongoDB detecta uma mudança (ex: nó caiu, novo primary eleito).
