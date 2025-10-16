# Node Balancer

## Sobre o Projeto: "Node Balancer"

O Node Balancer é uma API escalável construída utilizando Node.js, MongoDB com replica set para alta disponibilidade, e Nginx como balanceador de carga. O sistema foi projetado para garantir resiliência, escalabilidade e alta disponibilidade. A arquitetura permite a adição manual de instâncias backend (Node.js) e garante que, em caso de falhas, o sistema continue operando sem interrupções, com a replicação automática dos dados e balanceamento de carga eficiente.

## Arquitetura - Diagrama ilustrativo

![img.png](docs/diagramEscale.png)

## Tecnologias

O Node Balancer utiliza as seguintes tecnologias:

- Node.js (com Express.js): Para a criação de APIs RESTful escaláveis e modularizadas.

- MongoDB Replica Set: Para garantir alta disponibilidade e redundância de dados, com failover automático.

- Nginx: Como balanceador de carga para distribuir as requisições entre as instâncias do backend.

- Docker: Para containerização das instâncias Node.js, permitindo fácil replicação e deploy.

- Monitoramento: O sistema está em processo de monitoramento para garantir a continuidade e performance da aplicação.

---
