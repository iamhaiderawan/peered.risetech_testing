import { test as setup, expect } from "@playwright/test";
import fs from "fs";

// Logs in as faculty ONCE and saves the session, so the other test files
// (Dashboard and later modules) do not have to log in again.
// The saved file is private: it must stay in .gitignore (.auth/).

const AUTH_FILE = ".auth/faculty.json";
const STUDENT_AUTH_FILE = ".auth/student.json";

setup("log in as faculty and save the session", async ({ page }) => {
  fs.mkdirSync(".auth", { recursive: true });

  await page.goto("/");
  await page.getByRole("link", { name: "Login" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(process.env.TEST_EMAIL!);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();

  // The Quick Tour opens by itself on the first visit. Skip it, so the site
  // remembers it was seen (it is kept in the browser's local storage).
  const skip = page.getByRole("button", { name: "Skip" });
  try {
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
  } catch {
    // no tour this time
  }

  await expect(page).toHaveURL(/\/faculty\/dashboard/);
  await page.context().storageState({ path: AUTH_FILE });
});

// The same for the student account: the tests that need a second browser (student view) use this
// saved session, so they never meet the Quick Tour and do not have to log in again.
setup("log in as student and save the session", async ({ page }) => {
  fs.mkdirSync(".auth", { recursive: true });

  await page.goto("/");
  await page.getByRole("link", { name: "Login" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(process.env.TEST_STUDENT_EMAIL!);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(process.env.TEST_STUDENT_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();

  const skip = page.getByRole("button", { name: "Skip" });
  try {
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
  } catch {
    // no tour this time
  }

  await expect(page).toHaveURL(/\/student\//);
  await page.context().storageState({ path: STUDENT_AUTH_FILE });
});
