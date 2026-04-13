import { simularLances } from "../engine/simulation.js";
import { analisarSimulacao } from "../engine/analyzer.js";
import { calcularMetricas, normalizeInput } from "../engine/calculator.js";
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
  renderInsights,
  renderLimitDecision,
  renderResults,
  renderScenarioSelect,
  renderStep,
  renderStepper,
  renderSummary
} from "../ui/render.js";
import { formatCurrency, formatDateTime } from "../utils/format.js";
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
  stepper: $("#stepper"),
  stepperToggle: $("#stepperToggle"),
  stepperCurrent: $("#stepperCurrent"),
  stepperMenu: $("#stepperMenu"),
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
  exportStatus: $("#exportStatus"),
  profitChart: $("#profitChart"),
  smartAlerts: $("#smartAlerts"),
  smartSummary: $("#smartSummary"),
  limitDecision: $("#limitDecision"),
  liveBidInput: $("#liveBidInput"),
  liveBidHistory: $("#liveBidHistory"),
  liveComparisonBody: $("#liveComparisonBody")
};

let state = loadState() || createInitialState();
let latestAnalysis = null;
let cachedAnalysis = null;
let cachedAnalysisKey = "";
let lastRenderedAnalysisRef = null;
let renderResultsRaf = 0;
let stepperOpen = false;
const liveBidOverrides = new Map();
const liveBidHistoryByScenario = new Map();

function sanitizeNumericInput(value, maxLength = 7) {
  const cleaned = value.replace(/[^0-9,.-]/g, "").slice(0, maxLength);
  return cleaned;
}

function sanitizeBidInput(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 10);
}

function parseBidInput(value) {
  const sanitized = sanitizeBidInput(value);
  if (!sanitized) return null;
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getCurrentLiveBidOverride() {
  const value = liveBidOverrides.get(state.activeScenarioId);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function setCurrentLiveBidOverride(value) {
  if (!Number.isFinite(value) || value <= 0) {
    liveBidOverrides.delete(state.activeScenarioId);
    return;
  }
  liveBidOverrides.set(state.activeScenarioId, Math.round(value));
}

function getCurrentLiveBidHistory() {
  return liveBidHistoryByScenario.get(state.activeScenarioId) || [];
}

function pushLiveBidHistory(value) {
  if (!Number.isFinite(value) || value <= 0) return;
  const rounded = Math.round(value);
  const current = getCurrentLiveBidHistory();
  const next = [rounded, ...current.filter((item) => item !== rounded)].slice(0, 6);
  liveBidHistoryByScenario.set(state.activeScenarioId, next);
}

function ensureLiveBidInitialized() {
  const current = getCurrentLiveBidOverride();
  if (current) return;
  const scenario = getScenarioOrThrow();
  const baseBid = Number(scenario.data?.compra?.lance_inicial || 0);
  if (baseBid > 0) {
    setCurrentLiveBidOverride(baseBid);
    pushLiveBidHistory(baseBid);
  }
}

function getScenarioDataForAnalysis(rawData) {
  const overrideBid = getCurrentLiveBidOverride();
  if (!overrideBid) return rawData;
  return {
    ...rawData,
    compra: {
      ...rawData.compra,
      lance_inicial: overrideBid
    }
  };
}

function bindProfitChartInteractions() {
  const points = Array.from(elements.profitChart?.querySelectorAll(".chart-point") || []);
  const tooltip = elements.profitChart?.querySelector(".chart-tooltip");
  if (!points.length || !tooltip) return;

  const selectPoint = (point) => {
    points.forEach((item) => item.classList.remove("active"));
    point.classList.add("active");
    const monthLabel = point.dataset.monthLabel || "";
    const profitLabel = point.dataset.profitLabel || "";
    tooltip.textContent = `${monthLabel} -> ${profitLabel}`;
  };

  points.forEach((point) => {
    point.addEventListener("mouseenter", () => selectPoint(point));
    point.addEventListener("focus", () => selectPoint(point));
    point.addEventListener("click", () => selectPoint(point));
    point.addEventListener("touchstart", () => selectPoint(point), { passive: true });
  });
}

function renderLiveComparisonTable() {
  const history = getCurrentLiveBidHistory();
  if (!history.length) {
    elements.liveComparisonBody.innerHTML = "<tr><td colspan='3'>Sem simulacoes recentes.</td></tr>";
    return;
  }

  const scenario = getScenarioOrThrow();
  const input = normalizeInput(getScenarioDataForAnalysis(scenario.data));
  elements.liveComparisonBody.innerHTML = history
    .map((bid) => {
      const lucroMes1 = calcularMetricas(input, bid, 1).lucro_liquido;
      const lucroMes12 = calcularMetricas(input, bid, 12).lucro_liquido;
      return `
        <tr>
          <td>${formatCurrency(bid)}</td>
          <td>${formatCurrency(lucroMes1)}</td>
          <td>${formatCurrency(lucroMes12)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderLiveBidPanel() {
  const currentBid = getCurrentLiveBidOverride();
  elements.liveBidInput.value = currentBid ? String(Math.round(currentBid)) : "";

  const history = getCurrentLiveBidHistory();
  elements.liveBidHistory.innerHTML = history.length
    ? history.map((bid) => `<button type="button" class="history-chip" data-live-bid="${bid}">${formatCurrency(bid)}</button>`).join("")
    : "<p class='status'>Sem historico de testes.</p>";

  renderLiveComparisonTable();
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
  const scenarioData = getScenarioDataForAnalysis(scenario.data);
  const resultados = simularLances(scenarioData);
  return analisarSimulacao(resultados, Number(scenarioData.configuracao.lucro_minimo) || 0, scenarioData);
}

function getAnalysisCacheKey(scenario) {
  const scenarioData = getScenarioDataForAnalysis(scenario.data);
  const lucroMinimo = Number(scenarioData?.configuracao?.lucro_minimo || 0);
  const liveBid = Number(getCurrentLiveBidOverride() || 0);
  return `${scenario.id}:${scenario.updatedAt}:${lucroMinimo}:${liveBid}`;
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
  renderLimitDecision(elements.limitDecision, analysis);
  renderInsights(elements.profitChart, elements.smartAlerts, elements.smartSummary, analysis);
  renderDecision(
    elements.decisionCard,
    elements.efficiencyBody,
    elements.decisionAlert,
    elements.reverseSimulation,
    analysis
  );
  renderResults(elements.resultsBody, analysis);
  bindProfitChartInteractions();
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
  renderStep(elements.steps, state.currentStep);
  renderStepper(elements.stepperCurrent, elements.stepperMenu, state.currentStep, stepperOpen);
  elements.stepperToggle.setAttribute("aria-expanded", String(stepperOpen));
  elements.stepper.classList.toggle("open", stepperOpen);
  syncFormFromState();

  if (state.currentStep === 4) {
    ensureLiveBidInitialized();
    renderLiveBidPanel();
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

function closeStepper() {
  stepperOpen = false;
  renderStepper(elements.stepperCurrent, elements.stepperMenu, state.currentStep, stepperOpen);
  elements.stepperToggle.setAttribute("aria-expanded", "false");
  elements.stepper.classList.remove("open");
}

function bindScenarioActions() {
  elements.scenarioSelect.addEventListener("change", (event) => {
    setActiveScenario(state, event.target.value);
    setCurrentStep(state, 0);
    cachedAnalysis = null;
    cachedAnalysisKey = "";
    renderAll();
    scheduleSave("Auto salvo");
  });

  elements.createScenarioBtn.addEventListener("click", () => {
    const name = elements.scenarioName.value.trim();
    createScenario(state, name || undefined);
    setCurrentStep(state, 0);
    cachedAnalysis = null;
    cachedAnalysisKey = "";
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
    liveBidOverrides.delete(active.id);
    liveBidHistoryByScenario.delete(active.id);
    closeStepper();
    renderAll();
    scheduleSave("Cenario excluido e salvo");
  });
}

function bindStepperActions() {
  elements.stepperToggle.addEventListener("click", () => {
    stepperOpen = !stepperOpen;
    renderStepper(elements.stepperCurrent, elements.stepperMenu, state.currentStep, stepperOpen);
    elements.stepperToggle.setAttribute("aria-expanded", String(stepperOpen));
    elements.stepper.classList.toggle("open", stepperOpen);
  });

  elements.stepperMenu.addEventListener("click", (event) => {
    const target = event.target.closest("[data-step-target]");
    if (!target) return;

    const nextStep = Number(target.dataset.stepTarget);
    if (!Number.isFinite(nextStep)) return;

    setCurrentStep(state, nextStep);
    closeStepper();
    renderAll();
    scheduleSave("Navegacao salva");
  });

  document.addEventListener("click", (event) => {
    if (!stepperOpen) return;
    if (elements.stepper.contains(event.target)) return;
    closeStepper();
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
        renderLiveBidPanel();
      }
    });
  });
}

function bindLiveBidActions() {
  elements.liveBidInput.addEventListener("input", (event) => {
    const sanitized = sanitizeBidInput(event.target.value);
    event.target.value = sanitized;
    const parsed = parseBidInput(sanitized);
    if (!parsed) return;
    setCurrentLiveBidOverride(parsed);
    scheduleAnalysisRender();
  });

  elements.liveBidInput.addEventListener("change", (event) => {
    const parsed = parseBidInput(event.target.value);
    if (!parsed) return;
    setCurrentLiveBidOverride(parsed);
    pushLiveBidHistory(parsed);
    renderLiveBidPanel();
    scheduleAnalysisRender();
  });

  elements.liveBidHistory.addEventListener("click", (event) => {
    const target = event.target.closest("[data-live-bid]");
    if (!target) return;
    const bid = Number(target.dataset.liveBid);
    if (!Number.isFinite(bid) || bid <= 0) return;
    setCurrentLiveBidOverride(bid);
    pushLiveBidHistory(bid);
    renderLiveBidPanel();
    scheduleAnalysisRender();
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
    closeStepper();
    renderAll();
    scheduleSave("Navegacao salva");
  });

  elements.nextBtn.addEventListener("click", () => {
    if (state.currentStep === 4) {
      setCurrentStep(state, 0);
      closeStepper();
      renderAll();
      return;
    }

    const error = validateStep(state.currentStep);
    if (error) {
      elements.validationMessage.textContent = error;
      return;
    }

    setCurrentStep(state, state.currentStep + 1);
    closeStepper();
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
  bindStepperActions();
  bindFieldActions();
  bindLiveBidActions();
  bindExportActions();
  bindNavigation();
  renderAll();
  registerPWA();
}

init();
