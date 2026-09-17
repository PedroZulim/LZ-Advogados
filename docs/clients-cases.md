# Clientes e processos — fase 2

Rotas `/clients`, `/clients/new`, `/clients/:id`, `/cases`, `/cases/new` e `/cases/:id`. Todos os perfis ativos com MFA podem consultar, criar e editar os registros do escritório. Somente administradores e advogados podem arquivar. O botão **Remover integrante**, na administração de usuários, agora tem borda e texto vermelhos; **Encerrar sessões** mantém o estilo normal.

## Funcionalidades

- Clientes: pessoa física/jurídica, nome, documento opcional, contato, endereço, responsável e observações. A busca encontra nome, e-mail e documento e permite filtrar ativos/arquivados.
- Processos: cliente, responsável administrador/advogado, número ou identificador, tribunal, vara, área, posição do cliente, parte contrária, situação e observações. A busca encontra números normalizados e parte contrária. O detalhe do cliente permite consultar seus processos.
- As nove áreas previstas na SPEC são criadas por escritório, inclusive ao criar uma nova organização. Administradores cadastram novas áreas pelo formulário de processo.
- Arquivamento exige justificativa e mantém o registro disponível no histórico. Registros arquivados não são editáveis. Arquivar cliente não muda a situação dos processos existentes; eles podem continuar sendo atualizados, mas novos processos exigem cliente ativo.
- Alterações têm controle de concorrência: se o cadastro mudou desde a abertura, salvar é recusado e a interface pede que o usuário recarregue antes de tentar novamente.
- Auditoria registra criação, edição, arquivamento e criação de áreas. CPF/CNPJ é omitido das cópias de antes/depois; continua disponível no cadastro protegido, sem persistência offline.

## Decisões de implementação

CPF/CNPJ é opcional e preservado como texto, aceitando inclusive identificadores alfanuméricos; não há validação de dígitos verificadores. Números com 20 dígitos recebem formatação CNJ; a busca usa versão normalizada sem pontuação. Isso não verifica existência do processo nem dígito verificador CNJ. Identificadores administrativos e internos continuam aceitos.

Vínculos com responsáveis históricos são preservados se a pessoa for desativada/removida depois do cadastro. Ao selecionar um novo responsável, o banco exige integrante ativo do mesmo escritório. Processo novo exige responsável administrador ou advogado. Um responsável anterior pode continuar no registro até sua substituição, sem impedir outras edições.

As listas têm páginas de 20 registros. O seletor de clientes busca até 21 resultados por termo; refine o termo para encontrar outros. Listas auxiliares de integrantes/áreas respeitam o limite configurado na Data API. Não há exportação, anexos, busca global nem cache offline nesta fase.

## Backend e implantação

A migration `202609170002_clients_cases.sql` cria as tabelas com RLS e vínculos compostos por organização. Clientes autenticados têm somente SELECT direto. Escritas passam por RPCs transacionais com verificação de sessão/MFA, perfil, tenant e papel. Os campos `organization_id`, timestamps e situações de arquivamento são controlados pelo servidor. As gravações usam o mesmo bloqueio por escritório da administração de usuários para serializar alterações de permissão.

Com o projeto de homologação corretamente vinculado, aplicar primeiro o banco:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

Se a etapa de remoção de integrantes ainda não estiver publicada, também executar:

```powershell
npx supabase functions deploy admin-users
```

Depois, enviar as alterações ao GitHub e aguardar o build do Cloudflare Pages. Clientes e processos não exigem novas variáveis de ambiente ou uma nova Edge Function. A implementação não publica automaticamente no ambiente remoto.

## Validação

Executar `npm run check`, `npx supabase test db` e, com a Edge Function local rodando, `npm run test:admin:integration`. O teste integrado também cobre operações de clientes/processos via PostgREST com JWTs reais, além de administração. Ele remove apenas seus próprios registros fictícios, inclusive clientes, processos e áreas.

Em 17/09/2026 passaram 66 testes unitários/PostgreSQL embarcado, 39 testes pgTAP no Supabase local e integração com Auth/MFA reais. A ferramenta de navegação não disponibilizou um navegador nesta sessão; a inspeção visual e o aceite no navegador hospedado permanecem pendentes. Não foi feito pentest nem deploy remoto desta etapa.

Aceite em homologação com dados fictícios:

1. Criar cliente, editar contato e buscar pelo nome/documento.
2. Abrir novo processo, buscar/selecionar cliente, escolher responsável e área; salvar identificador CNJ ou administrativo.
3. Alterar situação e conferir processos vinculados no detalhe do cliente.
4. Entrar como assistente: criar/editar deve funcionar; arquivar deve permanecer bloqueado.
5. Como advogado/admin, arquivar com justificativa e consultar o filtro de arquivados.
6. Conferir eventos em Auditoria; abrir o mesmo cadastro em duas sessões e verificar que a edição antiga não sobrescreve a nova.
7. Conferir formulários e navegação por teclado/celular e a borda vermelha apenas no botão Remover integrante.
