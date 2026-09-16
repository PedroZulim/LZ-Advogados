# Segurança da fundação

Todas as tabelas expostas possuem RLS. Anon não possui acesso às tabelas. Authenticated possui somente SELECT, restrito ao tenant do perfil ativo e à sessão com AAL2 existente e não expirada. Admin de aplicação não equivale a service-role: também não pode editar perfis diretamente.

Nunca adicionar `service_role`, chave Resend ou credenciais administrativas a variáveis VITE_. `.env.admin` é ignorado pelo Git e lido apenas pelo script de bootstrap. A chave publicável não é segredo, mas as policies devem estar ativas antes de conectar o frontend.

Não existe `/register` nem chamada signUp. O Supabase local desabilita signup; repetir essa configuração manualmente no projeto hospedado, pois config.toml não configura automaticamente o Auth remoto.

MFA e identidade ainda exigem validação E2E com GoTrue. Testes PGlite não simulam assinatura JWT e não constituem pentest. A CI contém execução separada de Supabase + pgTAP. As operações privilegiadas via Edge Functions ainda não existem.

Mensagens de erro de autenticação são genéricas. Mensagens brutas do banco não chegam à UI. A recuperação responde igualmente para contas existentes e inexistentes. Configurar limites de Auth/SMTP e origem permitida no provedor antes de staging.

Revogação no banco é verificada por presença da sessão e `not_after`; a latência de remoção de auth.sessions pelo provedor deve ser verificada na integração real. Desativar `profiles.is_active` recusa acesso imediatamente na próxima consulta. Dados já visíveis na tela não podem ser remotamente apagados do dispositivo; a interface revalida ao recuperar foco.
