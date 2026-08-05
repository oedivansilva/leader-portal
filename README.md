# Portal do Líder — pacote sem pastas

Esta versão foi preparada para upload direto pelo site do GitHub. Todos os arquivos podem ficar na raiz do repositório.

## GitHub Pages

Envie para a raiz os arquivos `.html`, `.js` e `styles.css`. Confirme diretamente na branch `main`.

Os arquivos abaixo não são usados pelo GitHub Pages, mas estão no pacote para configuração do Supabase:

- `ATUALIZAR_BANCO.sql`: execute o conteúdo no SQL Editor;
- `ATIVAR_GESTAO_E_DASHBOARD.sql`: estrutura de colaboradores, benefícios e métricas disciplinares;
- `ATIVAR_PRESENCA_ABS_TURNOVER.sql`: execute depois do arquivo anterior para ativar escalas por dia, controle de presença, ABS e turnover;
- `admin-create-user.ts`: código da Edge Function `admin-create-user`;
- `admin-manage-user.ts`: código da Edge Function `admin-manage-user`.

## Novos módulos

- `presence.html`: grade mensal com a legenda completa de presença, faltas, afastamentos, férias, folgas e movimentações. Ao clicar em um dia, o líder escolhe o código em uma lista;
- `workforce.js`: listas administrativas de presença e turnover;
- `dashboard.js`: indicadores de ABS, solicitações disciplinares, tempo de aplicação e turnover.

No menu administrativo, **Colaboradores** contém somente os cadastros e históricos das pessoas. **Escalas e benefícios** concentra as configurações usadas nesses cadastros.

Em **Colaboradores > Importação em lote**, baixe `MODELO_IMPORTACAO_COLABORADORES.xlsx`, preencha a aba COLABORADORES e use **Conferir arquivo** antes de importar. O portal aceita `.xlsx`, `.xls` e `.csv`, valida cada linha e atualiza registros que já tenham a mesma MAT.

No cadastro do turno/escala, marque somente os dias trabalhados. Dias não selecionados são folgas e não aceitam marcações. Turnos/escalas podem ser editados, desativados ou excluídos; a exclusão é bloqueada quando há colaboradores vinculados para preservar o histórico.

Quando a escala de um colaborador for alterada, clique em **Salvar** normalmente. O portal identifica a mudança e pergunta a partir de qual data a nova escala vale. A escala anterior permanece vinculada aos dias anteriores, inclusive quando a mudança acontece no meio do mês. No cadastro inicial, a vigência começa automaticamente na admissão. Na importação em lote, use a coluna `ESCALA_VIGENCIA`; se estiver vazia, será usada a data de admissão.

Os portais do Líder e do Onsite possuem menus laterais próprios, exibindo somente as funções liberadas para cada perfil.

As marcações `F` e `NS` ainda não vinculadas aparecem na página de Solicitações disciplinares. O portal sugere Advertência no primeiro caso e Suspensão quando já existe advertência aplicada ao colaborador. A decisão e o envio continuam dependendo da confirmação do líder. Ao enviar, as datas de falta são vinculadas à solicitação e deixam de aparecer como pendentes.

Marcações, alterações, remoções, criação de solicitações e mudanças de status geram registros em `system_activity_log`. O nome de quem realizou a ação aparece discretamente nas telas operacionais e o histórico completo fica disponível na aba Auditoria do Admin.

## Atualização desta versão

Depois de enviar os arquivos ao GitHub, execute novamente todo o conteúdo de `ATIVAR_PRESENCA_ABS_TURNOVER.sql` no SQL Editor do Supabase. Essa etapa cria o histórico de escalas e libera todos os códigos da grade mensal. O script converte e preserva as marcações P/F/AM já existentes.

Depois do commit, aguarde a publicação, saia do portal e entre novamente. O Admin será direcionado para `admin.html`.
