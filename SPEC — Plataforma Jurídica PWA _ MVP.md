# SPEC — Plataforma Jurídica PWA

**Versão:** 1.0  
**Status:** Aprovada para implementação  
**Timezone inicial:** `America/Sao_Paulo`  
**Modelo inicial:** escritório único, arquitetura multi-tenant preparada para SaaS  
**Plataforma:** Web responsiva + PWA instalável

---

# 1. Visão do produto

Construir uma plataforma jurídica para uso interno de escritórios de advocacia, focada inicialmente em três necessidades centrais:

**Agenda jurídica → Controle de prazos → Organização de clientes e processos**

O produto deverá funcionar inicialmente para um único escritório, porém sua arquitetura deverá nascer preparada para múltiplas organizações, permitindo evolução futura para um micro-SaaS sem reconstrução estrutural do banco ou das regras de autorização.

O sistema deverá priorizar:

- confiabilidade dos prazos;
- simplicidade operacional;
- segurança;
- rastreabilidade;
- isolamento de dados;
- baixo custo inicial;
- possibilidade de expansão futura.

A aplicação deverá ser utilizável principalmente em desktop, mas ser totalmente responsiva e instalável como PWA em computadores e dispositivos móveis.

---

# 2. Objetivos do MVP

O MVP deverá permitir executar integralmente o seguinte fluxo:

```text
Administrador
   ↓
Convida Advogado
   ↓
Advogado configura senha + MFA
   ↓
Cadastra Cliente
   ↓
Cadastra Processo
   ↓
Cadastra Prazo
   ↓
Prazo aparece no Dashboard
   ↓
Prazo aparece na Agenda
   ↓
Sistema gera notificações
   ↓
Data do prazo pode ser alterada com justificativa
   ↓
Auditoria registra a alteração
   ↓
Prazo é concluído
   ↓
Administrador consulta todo o histórico
```

O sistema também deverá comprovar que usuários sem permissão não conseguem contornar essas regras chamando diretamente banco, API ou Edge Functions.

---

# 3. Fora do escopo do MVP

Não implementar nesta primeira versão:

| Funcionalidade | Destino |
|---|---|
| Integração automática com tribunais | Fase futura |
| Captura automática de processos | Fase futura |
| Cálculo automático de prazo jurídico | Fase futura |
| Integração PJe/e-SAJ/Projudi | Fase futura |
| Portal do cliente | Fase futura |
| Upload de documentos | Fase 2 |
| Google Calendar | Fase futura |
| Outlook Calendar | Fase futura |
| WhatsApp | Fase futura |
| Alterações offline | Não permitido no MVP |
| Assinaturas/pagamentos SaaS | Fase comercial |
| Inteligência artificial jurídica | Fase futura |
| Aplicativos Android/iOS nativos | Não necessário inicialmente |
| Internacionalização de timezone | Fase futura |

O banco poderá conter estruturas preparatórias para algumas dessas funcionalidades, mas elas não deverão aumentar o escopo da interface do MVP.

---

# 4. Stack técnica

## 4.1 Frontend

```text
React
TypeScript
Vite
React Router
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
date-fns
vite-plugin-pwa
```

Para calendário:

```text
FullCalendar Community
```

ou biblioteca equivalente open-source que suporte:

- mês;
- semana;
- dia;
- lista;
- eventos;
- interação responsiva.

Não utilizar funcionalidades premium como dependência estrutural do MVP.

---

# 4.2 Backend e banco

```text
Supabase
PostgreSQL
Supabase Auth
Row Level Security
Supabase Edge Functions
PostgreSQL Functions / Triggers
Supabase Cron / pg_cron
```

Supabase Auth integra JWT com RLS, permitindo autorização no próprio banco. A documentação atual recomenda RLS para tabelas expostas e Edge Functions autenticadas podem operar preservando o contexto do usuário. citeturn261598search0turn261598search3turn261598search7

---

# 4.3 Hosting

Frontend:

```text
Cloudflare Pages
```

Cloudflare Pages poderá servir os arquivos estáticos da PWA. Atualmente, requisições de assets estáticos não contam como execução de Functions, e o plano gratuito possui limites próprios para builds e Workers. citeturn261598search2turn261598search10

---

# 4.4 E-mail

```text
Resend
```

Uso inicial:

- convites;
- recuperação de acesso quando aplicável;
- avisos de prazos;
- alertas críticos.

O plano gratuito atual do Resend prevê 3.000 e-mails mensais e limite diário de 100, suficiente para desenvolvimento e um escritório pequeno, desde que o volume seja monitorado. citeturn261598search9

---

# 5. Considerações sobre infraestrutura gratuita

Durante desenvolvimento, demonstração e validação do MVP, utilizar preferencialmente planos gratuitos.

O Supabase Free atualmente possui, entre outras limitações:

- 500 MB de banco;
- 1 GB de Storage;
- dois projetos ativos;
- projeto sujeito a pausa por inatividade;
- ausência de backup automático no plano gratuito.

Portanto, a camada gratuita deve ser tratada como adequada para desenvolvimento e validação inicial, não como garantia definitiva para um escritório comercial operando dados reais. citeturn261598search1

Antes de uso real por clientes pagantes ou armazenamento de informação jurídica crítica, deverá ser feita uma revisão formal de:

```text
backup
disponibilidade
recuperação de desastre
retenção
SLA
limites
custos
segurança
```

---

# 6. Arquitetura lógica

```text
Cloudflare Pages
        │
        ▼
React PWA
        │
        ├──── Supabase Auth
        │
        ├──── PostgreSQL Data API + RLS
        │
        └──── Edge Functions
                    │
                    ├── Resend
                    ├── operações administrativas
                    ├── convites
                    └── ações privilegiadas

PostgreSQL
   │
   ├── organizações
   ├── usuários
   ├── clientes
   ├── processos
   ├── prazos
   ├── agenda
   ├── notificações
   └── auditoria
```

---

# 7. Modelo multi-tenant

Apesar de existir apenas um escritório no lançamento, todas as entidades de negócio deverão pertencer a uma organização.

Estrutura conceitual:

```text
organization
   ├── users
   ├── clients
   ├── cases
   ├── deadlines
   ├── events
   ├── notifications
   └── audit_logs
```

Toda tabela de negócio relevante deverá possuir:

```sql
organization_id uuid not null
```

Nunca confiar em um `organization_id` enviado pelo frontend para autorizar uma operação.

A organização do usuário deverá ser determinada pelo usuário autenticado e validada no banco.

---

# 8. Perfis de acesso

Existem três perfis.

| Perfil | Descrição |
|---|---|
| `admin` | Administrador do escritório |
| `lawyer` | Advogado |
| `assistant` | Assistente/secretária |

---

# 9. Matriz de permissões

| Operação | Admin | Advogado | Assistente |
|---|:---:|:---:|:---:|
| Visualizar clientes | ✓ | ✓ | ✓ |
| Criar cliente | ✓ | ✓ | ✓ |
| Editar cliente | ✓ | ✓ | ✓ |
| Arquivar cliente | ✓ | ✓ | — |
| Criar processo | ✓ | ✓ | ✓ |
| Editar processo | ✓ | ✓ | ✓ |
| Arquivar processo | ✓ | ✓ | — |
| Criar evento | ✓ | ✓ | ✓ |
| Alterar evento | ✓ | ✓ | ✓ |
| Cancelar evento | ✓ | ✓ | conforme regra |
| Criar prazo | ✓ | ✓ | ✓ |
| Alterar descrição do prazo | ✓ | ✓ | ✓ |
| Alterar data fatal após criação | ✓ | ✓ | ✗ |
| Concluir prazo | ✓ | ✓ | ✗ |
| Reabrir prazo | ✓ | ✓ | ✗ |
| Cancelar prazo | ✓ | ✓ | ✗ |
| Administrar usuários | ✓ | ✗ | ✗ |
| Consultar auditoria completa | ✓ | ✗ | ✗ |
| Configurações críticas | ✓ | ✗ | ✗ |

No MVP não haverá fluxo de “aprovação” de alteração feita pelo assistente.

Caso seja necessária uma ação crítica, um Advogado ou Administrador deverá executá-la diretamente.

---

# 10. Autenticação

Não existirão contas criadas publicamente.

O endpoint `/register` não deverá permitir criação aberta de usuários.

Fluxo:

```text
Admin
 ↓
Convida usuário
 ↓
Usuário recebe e-mail
 ↓
Define senha
 ↓
Configura MFA
 ↓
Acesso liberado
```

---

# 11. Primeiro Administrador

Bootstrap inicial:

```text
migration
 ↓
criação da organização
 ↓
script administrativo
 ↓
criação do primeiro administrador
 ↓
convite
 ↓
definição de senha
 ↓
MFA
```

Após o bootstrap, novos usuários deverão ser convidados através da interface administrativa.

---

# 12. MFA

MFA deverá ser obrigatório para todos os usuários.

Preferência:

```text
TOTP
```

compatível com:

- Google Authenticator;
- Microsoft Authenticator;
- Authy;
- 1Password;
- outros aplicativos TOTP.

Supabase possui suporte nativo a MFA e fornece o nível de autenticação no JWT, permitindo exigir um nível superior para operações protegidas. citeturn261598search11

Operações críticas deverão exigir sessão com MFA validado.

---

# 13. Sessões

Usuário deverá poder:

```text
visualizar sessões
encerrar sessão atual
encerrar outras sessões
encerrar todas as sessões
```

Administrador deverá possuir recurso para revogar o acesso de um usuário.

Supabase identifica sessões individualmente através do `session_id` presente no JWT e mantém sessões em `auth.sessions`. citeturn561371search0

Observação importante: limites nativos de duração e timeout por inatividade são recursos pagos do Supabase. No plano gratuito, implementar inicialmente:

```text
bloqueio visual da aplicação após inatividade
solicitação de reautenticação
MFA para ações sensíveis
logout/revogação explícita
```

Antes de uso comercial, avaliar sessão com timeout real no provedor ou implementação adicional de controle server-side. citeturn561371search0

---

# 14. Página de Login

Rota:

```text
/login
```

Campos:

```text
E-mail
Senha
Entrar
Esqueci minha senha
```

Após senha válida:

```text
se MFA não configurado
    → setup de MFA

se MFA configurado
    → challenge TOTP
```

Nenhuma área privada deverá renderizar dados antes da validação completa da sessão.

---

# 15. Dashboard

Rota:

```text
/dashboard
```

Página inicial após autenticação.

Exibir:

| Bloco | Conteúdo |
|---|---|
| Hoje | compromissos e prazos |
| Próximos prazos | próximos 7 dias |
| Audiências | próximas |
| Vencidos | prazos vencidos |
| Processos ativos | contador |
| Pendentes | contador |
| Concluídos | contador |

Filtro principal:

```text
Minha agenda
Escritório inteiro
```

Para usuário comum, carregar por padrão:

```text
Meus compromissos
Meus prazos
```

---

# 16. Clientes

Rota:

```text
/clients
/clients/:id
```

Campos:

```text
id
organization_id
person_type
name
cpf_cnpj
email
phone
address
responsible_user_id
notes
status
created_at
updated_at
archived_at
```

`person_type`:

```text
individual
company
```

Status:

```text
active
archived
```

Não armazenar CPF/CNPJ no cache offline.

---

# 17. Processos

Rota:

```text
/cases
/cases/:id
```

Campos:

```text
id
organization_id
client_id
responsible_user_id
case_number
case_number_normalized
tribunal
court_unit
legal_area_id
client_side
opposing_party
status
notes
created_at
updated_at
archived_at
```

Status:

```text
active
suspended
closed
archived
```

---

# 18. Número do processo

Quando o valor corresponder ao padrão CNJ:

- validar estrutura;
- normalizar;
- formatar para exibição;
- armazenar versão normalizada para busca.

Entretanto, aceitar também:

```text
processos administrativos
procedimentos internos
identificadores não CNJ
```

O formato CNJ não deverá ser obrigatório.

---

# 19. Áreas jurídicas

Tabela:

```text
legal_areas
```

Valores iniciais:

```text
Trabalhista
Cível
Previdenciário
Família
Consumidor
Empresarial
Tributário
Criminal
Outros
```

Administrador poderá criar novas categorias.

---

# 20. Agenda

Rotas:

```text
/calendar
/events/:id
```

Tipos iniciais:

```text
hearing
meeting
call
task
appointment
other
```

Cada evento poderá estar relacionado opcionalmente a:

```text
cliente
processo
```

E possuir:

```text
responsável principal
participantes
```

---

# 21. Modelo de evento

```text
events

id
organization_id
title
description
event_type
owner_user_id
client_id nullable
case_id nullable
starts_at
ends_at
all_day
recurrence_type
recurrence_until
status
created_by
created_at
updated_at
cancelled_at
```

Tabela auxiliar:

```text
event_participants

event_id
user_id
```

---

# 22. Recorrência

Recorrência suportada no MVP:

```text
none
daily
weekly
monthly
```

Não implementar regras avançadas como:

```text
segunda e quarta de cada terceira semana
último dia útil do mês
exceções complexas
```

A camada de domínio deverá permitir evolução futura para RRULE.

---

# 23. Visualizações da agenda

Disponibilizar:

```text
Mês
Semana
Dia
Lista
```

A visão em lista deve ser priorizada em telas pequenas.

---

# 24. Prazos

Rotas:

```text
/deadlines
/deadlines/:id
```

Campos:

```text
id
organization_id
case_id
title
description
start_date
due_date
due_time nullable
owner_user_id
priority
status
completion_note
completed_at
completed_by
cancelled_at
cancelled_by
created_by
created_at
updated_at
```

Tabela:

```text
deadline_participants

deadline_id
user_id
```

---

# 25. Prioridade

Enum:

```text
low
normal
high
urgent
```

A prioridade é uma informação operacional.

Ela não altera o cálculo de vencimento.

---

# 26. Status de prazo

```text
pending
in_progress
completed
cancelled
overdue
```

Transições principais:

```text
pending → in_progress
pending → completed
in_progress → completed

pending → cancelled
in_progress → cancelled

pending → overdue
in_progress → overdue

overdue → completed
overdue → cancelled

completed → reopened → pending/in_progress
```

---

# 27. Prazo vencido

Quando:

```text
due_at < current_time
AND status NOT IN ('completed', 'cancelled')
```

o prazo deverá tornar-se:

```text
overdue
```

Interface:

```text
Vencido há 1 dia
Vencido há 4 dias
```

Nunca remover automaticamente prazos vencidos.

---

# 28. Processamento periódico

Utilizar `pg_cron` / Supabase Cron para:

```text
detectar prazos vencidos
criar notificações
disparar lembretes
reprocessar falhas de e-mail
```

Supabase suporta tarefas agendadas através de `pg_cron` e pode invocar Edge Functions periodicamente. citeturn736368search0turn736368search1

---

# 29. Alteração da data do prazo

Alteração de:

```text
due_date
due_time
```

exige justificativa obrigatória.

Exemplo:

```text
Data anterior:
18/09/2026

Nova data:
21/09/2026

Motivo:
Prazo redesignado conforme nova intimação.
```

Registrar obrigatoriamente:

```text
actor
timestamp
valor anterior
novo valor
justificativa
```

---

# 30. Conclusão de prazo

Ao selecionar:

```text
Concluir prazo
```

permitir:

```text
Observação de conclusão — opcional
```

Registrar automaticamente:

```text
completed_at
completed_by
```

---

# 31. Reabertura

Somente:

```text
admin
lawyer
```

podem reabrir.

Justificativa obrigatória.

Registrar:

```text
quem
quando
motivo
estado anterior
novo estado
```

---

# 32. Alertas

Alertas padrão:

| Momento | Responsável |
|---|---|
| 7 dias antes | configurável |
| 3 dias antes | configurável |
| 1 dia antes | obrigatório |
| dia do prazo | obrigatório |
| vencido | obrigatório |

Para prazo vencido:

```text
1 aviso/dia
máximo inicial: 7 dias
```

---

# 33. Canais de notificação

MVP:

```text
notificação interna
e-mail
```

Futuro:

```text
Web Push
WhatsApp
SMS
```

---

# 34. Modelo de notificações

```text
notifications

id
organization_id
user_id
deadline_id nullable
event_id nullable
type
channel
scheduled_for
sent_at
read_at
status
attempt_count
dedupe_key
created_at
```

`dedupe_key` deverá impedir envio duplicado.

Exemplo:

```text
deadline:{id}:user:{id}:1day
```

---

# 35. Pesquisa global

Componente presente no header.

Pesquisar:

```text
cliente
número de processo
parte contrária
```

Exemplo:

```text
"Maria"
"0001234-22.2026..."
"Empresa XPTO"
```

A busca deve ser feita pelo banco respeitando RLS.

Não carregar previamente toda a base para pesquisar no navegador.

---

# 36. Offline

A PWA deverá oferecer apenas leitura limitada.

Cache permitido:

```text
agenda de hoje até +30 dias
prazos vencidos
prazos até +30 dias
primeiro nome do cliente
```

Não guardar offline:

```text
CPF/CNPJ
e-mail
telefone
endereço
observações
descrição completa do processo
auditoria
pesquisa global
documentos
dados de outros períodos
```

---

# 37. Regras offline

Quando offline:

```text
CREATE = bloqueado
UPDATE = bloqueado
DELETE/CANCEL = bloqueado
COMPLETE = bloqueado
```

Exibir claramente:

```text
Modo offline — somente leitura.
Conecte-se à internet para realizar alterações.
```

Ao recuperar conexão:

```text
invalidar cache
sincronizar novamente
liberar alterações
```

---

# 38. Limpeza do cache

Apagar dados jurídicos offline quando:

```text
logout
sessão revogada
troca de usuário
expiração local
ação administrativa de segurança
```

Nenhum cache jurídico deverá sobreviver à troca de conta.

---

# 39. Auditoria

Tabela:

```text
audit_logs

id
organization_id
actor_user_id
action
entity_type
entity_id
before_data jsonb
after_data jsonb
reason
request_id
created_at
```

Exemplos de `action`:

```text
client.created
client.updated
client.archived

case.created
case.updated
case.archived

deadline.created
deadline.updated
deadline.due_date_changed
deadline.completed
deadline.reopened
deadline.cancelled

event.created
event.updated
event.cancelled

user.invited
user.role_changed
user.deactivated
```

---

# 40. Auditoria append-only

Usuários normais não poderão executar:

```sql
UPDATE audit_logs
DELETE FROM audit_logs
```

Nem mesmo Admin terá esses comandos pela aplicação.

Logs serão inseridos por:

```text
triggers
stored procedures
Edge Functions
```

conforme o tipo de ação.

---

# 41. Visualização da auditoria

Admin:

```text
/admin/audit
```

Filtros:

```text
usuário
período
ação
cliente
processo
tipo de entidade
```

Advogados e Assistentes poderão visualizar histórico contextual de registros quando permitido, mas não possuirão busca global da auditoria.

---

# 42. Exclusões

Não fornecer botão de exclusão física no MVP.

Clientes:

```text
archive
```

Processos:

```text
archive
```

Eventos:

```text
cancel
```

Prazos:

```text
cancel
```

Hard delete somente através de procedimento administrativo excepcional fora da interface.

---

# 43. RLS

Ativar RLS em todas as tabelas expostas.

A documentação do Supabase destaca que tabelas em schemas expostos precisam de RLS e grants adequados para evitar leitura ou escrita indevida. citeturn261598search7turn261598search12

Criar funções auxiliares em schema privado:

```sql
current_user_org_id()
current_user_role()
current_user_has_mfa()
```

Exemplo conceitual:

```sql
organization_id = current_user_org_id()
```

Todas as policies devem verificar organização.

---

# 44. Regra fundamental de autorização

Nunca utilizar apenas:

```javascript
if (user.role === "admin")
```

no frontend como proteção.

A autorização deve existir em:

```text
RLS
database functions
Edge Functions
```

O frontend apenas reflete a permissão.

---

# 45. Operações privilegiadas

Utilizar Edge Functions para ações como:

```text
convidar usuário
alterar função do usuário
desativar usuário
revogar sessões
operações administrativas Auth
envio de notificações
operações com service-role
```

Secrets administrativos nunca devem ser enviados ao browser.

Edge Functions autenticadas deverão validar o usuário antes de qualquer operação privilegiada. citeturn261598search0turn261598search6

---

# 46. Service Role

A chave equivalente a `service_role` deverá existir exclusivamente em ambiente server-side seguro.

Proibido:

```text
VITE_*
bundle JS
localStorage
IndexedDB
frontend env público
HTML
logs client-side
```

O pentest deverá procurar explicitamente por exposição dessa credencial.

---

# 47. Timezone

Toda experiência do MVP utilizará:

```text
America/Sao_Paulo
```

Não espalhar strings de timezone arbitrariamente pelo código.

Criar uma configuração única:

```text
APP_TIMEZONE=America/Sao_Paulo
```

Persistir timestamps técnicos preferencialmente em UTC/Postgres `timestamptz`, convertendo para horário de São Paulo na camada de domínio/interface.

Internacionalização fica para fase futura.

---

# 48. Design

Estética:

```text
profissional
sóbria
limpa
moderna
jurídica sem excesso de elementos
```

Layout desktop:

```text
┌──────────────────────────┐
│ Header + Busca Global    │
├────────┬─────────────────┤
│        │                 │
│ Menu   │ Conteúdo        │
│        │                 │
└────────┴─────────────────┘
```

Menu inicial:

```text
Dashboard
Agenda
Prazos
Clientes
Processos

Administração
 ├── Usuários
 ├── Auditoria
 └── Configurações
```

---

# 49. Tema

Suportar:

```text
Light
Dark
System
```

Sem vincular identidade visual a um nome definitivo.

Configurações:

```text
app_name
logo
primary_brand_settings
```

podem existir em organização/configuração.

---

# 50. Responsividade

Prioridade:

```text
Desktop
Tablet
Mobile
```

Mobile deverá permitir uso completo online, inclusive criação e gerenciamento.

Offline continua limitado às regras definidas anteriormente.

---

# 51. Rotas

```text
/login
/auth/mfa
/auth/recovery

/dashboard

/calendar
/events/:id

/deadlines
/deadlines/:id

/clients
/clients/new
/clients/:id

/cases
/cases/new
/cases/:id

/profile
/profile/security
/profile/sessions

/admin/users
/admin/audit
/admin/settings
```

---

# 52. Banco de dados — entidades

Modelo mínimo:

```text
organizations
profiles
legal_areas
clients
cases

events
event_participants

deadlines
deadline_participants

notifications
notification_preferences

audit_logs
```

Fase futura:

```text
attachments
documents
court_integrations
external_calendar_connections
billing_accounts
subscriptions
```

---

# 53. Índices recomendados

Criar índices ao menos para:

```text
profiles.organization_id

clients.organization_id
clients.name

cases.organization_id
cases.client_id
cases.case_number_normalized
cases.opposing_party

deadlines.organization_id
deadlines.owner_user_id
deadlines.due_date
deadlines.status

events.organization_id
events.owner_user_id
events.starts_at

notifications.user_id
notifications.scheduled_for
notifications.status

audit_logs.organization_id
audit_logs.created_at
audit_logs.actor_user_id
audit_logs.entity_type
audit_logs.entity_id
```

Sempre avaliar índices compostos conforme queries reais.

---

# 54. Validação

Frontend:

```text
Zod
```

Banco:

```text
NOT NULL
CHECK constraints
FK
ENUM/check constraints
unique indexes
RLS
```

Não confiar apenas no formulário React.

---

# 55. Tratamento de erros

Nunca retornar ao usuário mensagens contendo:

```text
SQL bruto
stack trace
service keys
estrutura interna
nomes sensíveis de tabelas
tokens
dados de outra organização
```

Frontend recebe mensagens apropriadas:

```text
Você não possui permissão para realizar esta ação.
Não foi possível concluir a operação.
```

Logs técnicos permanecem server-side.

---

# 56. LGPD

Aplicar desde o MVP:

```text
minimização de dados
limitação por finalidade
controle de acesso
segregação de organizações
auditoria
proteção de credenciais
TLS
redução de cache local
dados sintéticos em desenvolvimento
```

Dados reais nunca deverão ser copiados de produção para staging para teste.

---

# 57. Desenvolvimento e ambientes

Estrutura:

```text
LOCAL
 ↓
STAGING
 ↓
PRODUCTION
```

LOCAL:

```text
Supabase local
dados sintéticos
```

STAGING:

```text
dados sintéticos
teste de integração
E2E
pentest
```

PRODUCTION:

```text
somente releases aprovadas
dados reais
sem pentest destrutivo
```

---

# 58. CI/CD

Fluxo mínimo:

```text
Pull Request
 ↓
Lint
 ↓
Typecheck
 ↓
Unit tests
 ↓
Integration tests
 ↓
Build
 ↓
Security static checks
 ↓
Merge
 ↓
Deploy staging
 ↓
E2E
 ↓
Authorized security test
 ↓
Release approval
 ↓
Production
```

---

# 59. Testes automatizados

Frameworks sugeridos:

```text
Vitest
React Testing Library
Playwright
```

Categorias:

```text
unitários
integração
RLS
E2E
segurança
```

---

# 60. Testes obrigatórios de RLS

Manter pelo menos:

```text
Organization Alpha
Organization Beta
```

Alpha:

```text
Admin Alpha
Lawyer Alpha
Assistant Alpha
```

Beta:

```text
Admin Beta
Lawyer Beta
```

Executar automaticamente cenários onde Alpha tenta consultar ou modificar IDs pertencentes a Beta.

Todos devem falhar.

---

# 61. Security Validation & Authorized Adversarial Testing

Antes de cada release relevante, executar teste ofensivo **somente contra staging autorizado**.

Ferramenta prevista:

```text
@Codex Security
```

Objetivo:

> agir como um atacante externo ou usuário malicioso e tentar encontrar caminhos que os testes convencionais não detectaram.

---

# 62. Escopo autorizado do pentest

Permitido:

```text
staging frontend
staging APIs
staging Edge Functions
staging Supabase
contas fictícias
dados fictícios
```

O teste pode:

```text
criar dados
alterar dados
apagar dados fictícios
alterar sessões
testar usuários
forçar erros
tentar escalada de privilégios
```

desde que tudo esteja limitado ao ambiente staging autorizado.

---

# 63. Fora do escopo ofensivo

Proibido testar destrutivamente:

```text
produção
contas reais
clientes reais
serviços externos não autorizados
infraestrutura de terceiros fora do projeto
```

Resend, Cloudflare, Supabase ou qualquer outro provedor não deverão ser atacados como plataformas externas.

Os testes devem se restringir às superfícies do próprio aplicativo e recursos provisionados para staging.

---

# 64. Cenários obrigatórios do Codex Security

## Autenticação

Tentar:

```text
acessar área privada sem login
usar token inválido
usar token expirado
reutilizar sessão revogada
burlar MFA
abusar de recuperação de senha
enumerar usuários
realizar tentativas repetidas de login
```

---

# 65. Autorização

Tentar:

```text
Assistant → Lawyer
Assistant → Admin
Lawyer → Admin
```

Testar operações administrativas diretamente via API, sem depender dos botões da interface.

Resultado esperado:

```text
403 / operação recusada
```

---

# 66. IDOR

Tentar trocar IDs manualmente.

Exemplo conceitual:

```text
/clients/{client_from_beta}
/cases/{case_from_beta}
/deadlines/{deadline_from_beta}
```

usando sessão Alpha.

Nenhum dado de Beta pode ser retornado.

---

# 67. Multi-tenancy

Tentar:

```text
alterar organization_id no body
alterar organization_id na query
usar UUID conhecido de outra organização
reutilizar client_id de outra organização
reutilizar case_id de outra organização
inferir registros pela busca
acessar auditoria externa
```

Resultado esperado:

```text
zero vazamento
zero modificação
```

---

# 68. JWT

Testar:

```text
claims alteradas
role alterada
organization alterada
token malformado
token sem MFA suficiente
token assinado incorretamente
```

Nenhuma claim fornecida arbitrariamente pelo cliente deverá aumentar privilégios.

---

# 69. RLS

Para cada tabela exposta, tentar:

```text
SELECT indevido
INSERT indevido
UPDATE indevido
DELETE indevido
```

com:

```text
anon
assistant
lawyer
usuário de outra organização
```

Cada política deverá ter teste positivo e negativo.

---

# 70. SQL Injection

Testar parâmetros de:

```text
busca
filtros
processo
clientes
auditoria
Edge Functions
```

Nenhum valor de usuário deverá gerar SQL concatenado inseguro.

---

# 71. XSS

Testar campos como:

```text
nome do cliente
parte contrária
observações
descrição do prazo
título de evento
```

Strings maliciosas devem ser exibidas como conteúdo, nunca executadas como código.

---

# 72. CSRF

Validar que operações sensíveis não possam ser disparadas por origem externa utilizando credenciais da vítima.

Testar especialmente:

```text
alterar prazo
concluir prazo
convidar usuário
alterar função
revogar usuário
```

---

# 73. Secrets

Verificar:

```text
JS bundles
source maps
HTML
Network responses
localStorage
IndexedDB
Service Worker
manifest
Git history
CI logs
console
.env versionados
```

Procurar:

```text
service role
Resend API key
tokens administrativos
database URLs privilegiadas
credentials
```

---

# 74. PWA e cache

O pentest deverá confirmar que:

```text
CPF não aparece offline
telefone não aparece offline
e-mail não aparece offline
observações não aparecem offline
processo completo não aparece offline
auditoria não aparece offline
```

Após logout:

```text
cache jurídico = removido
```

---

# 75. Pesquisa global

Tentar descobrir outra organização usando:

```text
prefixos
nomes parciais
número de processo
parte contrária
timing
contagem de resultados
autocomplete
```

Não deverá haver inferência sobre existência de dados externos ao tenant.

---

# 76. Rate limiting e abuso

Testar:

```text
login
password recovery
convites
busca
envio de e-mail
Edge Functions
```

Identificar possibilidade de:

```text
spam
DoS lógico
enumeração
custo excessivo
abuso do Resend
```

---

# 77. Auditoria

Tentar:

```text
editar log
deletar log
criar log em nome de outro usuário
alterar timestamp
alterar actor_user_id
consultar logs de outra organização
```

Tudo deverá ser bloqueado.

---

# 78. Manipulação de prazos

Testar:

```text
Assistant muda due_date
Assistant conclui prazo
Assistant reabre prazo
Assistant cancela prazo
usuário envia status arbitrário
usuário remove justificativa
usuário altera completed_by
usuário altera created_by
```

O banco/backend deverá recusar ações inválidas mesmo quando a requisição for construída manualmente.

---

# 79. Critério de severidade

Adotar:

```text
Critical
High
Medium
Low
Informational
```

---

# 80. Gate de release

Regra:

```text
Critical → bloqueia release
High     → bloqueia release
Medium   → precisa de decisão registrada
Low      → backlog
Info     → backlog/documentação
```

Critical/High:

```text
corrigir
 ↓
retestar
 ↓
comprovar correção
 ↓
somente então release
```

---

# 81. Relatório do Codex Security

Cada finding deverá incluir:

```text
ID
Título
Severidade
Superfície afetada
Pré-condição
Passos reproduzíveis
Impacto
Evidência
Recomendação
Status
Commit da correção
Resultado do reteste
```

Não armazenar secrets reais no relatório.

---

# 82. Critérios de aceite funcionais

## Autenticação

Dado um usuário convidado:

```text
define senha
configura MFA
faz login
acessa dashboard
```

Usuário sem MFA não consegue finalizar autenticação.

---

# 83. Cliente

Usuário autorizado consegue:

```text
criar
visualizar
editar
arquivar
```

conforme função.

Usuário Beta nunca visualiza Cliente Alpha.

---

# 84. Processo

Usuário consegue:

```text
criar processo
vincular cliente
definir advogado
informar número
informar parte contrária
selecionar área
alterar status
```

Processo arquivado permanece no histórico.

---

# 85. Prazo

Usuário consegue:

```text
criar prazo
vincular processo
definir responsável
definir participantes
definir prioridade
definir data limite
```

Prazo aparece:

```text
dashboard
lista
calendário
```

---

# 86. Mudança de prazo

Ao alterar data:

```text
justificativa obrigatória
```

Sem justificativa:

```text
operação rejeitada
```

Com justificativa:

```text
operação realizada
audit_log criado
```

---

# 87. Vencimento

Ao passar da data:

```text
status = overdue
```

Prazo permanece visível e destacado.

---

# 88. Conclusão

Lawyer/Admin:

```text
conclui prazo
```

Sistema registra:

```text
completed_at
completed_by
```

---

# 89. Assistente

Assistant tenta:

```text
alterar due_date
concluir
reabrir
cancelar
```

Resultado:

```text
backend recusa
```

Não basta desabilitar botões.

---

# 90. Offline

Com conexão:

```text
sincronizar dados permitidos
```

Sem conexão:

```text
visualizar agenda
visualizar prazos
visualizar primeiro nome
```

Tentar alterar:

```text
bloqueado
```

---

# 91. Auditoria

Admin consegue responder perguntas como:

```text
Quem alterou esse prazo?
Quando?
Qual era a data anterior?
Qual passou a ser?
Por quê?
```

---

# 92. Critério de isolamento

Antes de release:

```text
Alpha tenta ler Beta → FAIL
Alpha tenta editar Beta → FAIL
Alpha tenta excluir Beta → FAIL
Alpha tenta buscar Beta → FAIL
Alpha tenta inferir Beta → FAIL
```

Qualquer sucesso nesses cenários é vulnerabilidade de alta ou crítica severidade conforme impacto.

---

# 93. Backup

No MVP:

```text
migrations versionadas
schema versionado
seed sintético
procedimento documentado de export
procedimento documentado de restore
```

Interface de backup ficará para fase 2.

Antes de utilizar dados jurídicos reais, revisar estratégia de backups, porque o Supabase Free não inclui backup automático. citeturn261598search1

---

# 94. Repositório

Estrutura sugerida:

```text
/
├── src/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── clients/
│   │   ├── cases/
│   │   ├── deadlines/
│   │   ├── calendar/
│   │   ├── notifications/
│   │   └── admin/
│   ├── hooks/
│   ├── lib/
│   ├── routes/
│   ├── schemas/
│   └── types/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── seed.sql
│   └── config.toml
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── rls/
│   └── security/
│
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── backup-restore.md
│   └── deployment.md
│
└── README.md
```

---

# 95. Ordem de implementação

## Fase 0 — Fundação

```text
repo
lint
TypeScript
Tailwind
shadcn
Supabase local
CI
environments
```

## Fase 1 — Segurança e identidade

```text
organizations
profiles
roles
Auth
MFA
RLS base
convites
bootstrap admin
```

Não começar módulos jurídicos antes da autorização multi-tenant estar testada.

## Fase 2 — Clientes e processos

```text
clientes
áreas
processos
busca
soft delete/archive
```

## Fase 3 — Agenda

```text
eventos
participantes
recorrência
calendário
```

## Fase 4 — Prazos

```text
CRUD
status
prioridade
justificativas
conclusão
reabertura
overdue
```

## Fase 5 — Auditoria

```text
triggers
logs
admin audit UI
imutabilidade
```

## Fase 6 — Notificações

```text
in-app
cron
Resend
preferências
retries
```

## Fase 7 — PWA

```text
install
cache seguro
offline read-only
limpeza de cache
```

## Fase 8 — Hardening

```text
RLS tests
E2E
rate limiting
secret scanning
dependency audit
headers
CSP
security checks
```

## Fase 9 — Adversarial Security

```text
deploy staging
seed Alpha/Beta
@Codex Security
corrigir Critical/High
retestar
```

## Fase 10 — Release

```text
backup testado
restore testado
checklist
deploy
monitoramento
```

---

# 96. Definition of Done

O MVP só poderá ser chamado de concluído quando:

```text
✓ Admin cria/convida usuários
✓ MFA obrigatório funciona
✓ isolamento multi-tenant está testado
✓ clientes funcionam
✓ processos funcionam
✓ agenda funciona
✓ recorrência básica funciona
✓ prazos funcionam
✓ vencimentos são detectados
✓ alertas funcionam
✓ auditoria funciona
✓ pesquisa funciona
✓ PWA instala
✓ offline read-only funciona
✓ logout limpa cache
✓ RLS possui testes automatizados
✓ E2E passa
✓ build passa
✓ staging possui dados sintéticos
✓ pentest autorizado foi executado
✓ nenhum Critical está aberto
✓ nenhum High está aberto
✓ backup/restore está documentado
```

---

# 97. Princípios obrigatórios

A implementação deverá seguir cinco princípios:

**1. Backend é a fonte de autoridade.**  
Frontend nunca define permissões reais.

**2. Tenant isolation é requisito fundamental.**  
Todo acesso deve ser limitado pela organização autenticada.

**3. Prazo jurídico é dado crítico.**  
Alterações precisam ser rastreáveis.

**4. Dados jurídicos offline devem ser mínimos.**  
Offline serve como contingência de consulta, não como cópia do escritório.

**5. Segurança bloqueia release.**  
Uma funcionalidade não estará pronta se criar uma vulnerabilidade crítica ou alta.

---

# 98. Visão pós-MVP

A arquitetura deverá permitir evolução futura para:

```text
upload de documentos
integração Google Calendar
integração Outlook
Web Push
WhatsApp
captura automática de processos
integração com tribunais
cálculo de prazos
IA jurídica
agentes especializados
portal do cliente
planos e assinaturas
múltiplos escritórios
branding por escritório
billing
analytics
```

Esses recursos não deverão ser implementados antes de o núcleo:

```text
Clientes + Processos + Agenda + Prazos + Segurança
```

estar estável.

---

# 99. Resultado esperado do MVP

O resultado não deverá ser apenas uma agenda online.

O produto deve funcionar como um **núcleo operacional seguro para um escritório de advocacia**, no qual seja possível saber:

```text
O que preciso fazer hoje?
Quais prazos estão próximos?
Existe algum prazo vencido?
Quem é responsável?
Qual cliente está relacionado?
Qual processo está relacionado?
Quem alterou esta informação?
Quando ela foi alterada?
Por que a data mudou?
```

Ao mesmo tempo, a arquitetura deverá garantir que o produto possa crescer posteriormente de um sistema interno para uma plataforma SaaS multi-escritório sem substituir seus fundamentos.