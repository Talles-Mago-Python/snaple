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
  facetado: z.boolean().optional().describe("Sombreamento chapado por face (visual low poly), inclusive em sphere/cone/lathe."),
  emissivo: z.object({
    cor: z.string(),
    intensidade: z.number().min(0).optional().describe("Padrão 1."),
  }).optional().describe("Cor própria, que não depende de luz — um mostrador aceso, um LED."),
  textura: z.object({
    src: z.string().describe("Caminho/URL da imagem (resolvido pelo viewer/backend)."),
    repetir: z.tuple([z.number(), z.number()]).optional().describe("Repetições em (u, v). Padrão [1,1]."),
    rotacao: z.number().optional().describe("Giro da imagem, em radianos."),
  }).optional().describe(
    "Imagem repetida sobre a peça inteira (madeira, tecido): cada face plana e cada superfície curva vão de 0 a 1. " +
    "A cor multiplica a imagem (padrão branco). Para uma imagem numa REGIÃO da peça, use colar_adesivo.",
  ),
}).optional();

const valorAnimado = z.union([z.number(), vec3, z.string()]);

const tipoNoShape = z.enum([
  "box", "sphere", "cylinder", "cone", "plane", "torus", "extrude", "lathe", "helix", "sweep",
  "model", "grupo", "row", "column", "stack", "junta",
]).describe(
  "box{largura,altura,profundidade} · sphere{raio,segmentos?} · " +
  "cylinder{raioTopo,raioBase,altura,segmentos?} (raioTopo=raioBase → cilindro reto; " +
  "raioTopo=0 → cone) · cone{raio,altura,segmentos?} · plane{largura,profundidade} " +
  "(horizontal, normal +y) · torus{raio,raioTubo,segmentos?,segmentosTubo?} (anel deitado, " +
  "eixo +y) · extrude{perfil:[[x,z],...],altura,recentrar?} (perfil no plano XZ, extrudado " +
  "em +y) · lathe{perfil:[[raio,altura],...],segmentos?} (revolucionado em torno de +y) · " +
  "helix{raio,raioTubo,passo,voltas,segmentosPorVolta?,segmentosTubo?} (mola/rosca/cabo " +
  "espiralado, eixo +y) · sweep{caminho:[[x,y,z],...],secao,suavizar?,raioCurva?,fechado?,cima?,segmentos?," +
  "recentrar?} (seção varrendo um caminho: fio/cabo com suavizar:true, cano dobrado com raioCurva, " +
  "metalon/cantoneira/quadro soldado com canto vivo em meia-esquadria (padrão); secao = " +
  "{tipo:'circulo',raio,espessura?} | {tipo:'retangulo',largura,altura,espessura?} | " +
  "{tipo:'poligono',pontos:[[s,t],...]}, s à direita do caminho e t para cima; espessura = oco; " +
  "recentrar:false mantém o caminho nas coordenadas do pai) · model{src,tamanho:[x,y,z]} (bbox declarada, sem carregar arquivo) · " +
  "grupo/row/column/stack{} (containers de layout, sem params) · junta{eixo:'x'|'y'|'z',angulo,limites?:[min,max]} " +
  "(container articulado: os filhos giram 'angulo' rad em torno do eixo, na origem da junta — dobradiça, cotovelo; " +
  "anime 'angulo' em criar_animacao)",
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

  // ── Aparência: adesivos ─────────────────────────────────────────────

  server.registerTool("colar_adesivo", {
    title: "Colar adesivo",
    description: (
      "Cola uma imagem numa região da superfície de um nó (rótulo de lata, tela de monitor, logo numa caneca). " +
      "Aparência pura: não muda bbox nem layout. Face plana (topo/base/norte/sul/leste/oeste): u/v = centro no " +
      "plano da face (convenção de furar), largura/altura em metros; padrão = face inteira; a imagem sai legível " +
      "vista de fora (topo da imagem para +y, ou para o norte em topo/base). face 'lateral' (cylinder, cone, " +
      "lathe): u = ÂNGULO do centro em rad (0 = +z, crescendo para +x), v = ALTURA do centro, largura = arco em " +
      "metros, altura em metros; padrão = volta inteira. Faces que o tipo não tem viram erro explicado."
    ),
    inputSchema: {
      id: z.string(), src: z.string(), face: z.union([faceShape, z.literal("lateral")]),
      u: z.number().optional(), v: z.number().optional(),
      largura: z.number().positive().optional(), altura: z.number().positive().optional(),
      rotacao: z.number().optional().describe("Só face plana: giro da imagem, em radianos."),
    },
  }, ({ id, ...adesivo }) => executar(
    () => { cenaAtual().ref(id).colarAdesivo(adesivo as never); return id; },
    (id) => `adesivo colado em '${id}'`,
  ));

  server.registerTool("limpar_adesivos", {
    title: "Limpar adesivos",
    description: "Remove todos os adesivos de um nó.",
    inputSchema: { id: z.string() },
  }, ({ id }) => executar(
    () => { cenaAtual().ref(id).limparAdesivos(); return id; },
    (id) => `adesivos de '${id}' removidos`,
  ));

  // ── Animações ───────────────────────────────────────────────────────

  server.registerTool("criar_animacao", {
    title: "Criar animação",
    description: (
      "Cria uma animação por quadros-chave (substitui a de mesmo nome se 'substituir'). Cada faixa anima uma " +
      "propriedade de um nó: posicao/rotacao/escala ([x,y,z], espaço do pai, rotação em rad), angulo (número, rad — " +
      "só em nó 'junta': o jeito certo de abrir porta/girar braço, e o único que gira mais de meia volta), " +
      "opacidade (0..1), cor ('#rrggbb'). quadros = [[t_segundos, valor], ...] em ordem crescente de t. " +
      "interpolacao: linear | suave (acelera/desacelera) | degrau. relativo:true = valores somados à pose atual " +
      "do nó (ex.: gaveta abre [0,0,0.3]). Rotação interpola pelo menor arco. Depois de criar, use " +
      "conferir_animacao para achar colisões durante o movimento."
    ),
    inputSchema: {
      nome: z.string(),
      duracao: z.number().positive().optional().describe("Segundos. Padrão: o último quadro."),
      repetir: z.enum(["nao", "sempre", "vaivem"]).optional().describe("Padrão 'nao'."),
      substituir: z.boolean().optional(),
      faixas: z.array(z.object({
        no: z.string(),
        propriedade: z.enum(["posicao", "rotacao", "escala", "angulo", "opacidade", "cor"]),
        quadros: z.array(z.tuple([z.number(), valorAnimado])).min(1),
        interpolacao: z.enum(["linear", "suave", "degrau"]).optional(),
        relativo: z.boolean().optional(),
      })).min(1),
    },
  }, ({ nome, duracao, repetir, substituir, faixas }) => executar(() => {
    const cena = cenaAtual();
    const anterior = cena.animacoes().find((a) => a.nome === nome);
    if (anterior && !substituir) throw new Error(`já existe uma animação '${nome}' (use substituir: true)`);
    // tudo ou nada: uma faixa inválida não deixa a animação pela metade
    const rascunho = Cena.deJSON(cena.toJSON());
    if (anterior) rascunho.removerAnimacao(nome);
    const ref = rascunho.animar(nome, { ...(duracao ? { duracao } : {}), ...(repetir ? { repetir } : {}) });
    for (const f of faixas) {
      ref.faixa(f.no, f.propriedade, f.quadros as never, {
        ...(f.interpolacao ? { interpolacao: f.interpolacao } : {}), ...(f.relativo ? { relativo: true } : {}),
      });
    }
    if (anterior) cena.removerAnimacao(nome);
    const nova = rascunho.animacao(nome);
    const r = cena.animar(nome, {
      ...(nova.duracao !== undefined ? { duracao: nova.duracao } : {}), ...(nova.repetir ? { repetir: nova.repetir } : {}),
    });
    for (const f of nova.faixas) cena.definirFaixa(r.nome, f);
    return cena.conferirAnimacaoTexto(nome);
  }, (conferencia) => `animação '${nome}' criada` +
    (conferencia ? `\nDURANTE O MOVIMENTO:\n${conferencia}` : "\nnenhum problema novo durante o movimento")));

  server.registerTool("conferir_animacao", {
    title: "Conferir animação",
    description: "Roda o linter ao longo de um ciclo da animação e lista os instantes com problemas NOVOS (que a cena parada não tem): peça atravessando outra, junta fora do limite.",
    inputSchema: { nome: z.string(), amostras: z.number().int().min(1).optional().describe("Padrão 30.") },
  }, ({ nome, amostras }) => executar(
    () => cenaAtual().conferirAnimacaoTexto(nome, amostras ? { amostras } : {}),
    (t) => t || "nenhum problema novo durante o movimento",
  ));

  server.registerTool("remover_animacao", {
    title: "Remover animação",
    description: "Remove uma animação pelo nome.",
    inputSchema: { nome: z.string() },
  }, ({ nome }) => executar(() => { cenaAtual().removerAnimacao(nome); return nome; }, (n) => `animação '${n}' removida`));

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
    const { objeto, avisos, animacoes } = await construirCena(cenaAtual(), { carregarModelo: async () => null });
    await mkdir(dirname(caminho), { recursive: true });
    if (formato === "glb") {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        new GLTFExporter().parse(objeto, (r) => resolve(r as ArrayBuffer), reject, {
          binary: true, animations: animacoes.map((a) => a.clip),
        });
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
      animacao: z.string().optional().describe("Renderiza a pose desta animação no instante 't' (em vez da pose parada)."),
      t: z.number().optional().describe("Segundos, com 'animacao'. Padrão 0."),
    },
  }, async ({ vista, alvo, distancia, largura, altura, caminho, animacao, t }) => {
    try {
      const cena = animacao ? cenaAtual().poseEm(animacao, t ?? 0) : cenaAtual();
      const construido = await construirCena(cena, { carregarModelo: async () => null });
      const { objeto } = construido;
      // este rasterizador não desenha imagem nenhuma: textura e adesivo não
      // são problema da cena, só limite do PNG — um aviso só, não um por nó
      const semImagem = construido.avisos.some((a) => a.motivo === "textura-ausente");
      const avisos = [
        ...construido.avisos.filter((a) => a.motivo !== "textura-ausente"),
        ...(semImagem ? [{ texto: "texturas e adesivos não aparecem neste PNG (o rasterizador não desenha imagens)" }] : []),
      ];
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
