function sanitizeFileName(value) {
  return String(value || "cenario")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "cenario";
}

function buildTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}`;
}

function loadScriptOnce(src, checker) {
  if (checker()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar biblioteca de exportacao.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar biblioteca de exportacao."));
    document.head.appendChild(script);
  });
}

function getSummaryRows(payload) {
  return [
    { metrica: "Cenario", valor: payload.cenario },
    { metrica: "Gerado em", valor: payload.gerado_em },
    { metrica: "Melhor rentabilidade (%)", valor: payload.resumo.melhor_rentabilidade },
    { metrica: "Lance break-even (R$)", valor: payload.resumo.break_even_lance },
    { metrica: "Limite de lance viavel (R$)", valor: payload.resumo.limite_lance },
    { metrica: "Melhor momento de venda (meses)", valor: payload.resumo.melhor_momento_venda ?? "-" },
    { metrica: "ROI mensal maximo (%)", valor: payload.resumo.roi_mensal_maximo ?? 0 },
    { metrica: "Recomendacao", valor: payload.resumo.recomendacao || "-" }
  ];
}

function getSimulationRows(payload) {
  return payload.resultados.map((item) => ({
    lance: item.lance,
    custo_total: item.custo_total,
    receita_liquida: item.receita_liquida,
    lucro_liquido: item.lucro_liquido,
    rentabilidade_perc: item.rentabilidade,
    risco: item.risco
  }));
}

export async function exportarExcel(payload) {
  if (!payload?.resultados?.length) {
    throw new Error("Sem dados de simulacao para exportar.");
  }

  await loadScriptOnce(
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    () => Boolean(window.XLSX)
  );

  const workbook = window.XLSX.utils.book_new();
  const resumoRows = getSummaryRows(payload);
  const simulacaoRows = getSimulationRows(payload);

  const resumoSheet = window.XLSX.utils.json_to_sheet(resumoRows);
  const simulacaoSheet = window.XLSX.utils.json_to_sheet(simulacaoRows);

  window.XLSX.utils.book_append_sheet(workbook, resumoSheet, "Resumo");
  window.XLSX.utils.book_append_sheet(workbook, simulacaoSheet, "Simulacao");

  const safeName = sanitizeFileName(payload.cenario);
  const timestamp = buildTimestamp(new Date());
  window.XLSX.writeFile(workbook, `simulacao_${safeName}_${timestamp}.xlsx`);
}
