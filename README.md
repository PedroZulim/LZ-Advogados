# LZ Advogados

Plataforma jurídica interna baseada na [SPEC](<SPEC — Plataforma Jurídica PWA _ MVP.md>).

**Estado: identidade, administração de usuários, clientes e processos implementados; validação de homologação em andamento.** Inclui login/MFA, convites, gestão de perfis e sessões, cadastro e arquivamento de clientes/processos, áreas jurídicas, buscas e auditoria com isolamento multi-tenant. Agenda e prazos ainda não estão implementados. Não é um MVP concluído.

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
- [Administração de usuários: implantação e testes](docs/user-administration.md)
- [E-mails de acesso: domínio, SMTP e modelos](docs/email-smtp.md)
- [Clientes e processos: implantação e aceite](docs/clients-cases.md)
- [Segurança](docs/security.md)
- [Backup e restore](docs/backup-restore.md)

Nenhuma chave privilegiada deve usar prefixo `VITE_`. Não versionar `.env.local`, `.env.admin`, dados reais ou dumps.
