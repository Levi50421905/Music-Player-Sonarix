// src/tests/setup.ts
// Dijalankan sebelum semua test

// Mock Tauri APIs yang tidak tersedia di test environment
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(() => Promise.resolve(new Uint8Array())),
  readTextFile: vi.fn(() => Promise.resolve("")),
  writeTextFile: vi.fn(() => Promise.resolve()),
  readDir: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => Promise.resolve({
      execute: vi.fn(() => Promise.resolve({ lastInsertId: 1 })),
      select: vi.fn(() => Promise.resolve([])),
    })),
  },
}));

// Mock OfflineAudioContext
global.OfflineAudioContext = class {
  decodeAudioData() {
    return Promise.resolve({
      getChannelData: () => new Float32Array(1000).fill(0.5),
    });
  }
} as unknown as typeof OfflineAudioContext;

// Suppress console.error di test (kecuali ada yang sengaja ditest)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("React.createElement")) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});