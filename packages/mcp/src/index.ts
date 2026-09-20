#!/usr/bin/env node
/** Servidor MCP do snaple: expõe `@snaple/core` (layout 3D declarativo) e
 * `@snaple/three` (exportação) como tools MCP, sobre transporte stdio — o
 * modo que Claude Code (e a maioria dos clientes MCP) espera de um servidor
 * local.
 *
 * Uma única `Cena` fica em memória por processo (ver `estado.ts`); registre
 * este servidor com `claude mcp add snaple -- node
 * /caminho/para/packages/mcp/dist/index.js` (ou aponte para o binário
 * `snaple-mcp` depois de instalado). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registrarFerramentas } from "./ferramentas.ts";

const server = new McpServer({ name: "snaple", version: "0.1.0" }, {
  instructions:
    "Layout 3D declarativo: descreva RELAÇÕES ('a perna vai na face de baixo do tampo', " +
    "'as cadeiras ficam em círculo ao redor da mesa') em vez de calcular coordenadas — " +
    "criar_no + colocar_na_face/colocar_sobre/encostar/circular resolvem a geometria. " +
    "Unidade: metros. Eixo vertical: +y. Rotação: Euler XYZ intrínseca, em radianos. " +
    "Depois de montar, chame descrever_cena() para conferir em prosa (mais barato que " +
    "exportar e olhar um arquivo) e avisos_cena() para pegar interpenetração/objetos " +
    "flutuando antes de exportar_cena().",
});

registrarFerramentas(server);

await server.connect(new StdioServerTransport());
