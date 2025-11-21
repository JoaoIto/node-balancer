# Documentação dos Scripts

Os scripts de automação estão localizados em `src/scripts/` e são executados via `ts-node`.

## `src/scripts/demo_failover.ts`

Este é o script principal de demonstração de resiliência.

### Funcionalidades
-   **Conexão Direta**: Conecta-se individualmente a cada nó do MongoDB (`localhost:27017`, `27018`, `27019`) para verificar o status real (Primary/Secondary) e a contagem de documentos.
-   **Detecção Dinâmica**: Não assume que `mongo1` é o Primary. Ele pergunta ao cluster quem é o Primary atual antes de derrubá-lo.
-   **Fluxo Determinístico**:
    1.  **Fase Saudável**: 2 POSTs + 1 GET.
    2.  **Caos**: Stop Primary.
    3.  **Fase Failover**: 2 POSTs + 1 GET.
    4.  **Recuperação**: Start Node.
    5.  **Fase Final**: 2 POSTs + 1 GET.

### Comandos npm

No `package.json`, mapeamos este script para:

```json
"scripts": {
  "ops:demo": "ts-node src/scripts/demo_failover.ts"
}
```

### Personalização
Você pode ajustar as constantes no topo do arquivo para mudar o comportamento:

```typescript
const API_URL = 'http://localhost:3000/api/users';
// Adicione mais nós aqui se escalar o cluster
const NODES = [ ... ];
```
