export function classificarRisco(rentabilidade) {
  if (rentabilidade < 0) return "prejuizo";
  if (rentabilidade < 1) return "inviavel";
  if (rentabilidade < 4) return "ruim";
  if (rentabilidade < 8) return "risco";
  if (rentabilidade < 12) return "bom";
  return "seguro";
}

export function encontrarBreakEven(simulacoes) {
  return simulacoes.find((item) => item.lucro_liquido <= 0) ?? null;
}

export function encontrarLimiteLance(simulacoes, lucroMinimo) {
  const viaveis = simulacoes.filter((item) => item.rentabilidade >= lucroMinimo);
  return viaveis.length > 0 ? viaveis[viaveis.length - 1] : null;
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

  const comRisco = simulacoes.map((item) => ({
    ...item,
    risco: classificarRisco(item.rentabilidade)
  }));

  return {
    resultados: comRisco,
    melhor: comRisco.reduce((acc, current) => {
      if (!acc) return current;
      return current.rentabilidade > acc.rentabilidade ? current : acc;
    }, null),
    break_even: encontrarBreakEven(comRisco),
    limite_lance: encontrarLimiteLance(comRisco, lucroMinimo),
    possui_resultado: true
  };
}
