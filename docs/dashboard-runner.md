# Visual Dashboard Runner

O **NodeBalancer Control Center** é um painel interativo via terminal (TUI) que permite monitorar e controlar o cluster MongoDB em tempo real.

## 1. Funcionalidades

-   **Topologia em Tempo Real**: Visualiza o estado de cada nó (`PRIMARY`, `SECONDARY`, `DOWN`) e a contagem de documentos sincronizados.
-   **Gráfico de Latência**: Monitora o tempo de resposta da API (ms) em um gráfico de linha.
-   **Logs de Execução**: Exibe logs de ações e testes.
-   **Controles Interativos**: Permite iniciar/parar nós e rodar testes de caos diretamente do painel.

## 2. Como Rodar

```powershell
npm run dashboard
```

*(Ou `node-balancer-dashboard` se instalado via npm globalmente)*

## 3. Controles Disponíveis

Use as setas `↑` `↓` e `Enter` para selecionar:

-   **RUN CHAOS DEMO (Auto)**: Executa o teste completo de failover (Saudável -> Stop Primary -> Failover -> Recovery) automaticamente.
-   **SEND BATCH**: Envia 3 requisições (2 POST + 1 GET) para gerar tráfego.
-   **STOP PRIMARY**: Identifica e derruba o nó primário atual.
-   **START MONGO[1-3]**: Inicia um nó específico.
-   **START STACK**: Roda `docker-compose up -d` caso o ambiente esteja parado.

## 4. Exemplo Visual

O painel é dividido em 4 áreas:

1.  **Cluster Topology** (Topo Esquerda): Tabela com status dos nós.
2.  **API Response Time** (Topo Direita): Gráfico de latência.
3.  **Execution Logs** (Baixo Esquerda): Histórico de ações.
4.  **Actions** (Baixo Direita): Menu de comandos.

![Dashboard preview](https://raw.githubusercontent.com/JoaoIto/node-balancer/refs/heads/main/docs/images/dashboard-preview.png)

---
**Nota**: Para sair, pressione `q`, `Esc` ou `Ctrl+C`.
