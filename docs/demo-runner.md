# Demo Runner & Test Guide

Este guia detalha como executar os testes automatizados e verificar a resiliência do cluster MongoDB.

## 1. Pré-requisitos

Certifique-se de que o ambiente está rodando:

```powershell
docker-compose up -d
```

## 2. Script de Automação (`ops:demo`)

Criamos um script automatizado que realiza um teste de caos completo em ~30 segundos.

### O que ele faz?
1.  **Verifica a Topologia**: Mostra quem é Primary e Secondary.
2.  **Gera Tráfego**: Envia requisições POST (criação de usuário) e GET (listagem).
3.  **Simula Falha**: Identifica o nó Primary atual e o derruba (`docker stop`).
4.  **Verifica Failover**: Continua enviando requisições para provar que o cluster se recuperou.
5.  **Recuperação**: Reinicia o nó derrubado e verifica se ele volta ao cluster.

### Como rodar

```powershell
npm run ops:demo
```

*(Se tiver problemas com permissão de script no PowerShell, use: `cmd /c "npm run ops:demo"`)*

### Exemplo de Saída

```text
[DEMO]     🚀 Starting Succinct Failover Demo
[TEST]     Running Batch: 2 POST + 1 GET
[CLIENT]   POST 201 - 11ms
[CLIENT]   POST 201 - 11ms
[CLIENT]   GET 200 - 21ms
[CLUSTER]  mongo1: PRIMARY (Docs: 10) | mongo2: SECONDARY (Docs: 10) | mongo3: SECONDARY (Docs: 10)
[CHAOS]    💥 Stopping PRIMARY: mongo1
[TEST]     Running Batch: 2 POST + 1 GET
[CLIENT]   POST 201 - 15ms
...
[DEMO]     ✅ Demo Completed
```

## 3. Teste Manual (Passo a Passo)

Se preferir testar manualmente:

1.  **Suba o ambiente**: `docker-compose up -d`
2.  **Monitore os logs da API**: `docker logs -f node-api`
3.  **Em outro terminal, faça requisições**:
    ```powershell
    curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Test","email":"test@test.com","password":"123"}'
    ```
4.  **Derrube um nó**: `docker stop mongo1`
5.  **Verifique se a API continua respondendo**.
6.  **Restaure o nó**: `docker start mongo1`
