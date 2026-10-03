import { Cena } from "@snaple/core";

type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number; facetado?: boolean };

export function montarCena(): Cena {
  const cena = new Cena();

  // Paleta de cores em estilo low poly (tons chapados, sem brilho especular)
  const M = {
    pele: { cor: "#f2a184", rugosidade: 1, metalico: 0, facetado: true } satisfies Material,
    cabelo: { cor: "#3b2219", rugosidade: 1, metalico: 0, facetado: true } satisfies Material,
    camisa: { cor: "#2a75bc", rugosidade: 1, metalico: 0, facetado: true } satisfies Material,
    calca: { cor: "#2c3e50", rugosidade: 1, metalico: 0, facetado: true } satisfies Material,
    tenis: { cor: "#ecf0f1", rugosidade: 1, metalico: 0, facetado: true } satisfies Material,
  };

  // 1. O CORPO RAIZ (Posicionado no chão, y = 0)
  const pessoa = cena.criar("grupo", {}, { nome: "pessoa", transform: { posicao: [0, 0, 0] } });

  // 2. PERNAS (Cilindros estilizados com poucos segmentos para o aspecto low poly)
  const pernaEsq = pessoa.criar(
    "cylinder",
    { raioTopo: 0.08, raioBase: 0.06, altura: 0.45, segmentos: 6 },
    { nome: "perna_esquerda", transform: { posicao: [-0.11, 0.225, 0] }, material: M.calca }
  );
  const pernaDir = pessoa.criar(
    "cylinder",
    { raioTopo: 0.08, raioBase: 0.06, altura: 0.45, segmentos: 6 },
    { nome: "perna_direita", transform: { posicao: [0.11, 0.225, 0] }, material: M.calca }
  );

  // 3. TÊNIS (Blocos simples nos pés)
  const tenisEsq = pessoa.criar(
    "box",
    { largura: 0.12, altura: 0.08, profundidade: 0.2 },
    { nome: "tenis_esquerdo", transform: { posicao: [-0.11, 0.04, 0.02] }, material: M.tenis }
  );
  const tenisDir = pessoa.criar(
    "box",
    { largura: 0.12, altura: 0.08, profundidade: 0.2 },
    { nome: "tenis_direito", transform: { posicao: [0.11, 0.04, 0.02] }, material: M.tenis }
  );
  tenisEsq.permitirContato(pernaEsq);
  tenisDir.permitirContato(pernaDir);

  // 4. TRONCO / CAMISA (Caixa geométrica robusta)
  const tronco = pessoa.criar(
    "box",
    { largura: 0.38, altura: 0.5, profundidade: 0.22 },
    { nome: "tronco", transform: { posicao: [0, 0.70, 0] }, material: M.camisa }
  );
  tronco.permitirContato(pernaEsq);
  tronco.permitirContato(pernaDir);

  // 5. BRAÇOS (Cilindros de 6 lados nas laterais)
  pessoa.criar(
    "cylinder",
    { raioTopo: 0.05, raioBase: 0.04, altura: 0.42, segmentos: 6 },
    { nome: "braco_esquerdo", transform: { posicao: [-0.24, 0.68, 0], rotacao: [0, 0, -0.1] }, material: M.camisa }
  );
  pessoa.criar(
    "cylinder",
    { raioTopo: 0.05, raioBase: 0.04, altura: 0.42, segmentos: 6 },
    { nome: "braco_direito", transform: { posicao: [0.24, 0.68, 0], rotacao: [0, 0, 0.1] }, material: M.camisa }
  );

  // 6. PESCOÇO E CABEÇA
  const pescoco = pessoa.criar(
    "cylinder",
    { raioTopo: 0.04, raioBase: 0.045, altura: 0.08, segmentos: 6 },
    { nome: "pescoco", transform: { posicao: [0, 0.99, 0] }, material: M.pele }
  );

  const cabeca = pessoa.criar(
    "sphere",
    { raio: 0.14, segmentos: 5 },
    { nome: "cabeca", transform: { posicao: [0, 1.15, 0] }, material: M.pele }
  );
  cabeca.permitirContato(pescoco);

  // Cabelo low poly (uma caixa cobrindo a parte superior)
  const cabelo = pessoa.criar(
    "box",
    { largura: 0.29, altura: 0.15, profundidade: 0.29 },
    { nome: "cabelo", transform: { posicao: [0, 1.22, -0.01] }, material: M.cabelo }
  );
  cabelo.permitirContato(cabeca);

  return cena;
}
