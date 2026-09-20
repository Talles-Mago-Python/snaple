/** Implementação das tools MCP. Cada função aqui é fina: valida o mínimo
 * (a validação de verdade é a do `@snaple/core`, que já falha alto com
 * mensagens explicando por quê — não duplicamos isso em zod) e devolve um
 * `CallToolResult`. Erros do snaple (ErroFeature, `Error` genérico de
 * `no(id)` inexistente, etc.) viram `isError: true` com a mensagem
 * original, nunca uma exceção não tratada — um cliente MCP não tem
 * como recuperar de um crash do processo, só de um erro estruturado. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  Cena, colocarSobre, encostar, centralizarEm, distribuir, alinhar, empilhar, circular,
  type CenaJSON, type FaceEntrada,
} from "@snaple/core";
import { construirCena } from "@snaple/three";
import { renderizar, codificarPng } from "./render.ts";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { cenaAtual, reiniciarCena } from "./estado.ts";

// FileReader é API de navegador; GLTFExporter usa para Blob->ArrayBuffer no
// caminho binário (.glb). Este servidor roda em Node puro -- mesmo
// polyfill mínimo já usado e testado no bridge do agente.
const globalComFileReader = globalThis as { FileReader?: unknown };
if (typeof globalComFileReader.FileReader === "undefined") {
  globalComFileReader.FileReader = class {
    result: ArrayBuffer | undefined;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

// ── Schemas compartilhados ────────────────────────────────────────────────

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const transformShape = z.object({
  posicao: vec3.optional().describe("Metros. Padrão [0,0,0]."),
  rotacao: vec3.optional().describe("Euler XYZ intrínseca, em RADIANOS. Padrão [0,0,0]."),
  escala: vec3.optional().describe("Padrão [1,1,1]."),
}).optional();

const materialShape = z.object({
  cor: z.string().optional().describe("Cor CSS, ex.: '#a0522d'."),
  metalico: z.number().min(0).max(1).optional(),
  rugosidade: z.number().min(0).max(1).optional(),
  opacidade: z.number().min(0).max(1).optional(),
  aramado: z.boolean().optional().describe("Renderiza como wireframe."),
  emissivo: z.object({
    cor: z.string(),
    intensidade: z.number().min(0).optional().describe("Padrão 1."),
  }).optional().describe("Cor própria, que não depende de luz — um mostrador aceso, um LED."),
}).optional();

const tipoNoShape = z.enum([
  "box", "sphere", "cylinder", "cone", "plane", "torus", "extrude", "lathe", "helix",
  "model", "grupo", "row", "column", "stack",
]).describe(
  "box{largura,altura,profundidade} · sphere{raio,segmentos?} · " +
  "cylinder{raioTopo,raioBase,altura,segmentos?} (raioTopo=raioBase → cilindro reto; " +
  "raioTopo=0 → cone) · cone{raio,altura,segmentos?} · plane{largura,profundidade} " +
  "(horizontal, normal +y) · torus{raio,raioTubo,segmentos?,segmentosTubo?} (anel deitado, " +
  "eixo +y) · extrude{perfil:[[x,z],...],altura,recentrar?} (perfil no plano XZ, extrudado " +
  "em +y) · lathe{perfil:[[raio,altura],...],segmentos?} (revolucionado em torno de +y) · " +
  "helix{raio,raioTubo,passo,voltas,segmentosPorVolta?,segmentosTubo?} (mola/rosca/cabo " +
  "espiralado, eixo +y) · model{src,tamanho:[x,y,z]} (bbox declarada, sem carregar arquivo) · " +
  "grupo/row/column/stack{} (containers de layout, sem params)",
);

const faceShape = z.enum(["topo", "base", "norte", "sul", "leste", "oeste", "+y", "-y", "-z", "+z", "+x", "-x"])
  .describe("topo=+y, base=-y, norte=-z, sul=+z, leste=+x, oeste=-x.");

const vistaShape = z.union([z.enum(["iso", "frente", "lado", "topo"]), vec3]).optional()
  .describe("Direção da câmera: um preset, ou um vetor [x,y,z] próprio (direção de onde a câmera olha para 'alvo'). Padrão 'iso'.");

const formaFuroShape = z.union([
  z.object({ tipo: z.literal("circulo"), raio: z.number(), segmentos: z.number().int().min(3).optional() }),
  z.object({ tipo: z.literal("retangulo"), largura: z.number(), altura: z.number() }),
  z.object({
    tipo: z.literal("poligono"),
    pontos: z.array(z.tuple([z.number(), z.number()])).min(3)
      .describe("Coordenadas (u,v) relativas ao CENTRO DO FURO, não ao centro da face."),
  }),
]);

function texto(s: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: s }] };
}

function erro(e: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text", text: `ERRO: ${msg}` }], isError: true };
}

/** Toda tool passa por aqui: roda `fn`, devolve o texto ou captura o erro do
 * snaple como `isError` em vez de derrubar o processo do servidor. */
function executar<T>(fn: () => T, formatar: (r: T) => string) {
  try {
    return texto(formatar(fn()));
  } catch (e) {
    return erro(e);
  }
}

async function executarAsync<T>(fn: () => Promise<T>, formatar: (r: T) => string) {
  try {
    return texto(formatar(await fn()));
  } catch (e) {
    return erro(e);
  }
}

/** Sufixo padrão de avisos ativos depois de uma mutação -- mesmo padrão do
 * bridge do agente: quem muda a cena já vê na hora se algo ficou flutuando,
 * penetrando ou com centros suspeitos. */
function comAvisos(msg: string): string {
  const t = cenaAtual().avisosTexto();
  return t ? `${msg}\n${t}` : msg;
}

// ── Registro ────────────────────────────────────────────────────────────

export function registrarFerramentas(server: McpServer): void {
  server.registerTool("criar_no", {
    title: "Criar nó",
    description: "Cria um nó na cena (geometria, model ou container de layout) e devolve o id.",
    inputSchema: {
      tipo: tipoNoShape,
      params: z.record(z.string(), z.unknown()).describe("Params específicos do tipo — ver descrição de 'tipo'."),
      transform: transformShape,
      material: materialShape,
      pai: z.string().optional().describe("Id de um nó já existente, para criar este como filho dele."),
      nome: z.string().optional().describe(
        "Rótulo semântico ('mesa', 'xícara'). Sem isto, descrever_cena() usa o substantivo do tipo.",
      ),
    },
  }, ({ tipo, params, transform, material, pai, nome }) => executar(
    () => cenaAtual().criar(tipo, params as never, { transform, material, pai, nome }),
    (ref) => comAvisos(ref.id),
  ));

  server.registerTool("modificar_no", {
    title: "Modificar nó",
    description: "Altera transform/params/material/nome de um nó existente, por id.",
    inputSchema: {
      id: z.string(),
      transform: transformShape,
      params: z.record(z.string(), z.unknown()).optional(),
      material: materialShape,
      nome: z.string().optional(),
    },
  }, ({ id, transform, params, material, nome }) => executar(() => {
    const cena = cenaAtual();
    if (transform) cena.transformar(id, transform);
    if (params) cena.definirParams(id, params as never);
    if (material) cena.definirMaterial(id, material);
    if (nome !== undefined) cena.ref(id).nomear(nome);
    return id;
  }, (id) => comAvisos(`'${id}' modificado`)));

  server.registerTool("remover_no", {
    title: "Remover nó",
    description: "Remove um nó (e sua subárvore) da cena.",
    inputSchema: { id: z.string() },
  }, ({ id }) => executar(() => { cenaAtual().remover(id); return id; }, (id) => `'${id}' removido`));

  server.registerTool("listar_cena", {
    title: "Listar cena",
    description: "Devolve o JSON normativo completo da cena (spec/cena.schema.json) — árvore de nós, params, transform, material, features.",
    inputSchema: {},
  }, () => executar(() => cenaAtual().toJSON(), (json) => JSON.stringify(json, null, 2)));

  server.registerTool("obter_no", {
    title: "Obter nó",
    description: "Devolve um nó específico (tipo, params, transform, material, filhos) e a bbox mundial dele.",
    inputSchema: { id: z.string() },
  }, ({ id }) => executar(() => {
    const cena = cenaAtual();
    const no = cena.no(id);
    return { no, bbox: cena.bbox(id), bboxPropria: cena.bboxPropria(id) };
  }, (r) => JSON.stringify(r, null, 2)));

  server.registerTool("descrever_cena", {
    title: "Descrever cena",
    description: "Descreve a cena em PROSA (relações espaciais, agrupamentos, avisos) — mais barato que renderizar para conferir uma montagem.",
    inputSchema: {},
  }, () => executar(() => cenaAtual().descrever(), (s) => s || "(cena vazia)"));

  server.registerTool("avisos_cena", {
    title: "Avisos da cena",
    description: "Roda o linter de cena (interpenetração, objetos flutuando, centros coincidentes). São avisos, nunca bloqueios.",
    inputSchema: {},
  }, () => executar(() => cenaAtual().avisosTexto(), (t) => t || "nenhum aviso"));

  server.registerTool("limpar_cena", {
    title: "Limpar cena",
    description: "Descarta a cena atual e começa uma nova, vazia.",
    inputSchema: {},
  }, () => executar(() => reiniciarCena(), () => "cena reiniciada"));

  // ── Faces como planos de trabalho ───────────────────────────────────

  server.registerTool("colocar_na_face", {
    title: "Colocar na face",
    description: (
      "Posiciona 'alvo' na face de 'dono': a borda dele encosta EXATAMENTE no plano e ele " +
      "nasce orientado para fora — nunca flutua nem penetra, por construção. 'u'/'v' são " +
      "coordenadas no plano LOCAL da face (origem no centro dela), não no mundo."
    ),
    inputSchema: {
      dono: z.string(), face: faceShape, alvo: z.string(),
      u: z.number().optional(), v: z.number().optional(),
      alinhamento: z.enum(["centro", "inicio", "fim"]).optional(),
      gap: z.number().optional().describe("Folga entre a face e o alvo. Padrão 0 (encostado)."),
      orientar: z.boolean().optional().describe("false mantém a rotação atual do alvo. Padrão true."),
      reparentar: z.boolean().optional().describe("false não adota o alvo como filho do dono. Padrão true."),
    },
  }, ({ dono, face, alvo, ...opcoes }) => executar(
    () => cenaAtual().ref(dono).face(face).colocar(alvo, opcoes),
    (ref) => comAvisos(`'${ref.id}' colocado na face '${face}' de '${dono}'`),
  ));

  server.registerTool("distribuir_na_face", {
    title: "Distribuir na face",
    description: "Distribui vários nós ao longo de um eixo (u ou v) do plano de uma face, com semântica de justify-content do CSS, sobre bordas.",
    inputSchema: {
      dono: z.string(), face: faceShape, alvos: z.array(z.string()).min(1),
      eixo: z.enum(["u", "v"]).optional(),
      extensao: z.number().optional(),
      gapEntre: z.number().optional(),
      justify: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]).optional(),
      offset: z.number().optional(),
      alinhamento: z.enum(["centro", "inicio", "fim"]).optional(),
      gap: z.number().optional(),
    },
  }, ({ dono, face, alvos, ...opcoes }) => executar(
    () => cenaAtual().ref(dono).face(face).distribuir(alvos, opcoes),
    (refs) => comAvisos(`${refs.length} nó(s) distribuído(s) na face '${face}' de '${dono}'`),
  ));

  server.registerTool("grade_na_face", {
    title: "Grade na face",
    description: "Arranja vários nós numa grade colunas×linhas no plano de uma face.",
    inputSchema: {
      dono: z.string(), face: faceShape, alvos: z.array(z.string()).min(1),
      colunas: z.number().int().min(1), linhas: z.number().int().min(1).optional(),
      gapEntre: z.union([z.number(), z.tuple([z.number(), z.number()])]).optional(),
      extensao: z.tuple([z.number(), z.number()]).optional(),
      espalhar: z.boolean().optional(),
      alinhamento: z.enum(["centro", "inicio", "fim"]).optional(),
      gap: z.number().optional(),
    },
  }, ({ dono, face, alvos, colunas, linhas, ...opcoes }) => executar(
    () => cenaAtual().ref(dono).face(face).grade(alvos, colunas, linhas, opcoes),
    (refs) => comAvisos(`${refs.length} nó(s) em grade na face '${face}' de '${dono}'`),
  ));

  // ── Furo paramétrico ─────────────────────────────────────────────────

  server.registerTool("furar", {
    title: "Furar",
    description: (
      "Acrescenta um furo paramétrico (estado, não corte destrutivo — mude o raio depois com " +
      "atualizar_furo). Falha alto se for geometricamente impossível (nó não-extrudável, furo " +
      "maior que a peça, furos em faces de normais diferentes no mesmo nó, furo atravessando " +
      "outro nó)."
    ),
    inputSchema: {
      id: z.string(), face: faceShape, forma: formaFuroShape,
      u: z.number(), v: z.number(),
      profundidade: z.number().positive().optional().describe("Ausente = furo passante."),
    },
  }, ({ id, ...furo }) => executar(
    () => { cenaAtual().ref(id).furar(furo as never); return id; },
    (id) => `furo adicionado em '${id}'`,
  ));

  server.registerTool("atualizar_furo", {
    title: "Atualizar furo",
    description: "Edita um furo já existente (por índice) e revalida — é o que torna o furo realmente paramétrico.",
    inputSchema: {
      id: z.string(), indice: z.number().int().min(0),
      face: faceShape.optional(), forma: formaFuroShape.optional(),
      u: z.number().optional(), v: z.number().optional(), profundidade: z.number().positive().optional(),
    },
  }, ({ id, indice, ...mudancas }) => executar(
    () => { cenaAtual().ref(id).atualizarFuro(indice, mudancas as never); return id; },
    (id) => `furo ${indice} de '${id}' atualizado`,
  ));

  server.registerTool("limpar_furos", {
    title: "Limpar furos",
    description: "Remove todos os furos de um nó.",
    inputSchema: { id: z.string() },
  }, ({ id }) => executar(
    () => { cenaAtual().ref(id).limparFuros(); return id; },
    (id) => `furos de '${id}' removidos`,
  ));

  // ── Layout declarativo no espaço do mundo ───────────────────────────

  server.registerTool("colocar_sobre", {
    title: "Colocar sobre",
    description: "Apoia a base de 'id' exatamente no topo de 'alvo' — sem gap, sem penetração.",
    inputSchema: {
      id: z.string(), alvo: z.string(),
      alinhamento: z.enum(["centro", "inicio", "fim"]).optional(),
      gap: z.number().optional(),
    },
  }, ({ id, alvo, ...opcoes }) => executar(
    () => { colocarSobre(cenaAtual().ref(id), cenaAtual().ref(alvo), opcoes); return id; },
    (id) => comAvisos(`'${id}' colocado sobre o alvo`),
  ));

  server.registerTool("encostar", {
    title: "Encostar",
    description: "Encosta 'id' num dos lados de 'alvo', com gap opcional entre as BORDAS (não entre centros). Nos outros dois eixos, centraliza em 'alvo'.",
    inputSchema: { id: z.string(), alvo: z.string(), lado: faceShape, gap: z.number().optional() },
  }, ({ id, alvo, lado, gap }) => executar(
    () => { encostar(cenaAtual().ref(id), cenaAtual().ref(alvo), lado as FaceEntrada, gap); return id; },
    (id) => comAvisos(`'${id}' encostado a '${lado}' do alvo`),
  ));

  server.registerTool("alinhar", {
    title: "Alinhar",
    description: "Alinha as bboxes de vários nós num eixo do mundo. 'inicio' = menor coordenada, 'fim' = maior.",
    inputSchema: {
      ids: z.array(z.string()).min(1), eixo: z.enum(["x", "y", "z"]),
      modo: z.enum(["inicio", "centro", "fim"]).optional(),
    },
  }, ({ ids, eixo, modo }) => executar(() => {
    const modoMap = { inicio: "start", centro: "center", fim: "end" } as const;
    alinhar(ids.map((id) => cenaAtual().ref(id)), eixo, modoMap[modo ?? "centro"]);
    return ids;
  }, (ids) => comAvisos(`${ids.length} nó(s) alinhado(s) no eixo '${eixo}'`)));

  server.registerTool("centralizar_em", {
    title: "Centralizar em",
    description: "Centraliza 'id' em 'alvo' só nos eixos pedidos (ex.: 'xz' centraliza no plano horizontal sem mexer na altura).",
    inputSchema: { id: z.string(), alvo: z.string(), eixos: z.string().optional().describe("Combinação de x/y/z. Padrão 'xz'.") },
  }, ({ id, alvo, eixos }) => executar(
    () => { centralizarEm(cenaAtual().ref(id), cenaAtual().ref(alvo), eixos); return id; },
    (id) => comAvisos(`'${id}' centralizado no alvo`),
  ));

  server.registerTool("empilhar", {
    title: "Empilhar",
    description: "Empilha nós na ordem da lista, cada um encostado no anterior.",
    inputSchema: { ids: z.array(z.string()).min(2), direcao: faceShape.optional(), gap: z.number().optional() },
  }, ({ ids, direcao, gap }) => executar(() => {
    empilhar(ids.map((id) => cenaAtual().ref(id)), (direcao as FaceEntrada) ?? "topo", gap);
    return ids;
  }, (ids) => comAvisos(`${ids.length} nó(s) empilhado(s)`)));

  server.registerTool("distribuir", {
    title: "Distribuir",
    description: "Distribui nós ao longo de um eixo do mundo com semântica de justify-content do CSS, sobre bordas.",
    inputSchema: {
      ids: z.array(z.string()).min(1), eixo: z.enum(["x", "y", "z"]).optional(),
      justify: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]).optional(),
      gap: z.number().optional(), extensao: z.number().optional(),
      dentro: z.string().optional().describe("Id de um nó cuja bbox vira o limite da faixa."),
      centro: z.number().optional(),
      ordenar: z.boolean().optional().describe("false mantém a ordem da lista. Padrão true (ordena pela posição atual)."),
    },
  }, ({ ids, dentro, ...opcoes }) => executar(() => {
    distribuir(ids.map((id) => cenaAtual().ref(id)), { ...opcoes, dentro: dentro ? cenaAtual().ref(dentro) : undefined });
    return ids;
  }, (ids) => comAvisos(`${ids.length} nó(s) distribuído(s)`)));

  server.registerTool("circular", {
    title: "Circular",
    description: "Distribui nós em círculo, com ângulos igualmente espaçados. Útil para 'cadeiras ao redor da mesa'.",
    inputSchema: {
      ids: z.array(z.string()).min(1), raio: z.number(),
      centro: z.union([z.string(), vec3]).optional().describe("Id de um nó, ou [x,y,z]. Padrão: centro atual do conjunto."),
      plano: z.enum(["xz", "xy", "yz"]).optional(),
      anguloInicial: z.number().optional().describe("Radianos. Padrão 0."),
    },
  }, ({ ids, raio, centro, ...opcoes }) => executar(() => {
    const centroArg = Array.isArray(centro) ? centro : typeof centro === "string" ? cenaAtual().ref(centro) : undefined;
    circular(ids.map((id) => cenaAtual().ref(id)), raio, { ...opcoes, centro: centroArg });
    return ids;
  }, (ids) => comAvisos(`${ids.length} nó(s) em círculo`)));

  // ── Persistência e exportação ────────────────────────────────────────

  server.registerTool("salvar_cena_json", {
    title: "Salvar cena em JSON",
    description: "Grava o JSON normativo da cena atual num arquivo — é o que permite retomar o trabalho numa sessão futura com carregar_cena_json.",
    inputSchema: { caminho: z.string() },
  }, ({ caminho }) => executarAsync(async () => {
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, JSON.stringify(cenaAtual().toJSON(), null, 2), "utf-8");
    return caminho;
  }, (p) => `cena salva em '${p}'`));

  server.registerTool("carregar_cena_json", {
    title: "Carregar cena de JSON",
    description: "Substitui a cena atual pelo conteúdo de um arquivo salvo com salvar_cena_json (ou qualquer JSON conforme spec/cena.schema.json).",
    inputSchema: { caminho: z.string() },
  }, ({ caminho }) => executarAsync(async () => {
    const json = JSON.parse(await readFile(caminho, "utf-8")) as CenaJSON;
    reiniciarCena(Cena.deJSON(json));
    return cenaAtual().nosGeometricos().length;
  }, (n) => `cena carregada de '${caminho}' (${n} nó(s) geométrico(s))`));

  server.registerTool("exportar_cena", {
    title: "Exportar cena",
    description: "Renderiza a cena (via @snaple/three, headless — sem navegador) e exporta para .glb, .obj ou .stl.",
    inputSchema: { formato: z.enum(["glb", "obj", "stl"]), caminho: z.string() },
  }, ({ formato, caminho }) => executarAsync(async () => {
    const { objeto, avisos } = await construirCena(cenaAtual(), { carregarModelo: async () => null });
    await mkdir(dirname(caminho), { recursive: true });
    if (formato === "glb") {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        new GLTFExporter().parse(objeto, (r) => resolve(r as ArrayBuffer), reject, { binary: true });
      });
      await writeFile(caminho, Buffer.from(buffer));
    } else if (formato === "obj") {
      await writeFile(caminho, new OBJExporter().parse(objeto), "utf-8");
    } else {
      await writeFile(caminho, new STLExporter().parse(objeto), "utf-8");
    }
    return { caminho, avisos: avisos.map((a) => a.texto) };
  }, (r) => {
    const base = `exportado para '${r.caminho}'`;
    return r.avisos.length ? `${base}\n${r.avisos.map((a) => `BACKEND: ${a}`).join("\n")}` : base;
  }));

  server.registerTool("renderizar_png", {
    title: "Renderizar PNG",
    description:
      "Renderiza a cena para uma imagem PNG — rasterizador de software puro-CPU (sem GPU, sem " +
      "headless-gl, sem binário nativo), sobre a mesma malha que exportar_cena constrói via " +
      "@snaple/three. Serve para um agente conferir forma/proporção sem abrir viewer; não é " +
      "renderização de produção (sombreamento plano por triângulo, luz direcional fixa, sem sombra).",
    inputSchema: {
      vista: vistaShape,
      alvo: vec3.optional().describe("Ponto para onde a câmera olha. Padrão: centro da bbox da cena."),
      distancia: z.number().positive().optional().describe("Metros até 'alvo'. Padrão: a cena inteira cabe no quadro."),
      largura: z.number().int().positive().optional().describe("Pixels. Padrão 480."),
      altura: z.number().int().positive().optional().describe("Pixels. Padrão 360."),
      caminho: z.string().optional().describe("Se presente, também grava o PNG neste arquivo (além de devolvê-lo inline)."),
    },
  }, async ({ vista, alvo, distancia, largura, altura, caminho }) => {
    try {
      const { objeto, avisos } = await construirCena(cenaAtual(), { carregarModelo: async () => null });
      const resultado = renderizar(objeto, {
        ...(vista !== undefined ? { vista } : {}),
        ...(alvo ? { alvo } : {}),
        ...(distancia !== undefined ? { distancia } : {}),
        ...(largura !== undefined ? { largura } : {}),
        ...(altura !== undefined ? { altura } : {}),
      });
      const png = codificarPng(resultado.rgb, resultado.largura, resultado.altura);
      if (caminho) {
        await mkdir(dirname(caminho), { recursive: true });
        await writeFile(caminho, png);
      }
      const linhas = [
        `${resultado.largura}×${resultado.altura}px${caminho ? `, salvo em '${caminho}'` : ""}`,
        ...avisos.map((a) => `BACKEND: ${a.texto}`),
      ];
      return {
        content: [
          { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
          { type: "text" as const, text: linhas.join("\n") },
        ],
      };
    } catch (e) {
      return erro(e);
    }
  });
}
