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

function toMoney(value) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function toPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export async function exportarPDF(payload) {
  if (!payload?.resultados?.length) {
    throw new Error("Sem dados de simulacao para exportar.");
  }

  await loadScriptOnce(
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
    () => Boolean(window.jspdf?.jsPDF)
  );

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = 16;
  const rowHeight = 6;
  const pageHeight = 287;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Relatorio de Simulacao de Leilao", 14, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Cenario: ${payload.cenario}`, 14, y);
  y += 5;
  doc.text(`Gerado em: ${payload.gerado_em}`, 14, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Resumo", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Melhor rentabilidade: ${toPercent(payload.resumo.melhor_rentabilidade)}`, 14, y);
  y += 5;
  doc.text(`Lance break-even: ${toMoney(payload.resumo.break_even_lance)}`, 14, y);
  y += 5;
  doc.text(`Limite de lance viavel: ${toMoney(payload.resumo.limite_lance)}`, 14, y);
  y += 5;
  doc.text(`Melhor momento de venda: ${payload.resumo.melhor_momento_venda ?? "-"}`, 14, y);
  y += 5;
  doc.text(`ROI mensal maximo: ${toPercent(payload.resumo.roi_mensal_maximo ?? 0)}`, 14, y);
  y += 5;
  doc.text(`Recomendacao: ${payload.resumo.recomendacao || "-"}`, 14, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Tabela de simulacao", 14, y);
  y += 6;

  const columns = [
    { title: "Lance", x: 14 },
    { title: "Custo Total", x: 44 },
    { title: "Lucro Liquido", x: 82 },
    { title: "Rentabilidade", x: 120 },
    { title: "Risco", x: 156 }
  ];

  doc.setFontSize(9);
  columns.forEach((column) => doc.text(column.title, column.x, y));
  y += rowHeight;
  doc.setFont("helvetica", "normal");

  payload.resultados.forEach((item) => {
    if (y > pageHeight) {
      doc.addPage();
      y = 16;
    }

    doc.text(toMoney(item.lance), columns[0].x, y);
    doc.text(toMoney(item.custo_total), columns[1].x, y);
    doc.text(toMoney(item.lucro_liquido), columns[2].x, y);
    doc.text(toPercent(item.rentabilidade), columns[3].x, y);
    doc.text(String(item.risco || ""), columns[4].x, y);
    y += rowHeight;
  });

  const safeName = sanitizeFileName(payload.cenario);
  const timestamp = buildTimestamp(new Date());
  doc.save(`simulacao_${safeName}_${timestamp}.pdf`);
}
