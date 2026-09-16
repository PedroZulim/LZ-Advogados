# Arquitetura inicial

React/Vite serve a interface em português. Supabase Auth fornece sessão e MFA TOTP. O frontend só consulta `profiles` depois de confirmar AAL2; essa verificação de experiência é repetida no banco por RLS.

`organizations` e `profiles` são as únicas tabelas de negócio desta entrega. Helpers `SECURITY DEFINER` ficam em `private`, com search_path vazio e nomes de objetos qualificados. O schema não é exposto pela Data API. Eles leem o perfil autenticado sem causar recursão de RLS e exigem uma sessão existente em `auth.sessions`.

Somente o processo administrativo confiável usa service-role. O browser recebe URL e chave publicável/anon. Membership é persistido pelo bootstrap, não por trigger de cadastro que confie em metadata. Usuário Auth sem perfil não recebe acesso.

Não há service worker nem persistência de queries. O cache do TanStack Query é em memória e limpo em mudanças de autenticação. Centralização de timezone: `src/lib/config.ts` e constraint no banco. Timestamps técnicos são timestamptz.

As versões exatas ficam em package-lock.json. FullCalendar, date-fns e vite-plugin-pwa serão adicionados nas fases que os utilizam.

Referências oficiais consultadas para esta implementação:

- [MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp).
- [RLS e helpers privados](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).
