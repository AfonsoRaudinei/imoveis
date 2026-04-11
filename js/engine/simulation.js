import { calcularLance, calcularMetricas, normalizeInput } from "./calculator.js";

export function simularLances(rawData) {
  const input = normalizeInput(rawData);
  const resultados = [];

  for (let indice = 0; indice < input.compra.quantidade; indice += 1) {
    const lance = calcularLance(input.compra, indice);
    resultados.push(calcularMetricas(input, lance));
  }

  return resultados;
}
