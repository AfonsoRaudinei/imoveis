import { simularLances } from "../engine/simulation.js";
import { analisarSimulacao } from "../engine/analyzer.js";
import {
  createInitialState,
  createScenario,
  deleteScenario,
  getActiveScenario,
  renameScenario,
  setActiveScenario,
  setCurrentStep,
  updateScenarioField
} from "./state.js";
import { loadState, resetState, saveState, scheduleAutosave } from "../storage/localStorage.js";
import {
  renderDecision,
  renderResults,
  renderScenarioSelect,
  renderStep,
  renderSummary
} from "../ui/render.js";
import { formatDateTime } from "../utils/format.js";
import { exportarExcel } from "../utils/exportExcel.js";
import { exportarPDF } from "../utils/exportPDF.js";

const $ = (selector) => document.querySelector(selector);

const elements = {
  scenarioSelect: $("#scenarioSelect"),
  scenarioName: $("#scenarioName"),
  createScenarioBtn: $("#createScenarioBtn"),
  renameScenarioBtn: $("#renameScenarioBtn"),
  deleteScenarioBtn: $("#deleteScenarioBtn"),
  autosaveStatus: $("#autosaveStatus"),
  stepIndicator: $("#stepIndicator"),
  steps: Array.from(document.querySelectorAll(".step")),
  fields: Array.from(document.querySelectorAll("input[data-section][data-key]")),
  validationMessage: $("#validationMessage"),
  backBtn: $("#backBtn"),
  saveBtn: $("#saveBtn"),
  nextBtn: $("#nextBtn"),
  resultsBody: $("#resultsBody"),
  summary: $("#summary"),
  decisionCard: $("#decisionCard"),
  efficiencyBody: $("#efficiencyBody"),
  decisionAlert: $("#decisionAlert"),
  reverseSimulation: $("#reverseSimulation"),
  exportExcelBtn: $("#exportExcelBtn"),
  exportPdfBtn: $("#exportPdfBtn"),
  exportStatus: $("#exportStatus")
};

let state = loadState() || createInitialState();
let latestAnalysis = null;
let cachedAnalysis = null;
let cachedAnalysisKey = "";
let lastRenderedAnalysisRef = null;
let renderResultsRaf = 0;

function sanitizeNumericInput(value, maxLength = 7) {
  const cleaned = value.replace(/[^0-9,.-]/g, "").slice(0, maxLength);
  return cleaned;
}

function getScenarioOrThrow() {
  const scenario = getActiveScenario(state);
  if (!scenario) {
    throw new Error("Cenario ativo nao encontrado.");
  }
  return scenario;
}

function setStatus(message, isWarning = false) {
  elements.autosaveStatus.textContent = message;
  elements.validationMessage.textContent = isWarning ? message : "";
}

function markSaved(source) {
  elements.autosaveStatus.textContent = `${source} em ${formatDateTime(new Date())}`;
}

function validateStep(step) {
  const activeScenario = getScenarioOrThrow();
  const data = activeScenario.data;

  if (step === 0) {
    if (Number(data.compra.lance_inicial) <= 0) return "Informe um lance inicial maior que zero.";
    if (Number(data.compra.incremento) < 0) return "Incremento nao pode ser negativo.";
    if (Number(data.compra.quantidade) < 1) return "Quantidade de simulacoes deve ser ao menos 1.";
  }

  if (step === 2) {
    if (Number(data.venda.valor) <= 0) return "Informe um valor de venda maior que zero.";
  }

  if (step === 3) {
    if (Number(data.configuracao.meses_venda) < 1) return "Meses ate venda deve ser ao menos 1.";
    if (Number(data.configuracao.custo_capital_mensal) < 0) return "Custo de capital mensal nao pode ser negativo.";
    const roiMinimo = Number(
      data.configuracao.roi_minimo_desejado ?? data.configuracao.roi_minimo_mensal
    );
    if (roiMinimo < 0) return "ROI minimo mensal nao pode ser negativo.";
    const tempoAlvo = data.configuracao.tempo_alvo_venda;
    if (String(tempoAlvo).trim() !== "" && Number(tempoAlvo) !== 0 && Number(tempoAlvo) < 1) {
      return "Tempo alvo de venda deve ser ao menos 1 mes quando informado.";
    }
  }

  return "";
}

function scheduleSave(messagePrefix = "Auto salvo") {
  scheduleAutosave(() => state, () => markSaved(messagePrefix));
}

function syncFormFromState() {
  const scenario = getScenarioOrThrow();

  elements.scenarioName.value = scenario.name;
  elements.fields.forEach((field) => {
    const section = field.dataset.section;
    const key = field.dataset.key;
    let value = scenario.data[section]?.[key];
    if (section === "configuracao" && key === "roi_minimo_desejado" && value === undefined) {
      value = scenario.data.configuracao?.roi_minimo_mensal;
    }
    field.value = value ?? "";
  });
}

function computeAnalysis() {
  const scenario = getScenarioOrThrow();
  const resultados = simularLances(scenario.data);
  return analisarSimulacao(resultados, Number(scenario.data.configuracao.lucro_minimo) || 0, scenario.data);
}

function getAnalysisCacheKey(scenario) {
  const lucroMinimo = Number(scenario.data?.configuracao?.lucro_minimo || 0);
  return `${scenario.id}:${scenario.updatedAt}:${lucroMinimo}`;
}

function getLatestAnalysis(force = false) {
  const scenario = getScenarioOrThrow();
  const key = getAnalysisCacheKey(scenario);

  if (!force && cachedAnalysis && cachedAnalysisKey === key) {
    latestAnalysis = cachedAnalysis;
    return latestAnalysis;
  }

  latestAnalysis = computeAnalysis();
  cachedAnalysis = latestAnalysis;
  cachedAnalysisKey = key;
  return latestAnalysis;
}

function setExportStatus(message, isWarning = false) {
  elements.exportStatus.textContent = message;
  elements.exportStatus.classList.toggle("warning", Boolean(isWarning));
}

function buildExportPayload() {
  const scenario = getScenarioOrThrow();
  const analysis = getLatestAnalysis();
  if (!analysis?.possui_resultado) return null;

  const breakEven = analysis.break_even;
  const limite = analysis.limite_lance;
  const melhor = analysis.melhor;
  const decisao = analysis.decisao_venda;

  return {
    cenario: scenario.name,
    gerado_em: formatDateTime(new Date()),
    resumo: {
      melhor_rentabilidade: Number(melhor?.rentabilidade || 0),
      break_even_lance: Number(breakEven?.lance || 0),
      limite_lance: Number(limite?.lance || 0),
      melhor_momento_venda: decisao?.melhorMomentoVenda ?? null,
      roi_mensal_maximo: Number(decisao?.roiMensalMaximo || 0),
      recomendacao: decisao?.recomendacao || ""
    },
    resultados: analysis.resultados
  };
}

function renderAnalysisIfVisible(force = false) {
  if (state.currentStep !== 4) return;

  const analysis = getLatestAnalysis(force);
  if (!force && lastRenderedAnalysisRef === analysis) return;

  renderSummary(elements.summary, analysis);
  renderDecision(
    elements.decisionCard,
    elements.efficiencyBody,
    elements.decisionAlert,
    elements.reverseSimulation,
    analysis
  );
  renderResults(elements.resultsBody, analysis);
  lastRenderedAnalysisRef = analysis;
}

function updateExportAvailability() {
  const canExport = state.currentStep === 4 && Boolean(latestAnalysis?.possui_resultado);
  elements.exportExcelBtn.disabled = !canExport;
  elements.exportPdfBtn.disabled = !canExport;
  setExportStatus(canExport ? "" : "Sem dados suficientes para exportacao.", !canExport);
}

function scheduleAnalysisRender() {
  if (renderResultsRaf) {
    cancelAnimationFrame(renderResultsRaf);
  }

  renderResultsRaf = requestAnimationFrame(() => {
    renderResultsRaf = 0;
    renderAnalysisIfVisible(true);
    updateExportAvailability();
  });
}

function renderAll() {
  const activeScenario = getScenarioOrThrow();
  renderScenarioSelect(elements.scenarioSelect, state.scenarios, state.activeScenarioId);
  renderStep(elements.steps, state.currentStep, elements.stepIndicator);
  syncFormFromState();

  if (state.currentStep === 4) {
    renderAnalysisIfVisible(true);
    updateExportAvailability();
  } else {
    latestAnalysis = null;
    updateExportAvailability();
  }

  elements.backBtn.disabled = state.currentStep === 0;
  elements.nextBtn.textContent = state.currentStep === 4 ? "Reiniciar" : "Seguir";
  elements.validationMessage.textContent = "";
  elements.autosaveStatus.textContent = `Cenario ativo: ${activeScenario.name}`;
}

function bindScenarioActions() {
  elements.scenarioSelect.addEventListener("change", (event) => {
    setActiveScenario(state, event.target.value);
    setCurrentStep(state, 0);
    renderAll();
    scheduleSave("Auto salvo");
  });

  elements.createScenarioBtn.addEventListener("click", () => {
    const name = elements.scenarioName.value.trim();
    createScenario(state, name || undefined);
    setCurrentStep(state, 0);
    renderAll();
    scheduleSave("Novo cenario salvo");
  });

  elements.renameScenarioBtn.addEventListener("click", () => {
    renameScenario(state, state.activeScenarioId, elements.scenarioName.value);
    renderAll();
    scheduleSave("Cenario renomeado e salvo");
  });

  elements.deleteScenarioBtn.addEventListener("click", () => {
    const active = getScenarioOrThrow();
    const ok = window.confirm(`Excluir o cenario \"${active.name}\"?`);
    if (!ok) return;

    const removed = deleteScenario(state, active.id);
    if (!removed) {
      setStatus("Voce precisa manter pelo menos 1 cenario.", true);
      return;
    }

    setCurrentStep(state, 0);
    renderAll();
    scheduleSave("Cenario excluido e salvo");
  });
}

function bindFieldActions() {
  elements.fields.forEach((field) => {
    field.addEventListener("input", (event) => {
      const current = event.target;
      if (current.dataset.numeric === "true") {
        current.value = sanitizeNumericInput(current.value, Number(current.maxLength || 7));
      }

      const scenario = getScenarioOrThrow();
      const previousValue = scenario.data?.[current.dataset.section]?.[current.dataset.key] ?? "";
      if (String(previousValue) === String(current.value)) {
        return;
      }

      updateScenarioField(
        state,
        state.activeScenarioId,
        current.dataset.section,
        current.dataset.key,
        current.value
      );

      scheduleSave("Auto salvo");

      if (state.currentStep === 4) {
        scheduleAnalysisRender();
      }
    });
  });
}

function bindExportActions() {
  elements.exportExcelBtn.addEventListener("click", async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        setExportStatus("Sem resultados para exportar.", true);
        return;
      }

      setExportStatus("Gerando Excel...");
      await exportarExcel(payload);
      setExportStatus("Arquivo Excel exportado com sucesso.");
    } catch {
      setExportStatus("Falha ao exportar Excel.", true);
    }
  });

  elements.exportPdfBtn.addEventListener("click", async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        setExportStatus("Sem resultados para exportar.", true);
        return;
      }

      setExportStatus("Gerando PDF...");
      await exportarPDF(payload);
      setExportStatus("Arquivo PDF exportado com sucesso.");
    } catch {
      setExportStatus("Falha ao exportar PDF.", true);
    }
  });
}

function bindNavigation() {
  elements.backBtn.addEventListener("click", () => {
    setCurrentStep(state, state.currentStep - 1);
    renderAll();
    scheduleSave("Navegacao salva");
  });

  elements.nextBtn.addEventListener("click", () => {
    if (state.currentStep === 4) {
      setCurrentStep(state, 0);
      renderAll();
      return;
    }

    const error = validateStep(state.currentStep);
    if (error) {
      elements.validationMessage.textContent = error;
      return;
    }

    setCurrentStep(state, state.currentStep + 1);
    renderAll();
    scheduleSave("Navegacao salva");
  });

  elements.saveBtn.addEventListener("click", () => {
    saveState(state);
    markSaved("Salvo manualmente");
  });

  window.addEventListener("beforeunload", () => {
    saveState(state);
  });
}

function registerPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // registro opcional
    });
  }
}

function init() {
  if (!state || !Array.isArray(state.scenarios) || state.scenarios.length === 0) {
    resetState();
    state = createInitialState();
  }

  bindScenarioActions();
  bindFieldActions();
  bindExportActions();
  bindNavigation();
  renderAll();
  registerPWA();
}

init();
