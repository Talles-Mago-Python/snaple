/** `IfcGloballyUniqueId`: 22 caracteres, compressão base64 (alfabeto próprio
 * do IFC) de um UUID de 128 bits. Mesmo algoritmo usado por ferramentas IFC
 * estabelecidas (ex.: `ifcopenshell.guid.compress`) — reproduzido aqui para
 * não puxar dependência só por uma função de ~15 linhas.
 *
 * Requisito do enunciado: exportar a MESMA cena duas vezes tem que gerar os
 * MESMOS GUIDs (para reimportação em BIM reconhecer os elementos em vez de
 * duplicá-los). Em vez de UUID aleatório, cada GUID aqui é determinístico:
 * hash SHA-256 de uma CHAVE ESTÁVEL (id do nó na cena, ou uma string fixa
 * para as entidades espaciais singleton), truncado a 128 bits. Rodar duas
 * vezes sobre a mesma cena passa as mesmas chaves e produz os mesmos bytes,
 * logo os mesmos GUIDs — sem guardar nenhum estado entre exportações.
 *
 * SHA-256 é `sha256.ts` deste pacote, não `node:crypto` — este backend
 * precisa rodar em Node E no navegador (o viewer web importa
 * `@snaple/ifc` direto do código-fonte via Vite), e `node:crypto` não
 * existe num bundle de navegador. */
import { sha256Hex } from "./sha256.ts";

const ALFABETO_IFC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function base64Ifc(v: number, comprimento: number): string {
  let r = "";
  for (let i = 0; i < comprimento; i++) {
    r = ALFABETO_IFC[v % 64] + r;
    v = Math.floor(v / 64);
  }
  return r;
}

/** Comprime 16 bytes (32 dígitos hex, sem hífen) nos 22 caracteres do
 * `IfcGloballyUniqueId`: o primeiro byte em 2 caracteres, os 15 restantes em
 * 5 grupos de 3 bytes (24 bits exatos) → 4 caracteres cada. */
export function comprimirGuid(hex32: string): string {
  if (hex32.length !== 32) throw new Error(`GUID de origem precisa de 32 hex chars, recebeu ${hex32.length}`);
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hex32.slice(i, i + 2), 16));
  let out = base64Ifc(bytes[0]!, 2);
  for (let i = 1; i < 16; i += 3) {
    const v = (bytes[i]! << 16) + (bytes[i + 1]! << 8) + bytes[i + 2]!;
    out += base64Ifc(v, 4);
  }
  return out;
}

/** GUID IFC estável a partir de uma chave qualquer — ver nota de topo do
 * arquivo. Não é um UUID aleatório de propósito. */
export function guidEstavel(chave: string): string {
  return comprimirGuid(sha256Hex(chave).slice(0, 32));
}
