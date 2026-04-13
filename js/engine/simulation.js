import { calcularLance, calcularMetricas, normalizeInput } from "./calculator.js";

export function simularLances(rawData) {
  const input = normalizeInput(rawData);
  const total = input.compra.quantidade;
  const resultados = new Array(total);

  for (let indice = 0; indice < total; indice += 1) {
    const lance = calcularLance(input.compra, indice);
    resultados[indice] = calcularMetricas(input, lance);
  }

  return resultados;
}
