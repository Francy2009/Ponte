import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/api/config",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: "http://localhost:5173",
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
