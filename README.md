# LZ Advogados

Plataforma jurídica interna baseada na [SPEC](<SPEC — Plataforma Jurídica PWA _ MVP.md>).

**Estado: fundação implementada; fase 1 em andamento.** Inclui login/MFA, isolamento multi-tenant no PostgreSQL e testes. Clientes, processos, agenda e prazos serão construídos após a validação completa da identidade. Não é um MVP concluído.

## Executar

Node 22.12+ e npm:

```sh
npm ci
npm run dev
```

Sem `.env.local`, a tela de acesso mostra que o serviço ainda não foi configurado. Para autenticação real, siga [configuração local e bootstrap](docs/deployment.md), que requer Docker para o Supabase local.

## Validar

```sh
npm run check
```

Com Supabase local ativo:

```sh
npx supabase test db
```

O primeiro comando inclui testes SQL em PostgreSQL embarcado. O segundo valida as migrations com o schema Auth real do Supabase. Ambos são necessários; o primeiro não substitui integração ou E2E.

- [Análise da SPEC, decisões e próximos passos](docs/implementation.md)
- [Arquitetura](docs/architecture.md)
- [Segurança](docs/security.md)
- [Backup e restore](docs/backup-restore.md)

Nenhuma chave privilegiada deve usar prefixo `VITE_`. Não versionar `.env.local`, `.env.admin`, dados reais ou dumps.
