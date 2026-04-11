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
      aliquota_ir: parseNumber(data?.configuracao?.aliquota_ir)
    }
  };
}

export function calcularLance(compra, indice) {
  return compra.lance_inicial + (compra.incremento * indice);
}

export function calcularCustoTotal(input, lanceAtual) {
  const { custos, configuracao } = input;

  const comissao = lanceAtual * custos.comissao_leilao;
  const itbi = lanceAtual * custos.itbi;
  const cartorio = custos.escritura + custos.registro;
  const custoMensal = (custos.condominio + custos.iptu) * configuracao.meses_venda;

  return (
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

export function calcularMetricas(input, lanceAtual) {
  const custoTotal = calcularCustoTotal(input, lanceAtual);
  const lucro = calcularLucro(input, custoTotal);
  const rentabilidade = calcularRentabilidade(custoTotal, lucro.lucro_liquido);
  const taxaMensal = calcularTaxaMensal(rentabilidade, input.configuracao.meses_venda);

  return {
    lance: lanceAtual,
    custo_total: custoTotal,
    ...lucro,
    rentabilidade,
    taxa_mensal: taxaMensal
  };
}
