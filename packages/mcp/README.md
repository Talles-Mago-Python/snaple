# @snaple/mcp

Servidor MCP do snaple: expõe o layout 3D declarativo do `@snaple/core` e a
exportação do `@snaple/three` como *tools* MCP, sobre transporte stdio.
Pensado para Claude Code, mas funciona com qualquer cliente MCP.

Uma única cena fica em memória por processo do servidor (uma sessão de
cliente = um processo = uma cena). Para persistir entre sessões, use
`salvar_cena_json`/`carregar_cena_json` — grava/lê o JSON normativo em
`spec/cena.schema.json`.

## Registrar no Claude Code

Primeiro `npm run build` na raiz do monorepo (ou `npm run build -w
@snaple/mcp`), depois:

```bash
claude mcp add snaple -- node /caminho/absoluto/para/snaple/packages/mcp/dist/index.js
```

Ou, num `.mcp.json` de projeto (compartilhável pelo repositório):

```json
{
  "mcpServers": {
    "snaple": {
      "command": "node",
      "args": ["/caminho/absoluto/para/snaple/packages/mcp/dist/index.js"]
    }
  }
}
```

Confirme com `claude mcp list` (ou `/mcp` dentro de uma sessão) que o
servidor aparece conectado, e que as tools abaixo estão listadas.

## Tools

| tool | o que faz |
|---|---|
| `criar_no` | cria um nó (geometria/model/container) |
| `modificar_no` | altera transform/params/material/nome |
| `remover_no` | remove um nó e sua subárvore |
| `listar_cena` | JSON normativo completo |
| `obter_no` | um nó + bbox mundial |
| `descrever_cena` | a cena em prosa |
| `avisos_cena` | linter (interpenetração, flutuando, centros coincidentes) |
| `limpar_cena` | reinicia a cena |
| `colocar_na_face` / `distribuir_na_face` / `grade_na_face` | posicionamento relativo à face própria de um nó |
| `furar` / `atualizar_furo` / `limpar_furos` | furo paramétrico sem CSG |
| `colocar_sobre` / `encostar` / `alinhar` / `centralizar_em` / `empilhar` / `distribuir` / `circular` | layout relacional no espaço do mundo |
| `salvar_cena_json` / `carregar_cena_json` | persistência entre sessões |
| `exportar_cena` | `.glb`/`.obj`/`.stl`, headless (sem navegador) |

Cada tool devolve texto simples (id, confirmação, ou JSON quando faz sentido
— `listar_cena`/`obter_no`); mutações incluem os avisos ativos no final,
quando houver. Erros do snaple (nó inexistente, furo impossível, etc.)
voltam como `isError: true` com a mensagem original — nunca derrubam o
processo do servidor.

## Desenvolvimento

```bash
npm run build -w @snaple/mcp   # compila dist/
node packages/mcp/dist/index.js  # roda o servidor cru, lendo/escrevendo
                                  # JSON-RPC linha a linha em stdio — útil
                                  # pra depurar com um cliente MCP na mão
```

Este pacote não tem estado além da `Cena` em memória (`src/estado.ts`) — a
lógica de verdade é toda do `@snaple/core`/`@snaple/three`; `src/ferramentas.ts`
só traduz chamadas de tool para a API deles e formata o resultado.
