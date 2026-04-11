import { calcularMetricas, calcularPrecoVendaNecessario, normalizeInput } from "./calculator.js";

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

function montarMesesAnalise(configuracao) {
  const meses = new Set([1, 3, 6, 12, configuracao.meses_venda]);
  if (configuracao.tempo_alvo_venda > 0) {
    meses.add(configuracao.tempo_alvo_venda);
  }

  return Array.from(meses)
    .filter((valor) => Number.isFinite(valor) && valor >= 1)
    .sort((a, b) => a - b);
}

function escolherMelhorMomento(vendasPorMes) {
  if (!vendasPorMes.length) return null;
  return vendasPorMes.reduce((melhorAtual, item) => {
    if (!melhorAtual) return item;
    return item.roiMensal > melhorAtual.roiMensal ? item : melhorAtual;
  }, null);
}

function classificarEficiencia(roiMensal, roiMinimo) {
  if (roiMensal >= roiMinimo) return "IDEAL";
  if (roiMensal >= (roiMinimo * 0.7)) return "ACEITAVEL";
  return "RUIM";
}

function mapearCenarioMensal(item, roiMinimo) {
  const roiMensal = Number(item.roi_mensal ?? item.taxa_mensal ?? 0);
  const status = classificarEficiencia(roiMensal, roiMinimo);

  return {
    meses: item.meses_venda,
    meses_venda: item.meses_venda,
    lucroLiquido: item.lucro_liquido,
    lucro_liquido: item.lucro_liquido,
    roiMensal,
    roi_mensal: roiMensal,
    custoTotal: item.custo_total,
    custo_total: item.custo_total,
    status,
    classificacao: status
  };
}

function definirRecomendacao(cenarioAtual, roiMinimo) {
  if (!cenarioAtual) {
    return "VENDER AGORA";
  }

  if (cenarioAtual.roiMensal < roiMinimo) {
    return "VENDER AGORA";
  }

  return "PODE AGUARDAR";
}

function construirDecisaoVenda(rawData, melhorLance) {
  const input = normalizeInput(rawData);
  const lanceBase = melhorLance?.lance || input.compra.lance_inicial;
  const mesesAnalise = montarMesesAnalise(input.configuracao);
  const roiMinimoMensal = Number(input.configuracao.roi_minimo_desejado || 0);

  const cenarios = mesesAnalise
    .map((meses) => calcularMetricas(input, lanceBase, meses))
    .map((item) => mapearCenarioMensal(item, roiMinimoMensal));

  const melhorMomento = escolherMelhorMomento(cenarios);
  const mesConfigurado = cenarios.find((item) => item.meses === input.configuracao.meses_venda) || null;
  const recomendacao = definirRecomendacao(mesConfigurado, roiMinimoMensal);
  const gatilhoAutomaticoSaida = Boolean(
    mesConfigurado &&
    mesConfigurado.roiMensal < roiMinimoMensal
  );

  const tempoAlvo = input.configuracao.tempo_alvo_venda > 0
    ? input.configuracao.tempo_alvo_venda
    : input.configuracao.meses_venda;
  const roiAlvo = roiMinimoMensal > 0 ? roiMinimoMensal : Number(melhorMomento?.roiMensal || 0);
  const reversa = calcularPrecoVendaNecessario(
    input,
    lanceBase,
    tempoAlvo,
    roiAlvo
  );

  return {
    roiMinimoDesejado: roiMinimoMensal,
    roi_minimo_desejado: roiMinimoMensal,
    cenarios,
    melhorMomentoVenda: melhorMomento?.meses ?? null,
    roiMensalMaximo: Number(melhorMomento?.roiMensal || 0),
    melhor_cenario: melhorMomento,
    recomendacao,
    gatilhoAutomaticoSaida,
    alerta: gatilhoAutomaticoSaida
      ? "Segurar esta reduzindo sua rentabilidade."
      : "",
    simulacaoReversa: reversa
      ? {
          ...reversa,
          precoVendaMinimo: reversa.preco_venda_necessario
        }
      : null,
    tabela_eficiencia: cenarios,
    melhor_momento: melhorMomento,
    simulacao_reversa: reversa
  };
}

export function analisarSimulacao(simulacoes, lucroMinimo, rawData) {
  if (!Array.isArray(simulacoes) || simulacoes.length === 0) {
    return {
      melhor: null,
      break_even: null,
      limite_lance: null,
      decisao_venda: null,
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

  const decisaoVenda = rawData ? construirDecisaoVenda(rawData, melhor) : null;

  return {
    resultados: comRisco,
    melhor,
    break_even: encontrarBreakEven(comRisco),
    limite_lance: encontrarLimiteLance(comRisco, lucroMinimo),
    decisao_venda: decisaoVenda,
    melhorMomentoVenda: decisaoVenda?.melhorMomentoVenda ?? null,
    roiMensalMaximo: decisaoVenda?.roiMensalMaximo ?? 0,
    recomendacao: decisaoVenda?.recomendacao ?? "VENDER AGORA",
    possui_resultado: true
  };
}
