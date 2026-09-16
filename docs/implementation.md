# Análise da SPEC e acompanhamento

## Recorte inicial

A SPEC 1.0 aprova um MVP completo, mas sua seção 95 exige começar pela fundação e testar autorização multi-tenant antes dos módulos jurídicos. Esta entrega inicia as fases 0 e 1; não constitui um MVP operacional nem uma release de produção.

O repositório continha somente SPEC, README, licença e arquivos de ambiente Python. Nenhum código existente foi substituído e a SPEC foi preservada.

### Implementado

- React + TypeScript estrito + Vite, Router, Tailwind, base shadcn (Button), TanStack Query, React Hook Form e Zod.
- Login responsivo, recuperação e definição de senha, configuração TOTP, challenge MFA e área restrita que consulta o perfil real.
- Estado de ambiente não configurado explícito, sem usuários fictícios autenticados nem modo de demonstração que contorne MFA.
- Migration de organizations/profiles, roles, helpers privados, grants mínimos e RLS. Somente leitura para o cliente; nenhuma alteração de associação, função ou ativação pela Data API.
- MFA obrigatório para qualquer leitura de dados privados, perfil ativo e verificação de auth.sessions para recusar JWT de sessão revogada.
- Bootstrap do primeiro administrador via terminal confiável e convite por Supabase Auth. Nenhuma criação pública de conta.
- Testes unitários e de políticas em PostgreSQL embarcado (PGlite), mais suíte pgTAP para Supabase real na CI.
- Configuração local, seed de organizações sintéticas, CI, headers para Cloudflare Pages e documentação.

### Próxima entrega: concluir fase 1

1. Executar Supabase local/CI e validar GoTrue, links de convite, senha e TOTP de ponta a ponta.
2. Implementar Edge Functions autenticadas para convite, alteração de função, desativação e revogação, com validação server-side de admin + AAL2 + tenant, rate limiting e auditoria. Não criar endpoint privilegiado provisório.
3. Interface administrativa de usuários e gestão de sessões. Proteger último admin ativo e registrar operações administrativas.
4. Tests negativos diretos nas Edge Functions e APIs, incluindo assistente/advogado, tenant externo, sessão revogada e JWT inválido.
5. Só então abrir clientes e processos (fase 2).

### Decisões e pontos a fechar

- Uma associação por usuário no MVP: `profiles.id = auth.users.id`, com `organization_id` obrigatório. Múltiplos escritórios existem no banco; alternância de organizações pelo mesmo usuário não está no escopo inicial.
- Papel e organização vêm do perfil persistido, nunca de user_metadata ou campos enviados pela interface.
- Sessão fica apenas em memória nesta etapa. Atualizar a página exige entrar novamente. Persistência segura e experiência PWA serão tratadas na fase 7; nenhum dado jurídico é armazenado offline agora.
- Timeout de 15 minutos de inatividade foi escolhido como padrão inicial de bloqueio visual. Não equivale a garantia de timeout server-side. A checagem de sessão no banco atende revogação explícita.
- `overdue` na SPEC mistura estado persistido e condição temporal. Antes da fase 4, definir estado efetivo por `due_at`, mantendo estado operacional e cron consistentes. Sem horário informado, propor fim do dia em São Paulo e documentar a decisão antes da implementação.
- Cancelamento de evento por assistente está descrito como “conforme regra”. Definir regra antes da fase 3.
- Cache offline ainda precisa de projeção explícita: títulos livres também podem conter dados pessoais. Não basta remover CPF/CNPJ de um objeto completo.
- Chave dedupe de lembrete deve considerar a revisão da data fatal, evitando que lembretes antigos suprimam os novos após reagendamento.
- Tema claro nesta etapa; dark/system, agenda, auditoria, Resend, PWA e busca permanecem no backlog da SPEC.

## Limites de validação

PGlite executa PostgreSQL e as policies reais, mas simula as funções/tabelas de Auth. Não valida assinatura JWT, e-mail, GoTrue, PostgREST, navegador ou Edge Functions. A suíte Supabase deve passar separadamente; a ausência de Docker não transforma esse gate em aprovado.

Não foi realizado pentest nem deploy. Fases 8–10 e todos os gates da Definition of Done continuam necessários antes do uso real.

Validação executada em 16/09/2026: TypeScript, 19 testes (14 RLS em PGlite e 5 unitários), build de produção e auditoria npm de dependências de produção sem vulnerabilidades conhecidas. Docker não está instalado neste ambiente; pgTAP no Supabase e E2E de autenticação permanecem pendentes. A CI foi escrita, mas não foi executada em um provedor remoto nesta sessão.
