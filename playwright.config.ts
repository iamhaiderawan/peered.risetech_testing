import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  // The staging site is slow and the internet can drop: wait a little longer
  // for each check, and give a failed test one more try.
  expect: { timeout: 10_000 },
  retries: 1,
  // "list" prints a clean pass/fail list in the terminal.
  // The HTML report is still saved, but it no longer opens by itself.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL,
    // A click or fill that cannot be done gives up after 20 seconds, not after the whole test time.
    actionTimeout: 20_000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // Logs in once and saves the session to .auth/faculty.json.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
