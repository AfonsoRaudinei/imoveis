import { formatCurrency, formatPercent } from "../utils/format.js";

const STEP_TITLES = ["Compra", "Custos", "Venda", "Configuracao", "Resultado"];
const EFFICIENCY_DROP_THRESHOLD = 8;

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

export function renderStep(stepElements, currentStep) {
  stepElements.forEach((element, index) => {
    element.hidden = index !== currentStep;
  });
}

export function renderStepper(stepperCurrent, stepperMenu, currentStep, isOpen) {
  stepperCurrent.textContent = `Etapa ${currentStep + 1} de ${STEP_TITLES.length} - ${STEP_TITLES[currentStep]}`;

  const html = STEP_TITLES.map((title, index) => {
    const status = index < currentStep ? "done" : index === currentStep ? "active" : "future";
    const icon = status === "done" ? "OK" : status === "active" ? ">" : "-";
    const statusLabel = status === "done" ? "Concluida" : status === "active" ? "Atual" : "Futura";
    return `
      <button type="button" class="stepper-item ${status}" data-step-target="${index}" aria-label="${title} - ${statusLabel}">
        <span class="stepper-item-icon" aria-hidden="true">${icon}</span>
        <span class="stepper-item-label">${title}</span>
      </button>
    `;
  }).join("");

  stepperMenu.innerHTML = html;
  stepperMenu.hidden = !isOpen;
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

function getScenariosFromAnalysis(analysis) {
  const decisao = analysis?.decisao_venda;
  const cenarios = decisao?.cenarios || decisao?.tabela_eficiencia || [];
  return [...cenarios].sort((a, b) => (a.meses ?? a.meses_venda ?? 0) - (b.meses ?? b.meses_venda ?? 0));
}

function buildProfitChartMarkup(cenarios) {
  if (!cenarios.length) {
    return "<p>Sem dados suficientes para montar o grafico.</p>";
  }

  const width = 680;
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 42, left: 64 };
  const months = cenarios.map((item) => Number(item.meses ?? item.meses_venda ?? 0));
  const profits = cenarios.map((item) => Number(item.lucroLiquido ?? item.lucro_liquido ?? 0));
  const minMonth = Math.min(...months);
  const maxMonth = Math.max(...months);
  const minProfit = Math.min(...profits);
  const maxProfit = Math.max(...profits);
  const safeRangeX = Math.max(1, maxMonth - minMonth);
  const rawRangeY = maxProfit - minProfit;
  const padY = rawRangeY <= 0 ? Math.max(1, Math.abs(maxProfit) * 0.05) : rawRangeY * 0.12;
  const yMin = minProfit - padY;
  const yMax = maxProfit + padY;
  const safeRangeY = Math.max(1, yMax - yMin);

  const toX = (month) => {
    const progress = (month - minMonth) / safeRangeX;
    return padding.left + progress * (width - padding.left - padding.right);
  };
  const toY = (profit) => {
    const progress = (profit - yMin) / safeRangeY;
    return height - padding.bottom - progress * (height - padding.top - padding.bottom);
  };

  const points = cenarios.map((item) => {
    const month = Number(item.meses ?? item.meses_venda ?? 0);
    const profit = Number(item.lucroLiquido ?? item.lucro_liquido ?? 0);
    const x = toX(month);
    const y = toY(profit);

    return {
      month,
      profit,
      x,
      y,
      label: `${month} meses`,
      valueLabel: formatCurrency(profit)
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const axisLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padding.top + ratio * (height - padding.top - padding.bottom);
      const value = yMax - ratio * safeRangeY;
      return `
        <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${(width - padding.right).toFixed(2)}" y2="${y.toFixed(2)}" class="chart-grid-line"></line>
        <text x="${(padding.left - 8).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="chart-axis-label">${formatCurrency(value)}</text>
      `;
    })
    .join("");

  const monthLabels = points
    .map((point) => `
      <text x="${point.x.toFixed(2)}" y="${(height - 16).toFixed(2)}" text-anchor="middle" class="chart-axis-label">${point.month}</text>
    `)
    .join("");

  const pointNodes = points
    .map((point, index) => `
      <circle
        class="chart-point ${index === 0 ? "active" : ""}"
        cx="${point.x.toFixed(2)}"
        cy="${point.y.toFixed(2)}"
        r="6"
        tabindex="0"
        role="button"
        aria-label="${point.label} - ${point.valueLabel}"
        data-month-label="${point.label}"
        data-profit-label="${point.valueLabel}"
      ></circle>
    `)
    .join("");

  const firstPoint = points[0];

  return `
    <div class="profit-chart-shell">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de lucro por mes">
        ${axisLines}
        <line x1="${padding.left}" y1="${(height - padding.bottom).toFixed(2)}" x2="${(width - padding.right).toFixed(2)}" y2="${(height - padding.bottom).toFixed(2)}" class="chart-axis-line"></line>
        <path d="${linePath}" class="chart-line"></path>
        ${pointNodes}
        ${monthLabels}
      </svg>
      <div class="chart-tooltip">${firstPoint.label} -> ${firstPoint.valueLabel}</div>
    </div>
  `;
}

function buildSmartAlerts(analysis, cenarios) {
  if (!cenarios.length) {
    return [{ type: "info", text: "Preencha os dados para gerar alertas inteligentes." }];
  }

  const alerts = [];
  const best = cenarios.reduce((acc, item) => {
    const lucro = Number(item.lucroLiquido ?? item.lucro_liquido ?? 0);
    if (!acc) return item;
    const bestLucro = Number(acc.lucroLiquido ?? acc.lucro_liquido ?? 0);
    return lucro > bestLucro ? item : acc;
  }, null);

  const first = cenarios[0];
  const last = cenarios[cenarios.length - 1];
  const bestLucro = Number(best?.lucroLiquido ?? best?.lucro_liquido ?? 0);
  const lastLucro = Number(last?.lucroLiquido ?? last?.lucro_liquido ?? 0);
  const erosionValue = bestLucro - lastLucro;
  const erosionPercent = bestLucro > 0 ? (erosionValue / bestLucro) * 100 : 0;

  if (erosionPercent >= EFFICIENCY_DROP_THRESHOLD) {
    const target = bestLucro * (1 - EFFICIENCY_DROP_THRESHOLD / 100);
    const startLoss = cenarios.find((item) => Number(item.lucroLiquido ?? item.lucro_liquido ?? 0) <= target);
    const month = startLoss?.meses ?? startLoss?.meses_venda ?? last?.meses ?? last?.meses_venda ?? "-";
    alerts.push({
      type: "warning",
      text: `Apos ${month} meses, a operacao comeca a perder eficiencia.`
    });
  }

  const bestMonth = best?.meses ?? best?.meses_venda ?? "-";
  alerts.push({
    type: "success",
    text: `Melhor momento de venda: ${bestMonth} meses.`
  });

  const targetRentability = Number(analysis?.lucro_minimo_meta || 0);
  if (targetRentability > 0) {
    const belowTarget = cenarios.find((item) => Number(item.rentabilidade ?? 0) < targetRentability);
    if (belowTarget) {
      const month = belowTarget.meses ?? belowTarget.meses_venda ?? "-";
      alerts.push({
        type: "warning",
        text: `A partir de ${month} meses, a rentabilidade fica abaixo do esperado (${formatPercent(targetRentability)}).`
      });
    }
  }

  const negative = cenarios.find((item) => Number(item.lucroLiquido ?? item.lucro_liquido ?? 0) < 0);
  if (negative) {
    const month = negative.meses ?? negative.meses_venda ?? "-";
    alerts.push({
      type: "danger",
      text: `Apos ${month} meses, a operacao entra no prejuizo.`
    });
  }

  const condominio = Number(analysis?.decisao_venda?.custosMensaisBase?.condominio || 0);
  const iptu = Number(analysis?.decisao_venda?.custosMensaisBase?.iptu || 0);
  const hasMonthlyCosts = condominio > 0 || iptu > 0;
  const firstLucro = Number(first?.lucroLiquido ?? first?.lucro_liquido ?? 0);
  if (hasMonthlyCosts && lastLucro < firstLucro) {
    alerts.push({
      type: "warning",
      text: "Custos mensais estao reduzindo seu lucro ao longo do tempo."
    });
  }

  return alerts;
}

export function renderInsights(profitChartContainer, smartAlertsContainer, smartSummaryContainer, analysis) {
  if (!analysis?.possui_resultado) {
    profitChartContainer.innerHTML = "<p>Nenhum dado disponivel para o grafico.</p>";
    smartAlertsContainer.innerHTML = "<p>Nenhum alerta disponivel.</p>";
    smartSummaryContainer.innerHTML = "<p>Nenhum resumo inteligente disponivel.</p>";
    return;
  }

  const cenarios = getScenariosFromAnalysis(analysis);
  profitChartContainer.innerHTML = buildProfitChartMarkup(cenarios);

  const alerts = buildSmartAlerts(analysis, cenarios);
  const iconMap = {
    success: "OK",
    warning: "ALERTA",
    danger: "CRITICO",
    info: "INFO"
  };

  smartAlertsContainer.innerHTML = alerts
    .map((item) => `
      <div class="smart-alert ${item.type}">
        <span class="icon">${iconMap[item.type] || "INFO"}</span>
        <span>${item.text}</span>
      </div>
    `)
    .join("");

  const best = cenarios.reduce((acc, item) => {
    const lucro = Number(item.lucroLiquido ?? item.lucro_liquido ?? 0);
    if (!acc) return item;
    const bestLucro = Number(acc.lucroLiquido ?? acc.lucro_liquido ?? 0);
    return lucro > bestLucro ? item : acc;
  }, null);
  const last = cenarios[cenarios.length - 1];
  const bestMonth = best?.meses ?? best?.meses_venda ?? "-";
  const bestProfit = Number(best?.lucroLiquido ?? best?.lucro_liquido ?? 0);
  const bestRentabilidade = Number(best?.rentabilidade ?? 0);
  const lastProfit = Number(last?.lucroLiquido ?? last?.lucro_liquido ?? 0);
  const erosionValue = Math.max(0, bestProfit - lastProfit);

  const phrase = erosionValue > 0
    ? `Esse imovel e mais lucrativo para venda rapida. Segurar reduz o ganho em ate ${formatCurrency(erosionValue)}.`
    : "A curva de lucro se manteve estavel no horizonte analisado.";

  smartSummaryContainer.innerHTML = [
    `<div class="item"><span>Melhor mes</span><strong>${bestMonth} meses</strong></div>`,
    `<div class="item"><span>Lucro</span><strong>${formatCurrency(bestProfit)}</strong></div>`,
    `<div class="item"><span>Rentabilidade</span><strong>${formatPercent(bestRentabilidade)}</strong></div>`,
    `<p class="smart-phrase">${phrase}</p>`
  ].join("");
}

export function renderLimitDecision(limitContainer, analysis) {
  const limiteAutomatico = analysis?.limite_automatico || analysis?.decisao_venda?.limiteAutomatico;
  if (!analysis?.possui_resultado || !limiteAutomatico) {
    limitContainer.innerHTML = "<p>Nenhum limite automatico disponivel.</p>";
    return;
  }

  const meta = Number(limiteAutomatico.rentabilidadeMinima || 0);
  const limiteRecomendado = Number(limiteAutomatico.limiteRecomendado || 0);
  const mesesConservador = limiteAutomatico.cenarioConservadorMeses;
  const nenhumLanceValido = Boolean(limiteAutomatico.nenhumLanceValidoGlobal);
  const zona = limiteAutomatico.zonaRisco;
  const limitesPorCenario = [...(limiteAutomatico.limitesPorCenario || [])]
    .sort((a, b) => (a.meses || 0) - (b.meses || 0));

  if (nenhumLanceValido) {
    limitContainer.innerHTML = [
      '<div class="limit-main danger">',
      "<span class='label'>Limite recomendado de lance</span>",
      "<strong>Nenhum lance atende a meta</strong>",
      `<small>Meta de rentabilidade: ${formatPercent(meta)}</small>`,
      "</div>",
      '<div class="smart-alert danger">',
      "<span class='icon'>CRITICO</span>",
      "<span>Nenhum lance atende sua rentabilidade minima. Reduza preco de compra, aumente venda ou corte custos.</span>",
      "</div>"
    ].join("");
    return;
  }

  const cenariosHtml = limitesPorCenario
    .map((item) => {
      const limiteMes = item.limite_lance ? formatCurrency(item.limite_lance) : "Nao atende";
      return `<tr><td>${item.meses} meses</td><td>${limiteMes}</td></tr>`;
    })
    .join("");

  const faixaRisco = zona
    ? `
      <div class="limit-zone">
        <div class="zone-item"><span>Seguro</span><strong>ate ${formatCurrency(zona.seguro_ate)}</strong></div>
        <div class="zone-item"><span>Risco</span><strong>${formatCurrency(zona.risco_de)} - ${formatCurrency(zona.risco_ate)}</strong></div>
        <div class="zone-item"><span>Perigo</span><strong>acima de ${formatCurrency(zona.perigo_acima_de)}</strong></div>
      </div>
    `
    : "";

  limitContainer.innerHTML = [
    '<div class="limit-main">',
    "<span class='label'>Limite recomendado de lance</span>",
    `<strong>${formatCurrency(limiteRecomendado)}</strong>`,
    `<small>Considerando venda em: ${mesesConservador || "-"} meses | Rentabilidade minima: ${formatPercent(meta)}</small>`,
    `<p class="smart-phrase">Acima de ${formatCurrency(limiteRecomendado)}, sua rentabilidade cai abaixo de ${formatPercent(meta)}.</p>`,
    "</div>",
    "<h5 class='limit-subtitle'>Limite por cenario</h5>",
    '<div class="table-wrap"><table><thead><tr><th>Prazo</th><th>Limite</th></tr></thead><tbody>',
    cenariosHtml,
    "</tbody></table></div>",
    faixaRisco
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
