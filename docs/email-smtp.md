# E-mails de acesso e SMTP

## Situação atual

A aplicação já aceita os links padrão do Supabase e os modelos personalizados em `supabase/templates/`. A readmissão de integrantes e a mensagem de link expirado podem ser publicadas antes da configuração de SMTP. O botão de confirmação antes de utilizar o token aparece nos novos e-mails enviados com os modelos personalizados.

Ainda falta escolher e verificar um domínio de envio. O roteiro abaixo usa Resend como exemplo; não cria conta, não contrata serviço nem configura o Supabase remoto. As configurações de Auth pertencem ao projeto Supabase: trocar de branch Git não cria um ambiente de SMTP separado.

## Enquanto não houver domínio

Manter o SMTP personalizado desativado e os modelos padrão no projeto hospedado. O envio padrão do Supabase é limitado aos endereços autorizados da equipe do projeto e está sujeito a limites de envio; não equivale à lista de integrantes cadastrados na aplicação. Não adicionar funcionários à administração do Supabase apenas para receberem convites. Para testar contas fictícias sem domínio, usar o Supabase local e abrir os e-mails no Mailpit em `http://127.0.0.1:54324`.

O site pode continuar em `https://lz-advogados.pages.dev` mesmo depois de configurar o domínio de e-mail. O domínio de envio identifica o remetente; a Site URL determina onde a pessoa define sua senha. Não é necessário migrar o site para configurar SMTP.

## Preparar o provedor

1. Ter um domínio próprio e acesso ao painel de DNS.
2. No Resend, cadastrar o domínio ou subdomínio que será usado para envio.
3. Copiar os registros DNS apresentados pelo Resend para o painel responsável pelo domínio e aguardar o status de verificação. Usar os valores gerados para esse domínio, sem copiar registros de outro projeto.
4. Criar uma chave de API de envio autorizada para o domínio verificado.

O endereço `lz-advogados.pages.dev` não é um domínio de e-mail próprio com DNS administrado pelo escritório. Não usá-lo como remetente para essa verificação. Os exemplos `example.com` abaixo são placeholders e precisam ser substituídos.

## Preencher o Supabase

No projeto correspondente, abrir **Authentication → Emails → SMTP Settings** e preencher:

| Campo                     | Valor                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Sender email address      | Um remetente no domínio verificado, como `acesso@example.com` |
| Sender name               | `LZ Advogados`                                                |
| Host                      | `smtp.resend.com`                                             |
| Port number               | `465`                                                         |
| Minimum interval per user | Manter `60` segundos inicialmente                             |
| Username                  | `resend`                                                      |
| Password                  | A chave de API criada no Resend                               |

Ativar e salvar o SMTP personalizado somente com os dados completos e o domínio verificado. A chave fica na configuração SMTP do Supabase; não entra em variáveis `VITE_`, Cloudflare Pages ou no repositório. Se o provedor oferecer rastreamento de cliques, deixá-lo desativado para esses e-mails, preservando os links de autenticação. Conferir os limites tanto do provedor quanto do Supabase.

## Publicar os modelos

Publicar primeiro o frontend que reconhece `token_hash`. Depois, em **Authentication → URL Configuration**, configurar:

- **Site URL:** `https://lz-advogados.pages.dev`, sem barra final.
- **Redirect URLs:** incluir exatamente `https://lz-advogados.pages.dev/auth/update-password`.

Os modelos usam `{{ .SiteURL }}`. Portanto, os links apontam para a URL canônica desse projeto, inclusive quando um convite é solicitado a partir de um preview do Cloudflare. Para testar outro ambiente, usar um projeto Supabase separado com sua própria Site URL.

Em **Authentication → Emails**, salvar os modelos abaixo. No PowerShell, a partir da raiz do repositório:

```powershell
# Copiar e colar no corpo de Invite user; depois salvar no painel.
Get-Content -Raw -Encoding UTF8 supabase/templates/invite.html | Set-Clipboard
```

```powershell
# Copiar e colar no corpo de Reset password; depois salvar no painel.
Get-Content -Raw -Encoding UTF8 supabase/templates/recovery.html | Set-Clipboard
```

Sugestões de assunto: **Convite para o LZ Advogados** e **Definir senha — LZ Advogados**. O deploy da Edge Function, `supabase db push` e o push da branch não atualizam esses modelos hospedados. As entradas em `supabase/config.toml` configuram somente os modelos locais.

## Validar o envio

1. Convidar pelo aplicativo uma conta fictícia com caixa de e-mail acessível e endereço ainda não cadastrado. Conferir entrega e remetente.
2. Abrir o convite mais recente. A página deve mostrar **Continuar e definir senha**; após confirmar, deve exibir os campos de senha.
3. Definir uma senha de pelo menos 12 caracteres e configurar MFA.
4. Solicitar recuperação de acesso, abrir a mensagem mais recente e testar a troca de senha. Contas com MFA continuam exigindo o autenticador quando solicitado.
5. Reabrir um link já utilizado e conferir a mensagem de link inválido/expirado com a opção de solicitar outro.

Um integrante readmitido usa a conta existente; não recebe novo convite automaticamente. Se esqueceu a senha, utiliza a recuperação. A readmissão não remove seu autenticador.

Se um envio falhar, conferir o log de entrega do provedor e os logs de Auth do Supabase, sem compartilhar links ou tokens. Para reverter apenas os modelos, guardar previamente seu HTML anterior e restaurá-lo no painel; o frontend continua compatível com links padrão. Desativar SMTP próprio volta às restrições do envio padrão e pode interromper e-mails para integrantes que não pertencem à equipe do projeto Supabase.

## Referências

- [SMTP no Supabase: restrições e configuração](https://supabase.com/docs/guides/auth/auth-smtp)
- [Restrição de edição de templates em novos projetos gratuitos](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Resend com Supabase SMTP: domínio, chave e campos](https://resend.com/docs/send-with-supabase-smtp)
- [Verificação de domínio no Resend](https://resend.com/docs/dashboard/domains/introduction)
