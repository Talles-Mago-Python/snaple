// ─────────────────────────────────────────────────────────────────────────
//  É ESTE o arquivo para editar. Só a montagem da cena mora aqui; nada de
//  câmera, luz, renderer ou controles. Salve e o viewer recarrega sozinho.
// ─────────────────────────────────────────────────────────────────────────
import { Cena, circular } from "@snaple/core";

export function montarCena(): Cena {
  const cena = new Cena();

  // A única coordenada absoluta da cena inteira é a altura do tampo.
  const tampo = cena.criar(
    "box",
    { largura: 1.8, altura: 0.06, profundidade: 1.0 },
    { nome: "mesa", transform: { posicao: [0, 0.72, 0] }, material: { cor: "#9c6b45" } },
  );

  // Quatro pernas na face de baixo, numa grade 2×2 recuada 12 cm da borda.
  // A base de cada uma encosta no tampo e elas nascem apontando para fora
  // da face — ou seja, para baixo, até o chão.
  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar(
      "cylinder",
      { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 },
      { nome: "perna", material: { cor: "#7a5233" } },
    ),
  );
  tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

  // Quatro cadeiras em círculo em volta.
  const cadeiras = [0, 1, 2, 3].map(() =>
    cena.criar(
      "box",
      { largura: 0.45, altura: 0.95, profundidade: 0.45 },
      { nome: "cadeira", transform: { posicao: [0, 0.475, 0] }, material: { cor: "#4a6b7c" } },
    ),
  );
  circular(cadeiras, 1.2, { centro: [0, 0, 0] });

  // Uma xícara no tampo, 45 cm à esquerda do centro.
  const xicara = cena.criar(
    "cylinder",
    { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 },
    { nome: "xícara", material: { cor: "#f2f2f2", rugosidade: 0.4 } },
  );
  tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

  return cena;
}
