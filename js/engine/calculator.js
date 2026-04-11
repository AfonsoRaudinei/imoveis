function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const raw = String(value).trim();
  const hasComma = raw.includes(",");
  const normalized = hasComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeInput(data) {
  return {
    compra: {
      lance_inicial: parseNumber(data?.compra?.lance_inicial),
      incremento: parseNumber(data?.compra?.incremento),
      quantidade: Math.max(1, Math.floor(parseNumber(data?.compra?.quantidade) || 1))
    },
    venda: {
      valor: parseNumber(data?.venda?.valor),
      corretagem_perc: parseNumber(data?.venda?.corretagem_perc),
      desconto_venda: parseNumber(data?.venda?.desconto_venda),
      receita_aluguel: parseNumber(data?.venda?.receita_aluguel)
    },
    custos: {
      comissao_leilao: parseNumber(data?.custos?.comissao_leilao),
      itbi: parseNumber(data?.custos?.itbi),
      escritura: parseNumber(data?.custos?.escritura),
      registro: parseNumber(data?.custos?.registro),
      debitos: parseNumber(data?.custos?.debitos),
      reforma: parseNumber(data?.custos?.reforma),
      desocupacao: parseNumber(data?.custos?.desocupacao),
      condominio: parseNumber(data?.custos?.condominio),
      iptu: parseNumber(data?.custos?.iptu),
      assessoria: parseNumber(data?.custos?.assessoria),
      taxas_administrativas: parseNumber(data?.custos?.taxas_administrativas)
    },
    configuracao: {
      meses_venda: Math.max(1, Math.floor(parseNumber(data?.configuracao?.meses_venda) || 1)),
      lucro_minimo: parseNumber(data?.configuracao?.lucro_minimo),
      custo_capital_mensal: parseNumber(
        data?.configuracao?.custo_capital_mensal ?? data?.configuracao?.custoCapitalMensal
      ),
      roi_minimo_desejado: parseNumber(
        data?.configuracao?.roi_minimo_desejado ??
        data?.configuracao?.roi_minimo_mensal ??
        data?.configuracao?.roiMinimoDesejado
      ),
      tempo_alvo_venda: Math.max(0, Math.floor(parseNumber(
        data?.configuracao?.tempo_alvo_venda ?? data?.configuracao?.tempoEstimadoVenda
      ) || 0)),
      aliquota_ir: parseNumber(data?.configuracao?.aliquota_ir)
    }
  };
}

export function calcularLance(compra, indice) {
  return compra.lance_inicial + (compra.incremento * indice);
}

export function calcularCustoTotalDetalhado(input, lanceAtual, mesesVenda = input.configuracao.meses_venda) {
  const { custos, configuracao } = input;
  const meses = Math.max(1, Math.floor(parseNumber(mesesVenda) || 1));

  const comissao = lanceAtual * custos.comissao_leilao;
  const itbi = lanceAtual * custos.itbi;
  const cartorio = custos.escritura + custos.registro;
  const custoMensal = (custos.condominio + custos.iptu) * meses;

  const custoSemOportunidade = (
    lanceAtual +
    comissao +
    itbi +
    cartorio +
    custos.debitos +
    custos.reforma +
    custos.desocupacao +
    custoMensal +
    custos.assessoria +
    custos.taxas_administrativas
  );

  const custoOportunidade = custoSemOportunidade * configuracao.custo_capital_mensal * meses;
  return {
    custo_sem_oportunidade: custoSemOportunidade,
    custo_oportunidade: custoOportunidade,
    custo_total: custoSemOportunidade + custoOportunidade
  };
}

export function calcularCustoTotal(input, lanceAtual, mesesVenda = input.configuracao.meses_venda) {
  return calcularCustoTotalDetalhado(input, lanceAtual, mesesVenda).custo_total;
}

export function calcularReceita(input) {
  const { venda } = input;
  const corretagemVenda = venda.valor * venda.corretagem_perc;
  return venda.valor - corretagemVenda - venda.desconto_venda + venda.receita_aluguel;
}

export function calcularLucro(input, custoTotal) {
  const receitaLiquida = calcularReceita(input);
  const lucroBruto = receitaLiquida - custoTotal;
  const imposto = lucroBruto > 0 ? lucroBruto * input.configuracao.aliquota_ir : 0;
  const lucroLiquido = lucroBruto - imposto;

  return {
    receita_liquida: receitaLiquida,
    lucro_bruto: lucroBruto,
    imposto,
    lucro_liquido: lucroLiquido
  };
}

export function calcularRentabilidade(custoTotal, lucroLiquido) {
  if (custoTotal <= 0) return 0;
  return (lucroLiquido / custoTotal) * 100;
}

export function calcularTaxaMensal(rentabilidade, mesesVenda) {
  if (mesesVenda <= 0) return 0;
  return rentabilidade / mesesVenda;
}

export function calcularMetricas(input, lanceAtual, mesesVenda = input.configuracao.meses_venda) {
  const meses = Math.max(1, Math.floor(parseNumber(mesesVenda) || 1));
  const custos = calcularCustoTotalDetalhado(input, lanceAtual, meses);
  const custoTotal = custos.custo_total;
  const lucro = calcularLucro(input, custoTotal);
  const rentabilidade = calcularRentabilidade(custos.custo_sem_oportunidade, lucro.lucro_liquido);
  const taxaMensal = calcularTaxaMensal(rentabilidade, meses);

  return {
    lance: lanceAtual,
    meses_venda: meses,
    capital_investido: custos.custo_sem_oportunidade,
    custo_oportunidade: custos.custo_oportunidade,
    custo_total: custoTotal,
    ...lucro,
    rentabilidade,
    roi_mensal: taxaMensal,
    roiMensal: taxaMensal,
    taxa_mensal: taxaMensal
  };
}

export function calcularPrecoVendaNecessario(input, lanceAtual, mesesDesejados, roiMensalDesejado) {
  const meses = Math.max(1, Math.floor(parseNumber(mesesDesejados) || 1));
  const roiMensal = parseNumber(roiMensalDesejado);
  const custos = calcularCustoTotalDetalhado(input, lanceAtual, meses);
  const capitalInvestido = custos.custo_total;
  const lucroLiquidoDesejado = capitalInvestido * (roiMensal / 100) * meses;
  const fatorLiquido = 1 - input.configuracao.aliquota_ir;

  if (fatorLiquido <= 0) {
    return null;
  }

  const lucroBrutoNecessario = lucroLiquidoDesejado / fatorLiquido;
  const receitaLiquidaNecessaria = capitalInvestido + lucroBrutoNecessario;
  const fatorVendaLiquida = 1 - input.venda.corretagem_perc;

  if (fatorVendaLiquida <= 0) {
    return null;
  }

  const ajusteReceita = -input.venda.desconto_venda + input.venda.receita_aluguel;
  const precoVendaNecessario = (receitaLiquidaNecessaria - ajusteReceita) / fatorVendaLiquida;

  return {
    meses_desejados: meses,
    roi_mensal_desejado: roiMensal,
    preco_venda_necessario: precoVendaNecessario,
    precoVendaMinimo: precoVendaNecessario,
    receita_liquida_necessaria: receitaLiquidaNecessaria,
    lucro_liquido_desejado: lucroLiquidoDesejado
  };
}
