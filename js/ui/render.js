import { formatCurrency, formatPercent } from "../utils/format.js";

const STEP_TITLES = ["Compra", "Custos", "Venda", "Configuracao", "Resultado"];

function buildRiskPill(risk) {
  const map = {
    seguro: { label: "Seguro", className: "safe" },
    bom: { label: "Bom", className: "good" },
    risco: { label: "Risco", className: "risk" },
    ruim: { label: "Ruim", className: "bad" },
    inviavel: { label: "Inviavel", className: "bad" },
    prejuizo: { label: "Prejuizo", className: "bad" }
  };

  const current = map[risk] ?? map.risco;
  return `<span class="pill ${current.className}">${current.label}</span>`;
}

export function renderStep(stepElements, currentStep, stepIndicator) {
  stepElements.forEach((element, index) => {
    element.hidden = index !== currentStep;
  });

  stepIndicator.textContent = `Etapa ${currentStep + 1} de 5 - ${STEP_TITLES[currentStep]}`;
}

export function renderScenarioSelect(selectElement, scenarios, activeId) {
  const html = scenarios
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");

  selectElement.innerHTML = html;
  selectElement.value = activeId;
}

export function renderSummary(summaryElement, analysis) {
  if (!analysis?.possui_resultado) {
    summaryElement.innerHTML = "<p>Nenhum resultado disponivel.</p>";
    return;
  }

  const melhor = analysis.melhor;
  const melhorTaxaMensal = melhor?.taxa_mensal;
  const breakEven = analysis.break_even;
  const limite = analysis.limite_lance;
  const melhorMomento = analysis.melhorMomentoVenda;
  const recomendacao = analysis.recomendacao;

  summaryElement.innerHTML = [
    `<div class="item"><span>ROI mensal equivalente</span><strong>${formatPercent(melhorTaxaMensal)}</strong></div>`,
    `<div class="item"><span>Melhor rentabilidade total</span><strong>${formatPercent(melhor?.rentabilidade)}</strong></div>`,
    `<div class="item"><span>Melhor momento de venda</span><strong>${melhorMomento ? `${melhorMomento} meses` : "-"}</strong></div>`,
    `<div class="item"><span>Recomendacao</span><strong>${recomendacao || "-"}</strong></div>`,
    `<div class="item"><span>Lance no break-even</span><strong>${breakEven ? formatCurrency(breakEven.lance) : "Nao atingido"}</strong></div>`,
    `<div class="item"><span>Limite de lance viavel</span><strong>${limite ? formatCurrency(limite.lance) : "Nao encontrado"}</strong></div>`
  ].join("");
}

function buildStatusPill(status) {
  const map = {
    IDEAL: { label: "IDEAL", className: "safe" },
    ACEITAVEL: { label: "ACEITAVEL", className: "risk" },
    RUIM: { label: "RUIM", className: "bad" }
  };

  const current = map[status] ?? map.RUIM;
  return `<span class="pill ${current.className}">${current.label}</span>`;
}

function buildDecisionBadge(status) {
  if (status === "IDEAL") return '<span class="badge badge-good">Melhor venda</span>';
  if (status === "ACEITAVEL") return '<span class="badge badge-warn">Aceitavel</span>';
  return '<span class="badge badge-bad">Ruim</span>';
}

export function renderDecision(
  decisionContainer,
  efficiencyBody,
  alertContainer,
  reverseContainer,
  analysis
) {
  const decisao = analysis?.decisao_venda;
  if (!analysis?.possui_resultado || !decisao) {
    decisionContainer.innerHTML = "<p>Nenhuma decisao de venda disponivel.</p>";
    efficiencyBody.innerHTML = "<tr><td colspan='4'>Sem dados para analisar eficiencia.</td></tr>";
    alertContainer.hidden = true;
    reverseContainer.innerHTML = "";
    return;
  }

  const melhor = decisao.melhor_cenario || decisao.melhor_momento;
  decisionContainer.innerHTML = [
    `<div class="item"><span>Melhor mes para vender</span><strong>${decisao.melhorMomentoVenda || "-"}</strong></div>`,
    `<div class="item"><span>ROI mensal maximo</span><strong>${formatPercent(decisao.roiMensalMaximo)}</strong></div>`,
    `<div class="item"><span>Lucro total</span><strong>${formatCurrency(melhor?.lucroLiquido ?? melhor?.lucro_liquido)}</strong></div>`,
    `<div class="item"><span>Tempo recomendado</span><strong>${decisao.melhorMomentoVenda ? `${decisao.melhorMomentoVenda} meses` : "-"}</strong></div>`,
    `<div class="item"><span>Recomendacao</span><strong>${decisao.recomendacao || "-"}</strong></div>`,
    `<div class="item"><span>Status</span><strong>${buildDecisionBadge(melhor?.status)}</strong></div>`
  ].join("");

  const cenarios = decisao.cenarios || decisao.tabela_eficiencia || [];
  efficiencyBody.innerHTML = cenarios.map((item) => `
    <tr>
      <td>${item.meses ?? item.meses_venda}</td>
      <td>${formatCurrency(item.lucroLiquido ?? item.lucro_liquido)}</td>
      <td>${formatPercent(item.roiMensal ?? item.roi_mensal ?? item.taxa_mensal)}</td>
      <td>${buildStatusPill(item.status)}</td>
    </tr>
  `).join("");

  if (decisao.alerta) {
    alertContainer.hidden = false;
    alertContainer.textContent = decisao.alerta;
  } else {
    alertContainer.hidden = true;
    alertContainer.textContent = "";
  }

  const reversa = decisao.simulacaoReversa || decisao.simulacao_reversa;
  reverseContainer.innerHTML = reversa ? [
    `<div class="item"><span>Tempo desejado</span><strong>${reversa.meses_desejados} meses</strong></div>`,
    `<div class="item"><span>ROI mensal desejado</span><strong>${formatPercent(reversa.roi_mensal_desejado)}</strong></div>`,
    `<div class="item"><span>Preco minimo de venda</span><strong>${formatCurrency(reversa.precoVendaMinimo ?? reversa.preco_venda_necessario)}</strong></div>`
  ].join("") : "<p>Nao foi possivel calcular o preco minimo de venda.</p>";
}

export function renderResults(tableBody, analysis) {
  if (!analysis?.possui_resultado) {
    tableBody.innerHTML = "<tr><td colspan='6'>Sem dados para simular.</td></tr>";
    return;
  }

  tableBody.innerHTML = analysis.resultados.map((item) => `
    <tr>
      <td>${formatCurrency(item.lance)}</td>
      <td>${formatCurrency(item.custo_total)}</td>
      <td>${formatCurrency(item.receita_liquida)}</td>
      <td>${formatCurrency(item.lucro_liquido)}</td>
      <td>${formatPercent(item.rentabilidade)}</td>
      <td>${buildRiskPill(item.risco)}</td>
    </tr>
  `).join("");
}
