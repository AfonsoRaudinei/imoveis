export function classificarRisco(rentabilidade) {
  if (rentabilidade < 0) return "prejuizo";
  if (rentabilidade < 1) return "inviavel";
  if (rentabilidade < 4) return "ruim";
  if (rentabilidade < 8) return "risco";
  if (rentabilidade < 12) return "bom";
  return "seguro";
}

export function encontrarBreakEven(simulacoes) {
  for (let index = 0; index < simulacoes.length; index += 1) {
    const item = simulacoes[index];
    if (item.lucro_liquido <= 0) {
      return item;
    }
  }
  return null;
}

export function encontrarLimiteLance(simulacoes, lucroMinimo) {
  let limite = null;
  for (let index = 0; index < simulacoes.length; index += 1) {
    const item = simulacoes[index];
    if (item.rentabilidade >= lucroMinimo) {
      limite = item;
    }
  }
  return limite;
}

export function analisarSimulacao(simulacoes, lucroMinimo) {
  if (!Array.isArray(simulacoes) || simulacoes.length === 0) {
    return {
      melhor: null,
      break_even: null,
      limite_lance: null,
      possui_resultado: false
    };
  }

  const comRisco = new Array(simulacoes.length);
  let melhor = null;

  for (let index = 0; index < simulacoes.length; index += 1) {
    const current = simulacoes[index];
    const enriched = {
      ...current,
      risco: classificarRisco(current.rentabilidade)
    };

    comRisco[index] = enriched;
    if (!melhor || enriched.rentabilidade > melhor.rentabilidade) {
      melhor = enriched;
    }
  }

  return {
    resultados: comRisco,
    melhor,
    break_even: encontrarBreakEven(comRisco),
    limite_lance: encontrarLimiteLance(comRisco, lucroMinimo),
    possui_resultado: true
  };
}
