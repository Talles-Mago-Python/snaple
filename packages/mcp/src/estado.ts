/** Estado do servidor MCP: uma única `Cena` em memória, viva enquanto o
 * processo do servidor durar (um processo por sessão do cliente MCP, no
 * caso comum de transporte stdio). Não há "múltiplas cenas nomeadas" de
 * propósito -- um agente conversando com este servidor está sempre
 * trabalhando numa cena de cada vez, e trocar de cena é só
 * `carregar_cena_json` ou `limpar_cena`.
 *
 * Persistência entre sessões (o processo reinicia a cada sessão do
 * cliente) é responsabilidade do CHAMADOR: `salvar_cena_json`/
 * `carregar_cena_json` escrevem/leem o `toJSON()` normativo do snaple num
 * arquivo, então retomar um trabalho é só apontar pro mesmo arquivo. */
import { Cena } from "@snaple/core";

let cena = new Cena();

export function cenaAtual(): Cena {
  return cena;
}

export function reiniciarCena(nova?: Cena): void {
  cena = nova ?? new Cena();
}
