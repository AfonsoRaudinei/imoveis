export const STATE_VERSION = "1.0.0";

function createId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function createDefaultScenario(name = "Cenario 1") {
  return {
    id: createId(),
    name,
    data: {
      compra: {
        lance_inicial: 150000,
        incremento: 2000,
        quantidade: 10
      },
      venda: {
        valor: 250000,
        corretagem_perc: 0.06,
        desconto_venda: 0,
        receita_aluguel: 0
      },
      custos: {
        comissao_leilao: 0.05,
        itbi: 0.03,
        escritura: 2500,
        registro: 1800,
        debitos: 0,
        reforma: 0,
        desocupacao: 0,
        condominio: 0,
        iptu: 0,
        assessoria: 0,
        taxas_administrativas: 0
      },
      configuracao: {
        meses_venda: 8,
        lucro_minimo: 12,
        aliquota_ir: 0.15
      }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function createInitialState() {
  const scenario = createDefaultScenario("Cenario 1");
  return {
    version: STATE_VERSION,
    activeScenarioId: scenario.id,
    currentStep: 0,
    scenarios: [scenario]
  };
}

export function getActiveScenario(state) {
  return state.scenarios.find((item) => item.id === state.activeScenarioId) ?? null;
}

export function setActiveScenario(state, id) {
  const found = state.scenarios.some((item) => item.id === id);
  if (found) {
    state.activeScenarioId = id;
  }
}

export function setCurrentStep(state, step) {
  state.currentStep = Math.max(0, Math.min(4, step));
}

export function createScenario(state, name) {
  const scenario = createDefaultScenario(name || `Cenario ${state.scenarios.length + 1}`);
  state.scenarios.push(scenario);
  state.activeScenarioId = scenario.id;
  return scenario;
}

export function renameScenario(state, id, name) {
  const target = state.scenarios.find((item) => item.id === id);
  if (!target) return;
  const trimmed = String(name || "").trim();
  if (!trimmed) return;
  target.name = trimmed;
  target.updatedAt = Date.now();
}

export function deleteScenario(state, id) {
  if (state.scenarios.length <= 1) return false;

  const index = state.scenarios.findIndex((item) => item.id === id);
  if (index < 0) return false;

  state.scenarios.splice(index, 1);
  if (!state.scenarios.some((item) => item.id === state.activeScenarioId)) {
    state.activeScenarioId = state.scenarios[0].id;
  }

  return true;
}

export function updateScenarioField(state, id, section, key, value) {
  const target = state.scenarios.find((item) => item.id === id);
  if (!target || !target.data[section]) return;

  target.data[section][key] = value;
  target.updatedAt = Date.now();
}
