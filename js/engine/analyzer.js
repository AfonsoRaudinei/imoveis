import { calcularLance, calcularMetricas, calcularPrecoVendaNecessario, normalizeInput } from "./calculator.js";

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

function gerarMesesPorIntervalo(horizonte, intervalo) {
  const maxMeses = Math.max(1, Math.floor(Number(horizonte) || 1));
  const passo = Math.max(1, Math.floor(Number(intervalo) || 1));
  const meses = [];

  if (passo <= 1) {
    for (let mes = 1; mes <= maxMeses; mes += 1) {
      meses.push(mes);
    }
    return meses;
  }

  for (let mes = passo; mes <= maxMeses; mes += passo) {
    meses.push(mes);
  }

  if (!meses.includes(maxMeses)) {
    meses.push(maxMeses);
  }

  return meses;
}

function parseMesesSelecionados(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Math.floor(Number(item)))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => Math.floor(Number(item.trim())))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  return [];
}

function montarMesesFiltroAtivo(configuracao, fallbackMeses) {
  const mesesBase = Array.isArray(fallbackMeses) && fallbackMeses.length ? fallbackMeses : [1];
  const horizonte = Math.max(
    ...mesesBase,
    Math.floor(Number(configuracao?.horizonte_meses || 0) || 0),
    Math.floor(Number(configuracao?.meses_venda || 0) || 0),
    Math.floor(Number(configuracao?.tempo_alvo_venda || 0) || 0),
    1
  );

  const intervaloExibicao = Math.floor(Number(configuracao?.intervalo_exibicao || 0) || 0);
  const mesesSelecionados = parseMesesSelecionados(
    configuracao?.meses_exibicao ??
    configuracao?.meses_filtro ??
    configuracao?.meses_ativos
  );
  const filtroAtivo = Boolean(configuracao?.filtro_temporal_ativo) || mesesSelecionados.length > 0 || intervaloExibicao > 0;

  if (filtroAtivo && mesesSelecionados.length > 0) {
    const meses = Array.from(new Set(mesesSelecionados.filter((mes) => mes <= horizonte)))
      .sort((a, b) => a - b);
    if (!meses.includes(horizonte)) {
      meses.push(horizonte);
    }
    return meses;
  }

  if (filtroAtivo && intervaloExibicao >= 1) {
    return gerarMesesPorIntervalo(horizonte, intervaloExibicao);
  }

  return mesesBase;
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
  const rentabilidade = Number(item.rentabilidade ?? 0);

  return {
    meses: item.meses_venda,
    meses_venda: item.meses_venda,
    lucroLiquido: item.lucro_liquido,
    lucro_liquido: item.lucro_liquido,
    rentabilidade,
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

function calcularLimitePorMes(input, meses, rentabilidadeMinima) {
  const quantidade = Math.max(1, Math.floor(Number(input.compra?.quantidade || 1)));
  const incremento = Number(input.compra?.incremento || 0);
  let limite = null;
  let primeiroForaMeta = null;

  for (let indice = 0; indice < quantidade; indice += 1) {
    const lance = calcularLance(input.compra, indice);
    const metricas = calcularMetricas(input, lance, meses);
    const atendeMeta = metricas.rentabilidade >= rentabilidadeMinima;

    if (atendeMeta) {
      limite = {
        lance,
        rentabilidade: metricas.rentabilidade
      };
      continue;
    }

    if (limite && !primeiroForaMeta) {
      primeiroForaMeta = {
        lance,
        rentabilidade: metricas.rentabilidade
      };
    }
  }

  if (!limite) {
    return {
      meses,
      limite_lance: null,
      rentabilidade_limite: null,
      nenhum_lance_valido: true,
      primeiro_lance_fora_meta: null,
      zona: null
    };
  }

  const riscoPasso = incremento > 0 ? incremento * 2 : 0;
  const riscoAte = limite.lance + riscoPasso;

  return {
    meses,
    limite_lance: limite.lance,
    rentabilidade_limite: limite.rentabilidade,
    nenhum_lance_valido: false,
    primeiro_lance_fora_meta: primeiroForaMeta?.lance ?? null,
    zona: {
      seguro_ate: limite.lance,
      risco_de: limite.lance,
      risco_ate: riscoAte,
      perigo_acima_de: riscoAte
    }
  };
}

function construirDecisaoVenda(rawData, melhorLance) {
  const input = normalizeInput(rawData);
  const lanceBase = melhorLance?.lance || input.compra.lance_inicial;
  const mesesAnalise = montarMesesAnalise(input.configuracao);
  const mesesLimite = montarMesesFiltroAtivo(input.configuracao, mesesAnalise);
  const roiMinimoMensal = Number(input.configuracao.roi_minimo_desejado || 0);
  const rentabilidadeMinima = Number(input.configuracao.lucro_minimo || 0);

  const cenarios = mesesAnalise
    .map((meses) => calcularMetricas(input, lanceBase, meses))
    .map((item) => mapearCenarioMensal(item, roiMinimoMensal));
  const limitesPorCenario = mesesLimite
    .map((meses) => calcularLimitePorMes(input, meses, rentabilidadeMinima))
    .sort((a, b) => a.meses - b.meses);
  const cenarioConservador = limitesPorCenario[limitesPorCenario.length - 1] || null;
  const nenhumLanceValidoGlobal = limitesPorCenario.every((item) => item.nenhum_lance_valido);
  const filtroTemporalAplicado = mesesLimite.length !== mesesAnalise.length
    || mesesLimite.some((mes, index) => mes !== mesesAnalise[index]);

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
    simulacao_reversa: reversa,
    custosMensaisBase: {
      condominio: Number(input.custos?.condominio || 0),
      iptu: Number(input.custos?.iptu || 0)
    },
    limiteAutomatico: {
      rentabilidadeMinima,
      nenhumLanceValidoGlobal,
      filtroTemporalAplicado,
      mesesFiltroAtivo: mesesLimite,
      limiteRecomendado: cenarioConservador?.limite_lance ?? null,
      cenarioConservadorMeses: cenarioConservador?.meses ?? null,
      limitesPorCenario,
      zonaRisco: cenarioConservador?.zona || null
    }
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
    limite_automatico: decisaoVenda?.limiteAutomatico ?? null,
    melhorMomentoVenda: decisaoVenda?.melhorMomentoVenda ?? null,
    roiMensalMaximo: decisaoVenda?.roiMensalMaximo ?? 0,
    recomendacao: decisaoVenda?.recomendacao ?? "VENDER AGORA",
    lucro_minimo_meta: Number(lucroMinimo || 0),
    possui_resultado: true
  };
}
