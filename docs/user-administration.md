# Administração de usuários e sessões

Esta entrega adiciona `/admin/users`, `/admin/audit` e `/account/sessions`. Administradores podem convidar integrantes, alterar perfis, desativar/reativar acessos e encerrar sessões do próprio escritório. Cada usuário pode consultar e encerrar suas próprias sessões. Convites exigem uma conta nova; contas já existentes não são transferidas entre escritórios.

## Implantar em homologação

Aplicar primeiro o backend, depois publicar o frontend. Os comandos abaixo alteram o projeto remoto vinculado; conferir o Project Reference antes de executar.

```powershell
npx supabase link --project-ref SEU_PROJECT_REF_DE_STAGING
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set APP_URL=https://lz-advogados.pages.dev
npx supabase functions deploy admin-users
```

`APP_URL` é o endereço canônico do frontend, sem caminho. Ele determina a origem CORS permitida e o retorno do convite; não é aceito um redirecionamento enviado pelo navegador. Em Authentication → URL Configuration, permitir exatamente `https://lz-advogados.pages.dev/auth/update-password`. Conferir SMTP e MFA TOTP antes de convidar integrantes. Sem SMTP próprio, o provedor padrão restringe os destinatários aos membros da equipe do projeto Supabase.

A função usa os secrets nativos `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Não colocar secrets administrativos nas variáveis do Cloudflare. O frontend continua usando somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do mesmo projeto.

O `verify_jwt = false` em `config.toml` permite chaves de assinatura atuais: a função obrigatoriamente valida o token com `auth.getUser` e `auth.getClaims`, verifica o usuário, a claim de papel e o AAL2. O banco verifica novamente sessão, perfil ativo e papel administrativo antes de cada operação. Uma API key sozinha não autentica um usuário. Não remover essas verificações.

Depois de publicar o backend, enviar o código revisado ao GitHub para gerar o build no Pages. Nenhum deploy remoto é feito por `npm run check`.

## Executar localmente

```powershell
npx supabase start
npx supabase db push --local
Set-Content .env.functions.local 'APP_URL=http://127.0.0.1:5173'
npx supabase functions serve admin-users --env-file .env.functions.local
```

Em outro terminal, usar `.env.local` e `.env.admin` com as credenciais locais e executar:

```powershell
npm run dev
npm run check
npx supabase test db
npm run test:admin:integration
```

O teste de integração recusa endereços diferentes de `http://127.0.0.1:54321`. Cria escritórios e contas fictícias com IDs aleatórios, executa MFA real, testa a Edge Function e apaga apenas suas próprias fixtures ao terminar. A mensagem de convite fictícia fica no Mailpit. A limpeza usa um arquivo SQL temporário; se falhar, o caminho aparece no erro para investigação, sem executar reset do banco.

## Garantias e limites

- Usuários autenticados não executam o RPC privilegiado nem escrevem diretamente em `profiles` ou `audit_logs`.
- O tenant é derivado do perfil persistido. Papel e tenant informados no corpo da requisição não concedem autorização.
- Alterações são serializadas por escritório, evitando que duas operações removam os últimos administradores simultaneamente.
- Alterar papel ou desativar acesso remove as sessões existentes. Reativar o perfil não restaura sessões antigas. A revogação elimina refresh tokens associados e as políticas negam dados a JWTs antigos.
- Auditoria e alteração de perfil/sessões fazem parte da mesma transação. A auditoria registra responsável, alvo, antes/depois, justificativa e protocolo, sem senhas, JWTs ou segredos TOTP.
- Limite de 60 operações por minuto por usuário autenticado; convites consomem preparação e conclusão. Limites de Auth/SMTP continuam independentes.
- Convites envolvem o serviço de e-mail e o banco, sem transação distribuída. A reserva precede o envio e a autorização é revalidada antes de criar o perfil. Se o envio acontecer e a conclusão falhar, a conta fica sem perfil e sem acesso; a UI informa falha parcial. Verificar `private.user_invitations`, o protocolo e o Auth antes de qualquer intervenção. Nunca apagar automaticamente uma conta existente nem conceder acesso manualmente sem validar organização e solicitante.
- A sessão do administrador pode mudar durante o envio externo. O envio pode já ter ocorrido quando a revalidação recusa o perfil, mas o destinatário não recebe acesso ao escritório.
- A tela de auditoria cobre eventos desta etapa, com filtros de ação/responsável e páginas de até 100 eventos. Filtros de clientes/processos e auditoria dos módulos jurídicos serão adicionados com esses módulos.
- Mudanças no servidor não apagam pixels já vistos. O aplicativo limpa o cache ao sair e revalida o acesso ao voltar ao foco; cada operação protegida consulta a autorização atual.

## Aceite no navegador

Usar somente dados fictícios em homologação. Confirmar convite, definição de senha e MFA; alterar um papel; desativar e reativar; tentar reutilizar a sessão antiga; conferir auditoria e justificativa; encerrar outras sessões e todas as sessões. Abrir `/admin/users` como advogado/assistente e confirmar o bloqueio. Testar a navegação em celular e teclado. A automação de API/banco não substitui pentest nem validação visual dos fluxos hospedados.
