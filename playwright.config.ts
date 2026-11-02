import { defineConfig, devices } from "@playwright/test";

export const E2E_PASSWORD = "e2e-access-password";
const PORT = 3200;

/**
 * Runs against a production build (`npm run test:e2e` builds first) in password
 * mode with no Claude key, so analyses use the demo analyzer and spend nothing.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/access`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_ACCESS_PASSWORD: E2E_PASSWORD,
      ANTHROPIC_API_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      ANALYSIS_LIMIT_PER_MINUTE: "1000",
      ANALYSIS_LIMIT_PER_HOUR: "1000",
    },
  },
});
