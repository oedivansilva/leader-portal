# Portal do Líder — versão modular

## Publicação no GitHub Pages

Envie para a raiz do repositório tudo o que está nesta pasta, preservando as pastas `css`, `js` e `supabase`. O arquivo inicial precisa continuar se chamando `index.html`.

Depois do commit, aguarde a publicação e atualize a página com `Ctrl + F5`.

## Supabase

1. Execute `supabase/ATUALIZAR_BANCO.sql` no SQL Editor.
2. Atualize a Edge Function `admin-create-user` com `supabase/functions/admin-create-user/index.ts`.
3. Crie uma Edge Function chamada `admin-manage-user` com `supabase/functions/admin-manage-user/index.ts`.
4. Faça o deploy das duas funções.

## Páginas

- `index.html`: login e troca da senha temporária;
- `admin.html`: painel administrativo com menu, usuários, estrutura, solicitações e auditoria;
- `leader.html`: abertura e acompanhamento das solicitações;
- `onsite.html`: tratamento e geração local dos PDFs.

Os PDFs continuam sendo baixados no navegador e não são armazenados no Supabase.
