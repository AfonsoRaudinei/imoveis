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
import { renderResults, renderScenarioSelect, renderStep, renderSummary } from "../ui/render.js";
import { formatDateTime } from "../utils/format.js";

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
  summary: $("#summary")
};

let state = loadState() || createInitialState();

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
    const value = scenario.data[section]?.[key];
    field.value = value ?? "";
  });
}

function computeAnalysis() {
  const scenario = getScenarioOrThrow();
  const resultados = simularLances(scenario.data);
  return analisarSimulacao(resultados, Number(scenario.data.configuracao.lucro_minimo) || 0);
}

function renderAll() {
  const activeScenario = getScenarioOrThrow();
  renderScenarioSelect(elements.scenarioSelect, state.scenarios, state.activeScenarioId);
  renderStep(elements.steps, state.currentStep, elements.stepIndicator);
  syncFormFromState();

  const analysis = computeAnalysis();
  renderSummary(elements.summary, analysis);
  renderResults(elements.resultsBody, analysis);

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

      updateScenarioField(
        state,
        state.activeScenarioId,
        current.dataset.section,
        current.dataset.key,
        current.value
      );

      scheduleSave("Auto salvo");

      if (state.currentStep === 4) {
        const analysis = computeAnalysis();
        renderSummary(elements.summary, analysis);
        renderResults(elements.resultsBody, analysis);
      }
    });
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
  bindNavigation();
  renderAll();
  registerPWA();
}

init();
