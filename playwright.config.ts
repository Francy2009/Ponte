import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  webServer: {
    command: "npm run build && npm start",
    env: {
      PORT: "3101",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      APP_ORIGIN: "http://localhost:3101",
      TRUST_PROXY: "0",
      OPENROUTER_API_KEY: "",
      OPENAI_API_KEY: "",
    },
    url: "http://localhost:3101/api/config",
    reuseExistingServer: false,
    timeout: 180000,
  },
  use: {
    baseURL: "http://localhost:3101",
    launchOptions: {
      ...(process.env.PONTE_BROWSER
        ? { executablePath: process.env.PONTE_BROWSER }
        : {}),
      args: ["--no-sandbox"],
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  reporter: "list",
});
