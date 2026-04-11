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
  const breakEven = analysis.break_even;
  const limite = analysis.limite_lance;

  summaryElement.innerHTML = [
    `<div class="item"><span>Melhor rentabilidade</span><strong>${formatPercent(melhor?.rentabilidade)}</strong></div>`,
    `<div class="item"><span>Lance no break-even</span><strong>${breakEven ? formatCurrency(breakEven.lance) : "Nao atingido"}</strong></div>`,
    `<div class="item"><span>Limite de lance viavel</span><strong>${limite ? formatCurrency(limite.lance) : "Nao encontrado"}</strong></div>`
  ].join("");
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
