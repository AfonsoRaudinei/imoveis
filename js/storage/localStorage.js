const STORAGE_KEY = "leilao_engine";

export function saveState(state) {
  const payload = {
    version: state.version,
    savedAt: new Date().toISOString(),
    data: state
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

let autosaveTimer = null;

export function scheduleAutosave(getState, onSaved) {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveState(getState());
    if (typeof onSaved === "function") {
      onSaved();
    }
  }, 600);
}
