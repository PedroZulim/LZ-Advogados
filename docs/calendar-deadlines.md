# Agenda e prazos

As rotas `/calendar`, `/events/:id`, `/deadlines` e `/deadlines/:id` implementam a agenda e o controle de prazos do escritório.

## Agenda

Eventos podem ser audiências, reuniões, ligações, tarefas, compromissos ou outros. Cada evento tem título, descrição, responsável, início, término, indicação de dia inteiro, recorrência básica diária/semanal/mensal e participantes. Cliente e processo são vínculos opcionais, sempre do mesmo escritório. A agenda oferece visualizações de mês, semana, dia e lista; a lista também é usada em telas estreitas.

O responsável precisa estar ativo no momento do salvamento. Um evento pode ser cancelado por administrador, advogado ou seu responsável principal, sempre com justificativa. Eventos cancelados permanecem no histórico e não são apagados automaticamente.

## Prazos

Todo prazo pertence a um processo. O cadastro guarda título, descrição, data inicial, data limite, horário opcional, responsável, participantes, prioridade e situação. As prioridades são Baixa, Normal, Alta e Urgente. Os estados operacionais são Pendente, Em andamento, Concluído e Vencido. A tela de prazos permite buscar por título, descrição, processo ou data e filtrar por situação.

Ao abrir a lista, o banco marca como `overdue` os prazos pendentes ou em andamento cujo vencimento já passou, usando o fim do dia em `America/Sao_Paulo` quando não há horário. O prazo nunca é removido por estar vencido.

Todos os perfis ativos podem criar prazos e alterar seus dados descritivos. Apenas administradores e advogados podem mudar a data, concluir, reabrir ou cancelar. Alterar a data exige justificativa entre 3 e 500 caracteres. Reabrir e cancelar também exigem justificativa; concluir aceita uma observação opcional e registra `completed_at` e `completed_by`. Cancelar exclui definitivamente o prazo e seus participantes das tabelas operacionais; a auditoria preserva o registro da ação e os dados anteriores para rastreabilidade.

As alterações passam por RPCs protegidas no banco, com MFA, sessão válida, tenant derivado do perfil, vínculos compostos e controle de concorrência por `updated_at`. A auditoria registra criação, edição, reagendamento, conclusão, reabertura e cancelamento. Participantes inativos não podem ser adicionados a novos registros.

## Implantação

Aplicar todas as migrations, inclusive `202609170005_calendar_deadlines.sql`, `202609170006_deadline_hardening.sql`, `202609170007_deadline_cancel_delete.sql` e `202609220001_event_lifecycle_hardening.sql`, antes de publicar o frontend:

```powershell
npx supabase db push --dry-run
npx supabase db push
git push origin main
```

Não há nova Edge Function nem variável de ambiente para esta etapa. Integrações com Google/Outlook, notificações por e-mail, `pg_cron` periódico, cálculo automático de prazos jurídicos e exceções avançadas de recorrência permanecem para fases posteriores.

## Aceite

Com contas fictícias, criar evento com participante, abrir mês/semana/dia/lista, cancelar com justificativa e conferir auditoria. Criar prazo urgente, alterar a data com e sem justificativa, esperar ou simular o vencimento, concluir, reabrir e cancelar. Repetir as ações como assistente e confirmar que o backend recusa a operação, mesmo que a requisição seja feita diretamente.
