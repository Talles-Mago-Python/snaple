/** Liga os modelos de `modelos/*.ts` ao viewer e ao painel de texto.
 *
 * Não edite este arquivo para adicionar um modelo novo: crie um arquivo em
 * `modelos/` exportando `montarCena(): Cena` e salve — o seletor aparece
 * sozinho (ver docs/guia-de-modelagem.md). */
import { ID_RAIZ, type Cena } from "@snaple/core";
import { criarViewer, type FormatoExportacao } from "./viewer.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#palco")!;
const painel = document.querySelector<HTMLPreElement>("#painel")!;
const seletor = document.querySelector<HTMLSelectElement>("#modelo")!;
const barraAnimacao = document.querySelector<HTMLDivElement>("#animacao")!;
const seletorAnimacao = document.querySelector<HTMLSelectElement>("#animacoes")!;
const botaoPausa = document.querySelector<HTMLButtonElement>("#pausa")!;
const viewer = criarViewer(canvas);

for (const botao of document.querySelectorAll<HTMLButtonElement>("#exportar button")) {
  const formato = botao.dataset.formato as FormatoExportacao;
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    try {
      await viewer.exportar(formato);
    } catch (e) {
      painel.classList.add("com-aviso");
      painel.textContent = `ERRO ao exportar .${formato}:\n${(e as Error).message}`;
      console.error(e);
    } finally {
      botao.disabled = false;
    }
  });
}

interface ModuloModelo {
  montarCena(): Cena;
}

const CHAVE_LOCALSTORAGE = "snaple:modelo";
const PARAM_URL = "cena";

// `eager: true` importa todo mundo de uma vez — são poucos arquivos, e
// eager é o que permite listar as opções do <select> de forma síncrona,
// sem um estado "carregando" no primeiro frame. Os caminhos que aparecem
// aqui (as chaves do objeto) são exatamente os specifiers que o Vite usa
// como dependência estática desta função, por isso servem de `deps` para
// `import.meta.hot.accept` mais abaixo — sem precisar listar nome nenhum
// à mão.
const modelosGlob = import.meta.glob<ModuloModelo>("./modelos/*.ts", { eager: true });
const caminhosGlob = Object.keys(modelosGlob);

function nomeDoCaminho(caminho: string): string {
  return caminho.replace(/^\.\/modelos\//, "").replace(/\.ts$/, "");
}

const modelos = new Map<string, ModuloModelo>();
function reconstruirRegistro(): void {
  modelos.clear();
  for (const [caminho, modulo] of Object.entries(modelosGlob)) {
    modelos.set(nomeDoCaminho(caminho), modulo);
  }
}
reconstruirRegistro();

function popularSeletor(): void {
  const nomes = [...modelos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  seletor.innerHTML = "";
  for (const nome of nomes) {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    seletor.append(opcao);
  }
}
popularSeletor();

function nomeInicial(): string {
  const daUrl = new URLSearchParams(location.search).get(PARAM_URL);
  if (daUrl && modelos.has(daUrl)) return daUrl;
  const doStorage = localStorage.getItem(CHAVE_LOCALSTORAGE);
  if (doStorage && modelos.has(doStorage)) return doStorage;
  return [...modelos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"))[0] ?? "";
}

let nomeAtual = nomeInicial();
seletor.value = nomeAtual;

function persistirSelecao(nome: string): void {
  localStorage.setItem(CHAVE_LOCALSTORAGE, nome);
  const url = new URL(location.href);
  url.searchParams.set(PARAM_URL, nome);
  history.replaceState(null, "", url);
}

async function recarregar(): Promise<void> {
  const modulo = modelos.get(nomeAtual);
  if (!modulo) {
    painel.classList.add("com-aviso");
    painel.textContent =
      modelos.size === 0
        ? "ERRO: nenhum modelo encontrado em examples/web/modelos/."
        : `ERRO: modelo '${nomeAtual}' não existe. Disponíveis: ${[...modelos.keys()].join(", ")}`;
    return;
  }
  try {
    const cena = modulo.montarCena();
    const avisosBackend = await viewer.mostrar(cena);
    popularAnimacoes();

    const blocos = [cena.descrever()];
    blocos.push(cena.avisosTexto() || "AVISOS: nenhum.");
    if (avisosBackend.length > 0) {
      blocos.push(avisosBackend.map((a) => `BACKEND: ${a.texto}`).join("\n"));
    }
    const tamanho = cena.bbox(ID_RAIZ).tamanho.map((v) => v.toFixed(2)).join(" × ");
    blocos.push(`${cena.nosGeometricos().length} nó(s) geométrico(s) · bbox total ${tamanho} m`);

    painel.textContent = blocos.join("\n\n");
    painel.classList.toggle("com-aviso", cena.avisos().length > 0);
  } catch (e) {
    painel.classList.add("com-aviso");
    painel.textContent = `ERRO ao montar '${nomeAtual}':\n${(e as Error).message}`;
    console.error(e);
  }
}

/** Lista as animações da cena exibida e já toca a primeira. */
function popularAnimacoes(): void {
  const nomes = viewer.animacoes();
  barraAnimacao.hidden = nomes.length === 0;
  seletorAnimacao.innerHTML = "";
  for (const nome of ["", ...nomes]) {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome || "— parada —";
    seletorAnimacao.append(opcao);
  }
  seletorAnimacao.value = nomes[0] ?? "";
  tocarSelecionada();
}

function tocarSelecionada(): void {
  viewer.tocar(seletorAnimacao.value || null);
  botaoPausa.textContent = "⏸";
  botaoPausa.setAttribute("aria-label", "Pausar");
}

seletorAnimacao.addEventListener("change", tocarSelecionada);
botaoPausa.addEventListener("click", () => {
  const tocando = viewer.alternarPausa();
  botaoPausa.textContent = tocando ? "⏸" : "▶";
  botaoPausa.setAttribute("aria-label", tocando ? "Pausar" : "Continuar");
});

seletor.addEventListener("change", () => {
  nomeAtual = seletor.value;
  persistirSelecao(nomeAtual);
  void recarregar();
});

persistirSelecao(nomeAtual);
await recarregar();

// Editar um arquivo já existente em `modelos/` remonta sem recarregar a
// página — se for o modelo selecionado no momento, a troca aparece na
// hora; se não for, só atualiza o registro por baixo, silenciosamente.
// Criar ou apagar um arquivo muda o CONJUNTO observado pelo glob, e o Vite
// força um reload completo sozinho nesse caso — não tem o que fazer aqui.
if (import.meta.hot) {
  import.meta.hot.accept(caminhosGlob, (atualizados) => {
    atualizados.forEach((modulo, i) => {
      if (!modulo) return;
      modelosGlob[caminhosGlob[i]!] = modulo as unknown as ModuloModelo;
    });
    reconstruirRegistro();
    popularSeletor();
    if (!modelos.has(nomeAtual)) nomeAtual = [...modelos.keys()][0] ?? "";
    seletor.value = nomeAtual;
    void recarregar();
  });
}
