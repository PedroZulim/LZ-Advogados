# Desenvolvimento e implantação

Requisitos: Node 22.12+, npm, Docker Desktop com containers Linux para Supabase local. A CLI Supabase é dependência de desenvolvimento do projeto.

1. `npm ci`
2. `npm run db:start`
3. `npm run db:reset` (somente banco local descartável; apaga os dados locais).
4. Copiar `.env.example` para `.env.local` e preencher URL e anon key exibidas por `npx supabase status`. Nunca usar service-role nesse arquivo.
5. `npm run dev` e acessar a URL informada pelo Vite.

Para o administrador inicial, copiar `.env.admin.example` para `.env.admin`, configurar chave administrativa local e e-mail sintético e executar `npm run bootstrap` uma única vez, sem processos concorrentes. O script recusa repetir o bootstrap quando já há um administrador. Abrir o convite no Inbucket local (http://localhost:54324), definir senha e configurar TOTP.

Validação: `npm run check` executa lint, typecheck, testes PGlite/unitários e build. Com Supabase local ativo, `npx supabase test db` executa pgTAP contra o schema real. Validar manualmente login, convite, recovery, QR e código TOTP antes de encerrar fase 1.

Cloudflare Pages, quando os gates da SPEC forem cumpridos: build `npm run build`, saída `dist`. O build também publica `manifest.webmanifest`, `sw.js`, Workbox e os ícones em `public/`. Configurar apenas VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para o ambiente correspondente. `_redirects` trata rotas SPA; `_headers` aplica CSP e no-store. Ajustar connect-src se Supabase usar domínio customizado. A configuração de headers não é aplicada pelo servidor Vite local. Consulte [PWA](pwa.md) para instalação e validação.

Configurar no Supabase hospedado: signup público desabilitado, MFA TOTP habilitado, URL do site e redirect exato `/auth/update-password`, SMTP/limites, migrations revisadas. Usar projetos separados para staging e produção. Nunca importar dados reais para testes.

Esta entrega não publica o aplicativo e não é autorização para uso em produção. O workflow de CI ainda não faz deploy; os gates E2E, pentest autorizado e aprovação de release serão acrescentados antes da primeira publicação.
