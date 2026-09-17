# PWA

O frontend é publicado como uma PWA web pelo build do Vite. O `vite-plugin-pwa` gera
`manifest.webmanifest`, `sw.js` e o runtime do Workbox em `dist`. O Service Worker usa
pré-cache apenas da shell e dos assets estáticos versionados; não há cache de chamadas
Supabase, respostas de API, tokens ou dados jurídicos.

## Instalação

- Android/Chrome: abra o site, aguarde o carregamento completo e use o menu **Instalar
  aplicativo** (em versões que exibem **Instalar e criar atalho**, a opção de instalação
  aparece quando o manifest e o Service Worker já foram atualizados; remova o atalho antigo
  e recarregue se o navegador tiver uma versão anterior em cache).
- Samsung Internet: use o menu do navegador e **Adicionar página à tela inicial**, quando a
  versão instalada oferecer a instalação de PWA.
- iPhone/iPad: no Safari use **Compartilhar → Adicionar à Tela de Início**. O iOS usa o
  manifest e o `apple-touch-icon`, sem exigir ou prometer recursos nativos não suportados.
- Chromium desktop: use o ícone de instalação na barra de endereço ou o menu do navegador.

Com `display: standalone`, uma instalação compatível abre sem a barra de endereço normal.
`start_url` e `scope` são `/`, portanto funcionam no domínio `pages.dev` e em domínio
personalizado sem alteração de código.

## Atualizações e testes

O Service Worker é registrado em produção e usa atualização sob demanda (`prompt`). Quando
uma versão nova é detectada, a aplicação mostra **Nova versão disponível — Atualizar agora**;
ela não recarrega durante o trabalho do usuário. Use o botão quando for seguro atualizar.

No Chrome DevTools, abra **Application → Manifest** para conferir manifest, ícones e
`start_url`, e **Application → Service Workers** para confirmar que `sw.js` está instalado e
controlando a página. Em uma publicação, confirme HTTP 200 para `/manifest.webmanifest`,
`/sw.js`, `/icon-192.svg` e `/icon-512.svg`.

Offline continua sendo somente leitura. Esta etapa não implementa a projeção limitada de
agenda/prazos prevista na SPEC; por isso nenhum dado jurídico é persistido offline. Logout,
troca de usuário e revogação continuam limpando a sessão em memória, e nenhuma credencial é
colocada no manifest, Cache Storage ou Service Worker.

Limitações: a disponibilidade do prompt de instalação é decidida pelo navegador e exige
HTTPS, manifest válido, Service Worker controlando a origem e os critérios específicos da
versão do navegador. Safari/iOS oferece a instalação manual pela tela inicial.
