import { test, expect, Page } from "@playwright/test";
import fs from "fs";

// Login module - test IDs match the testing plan (section 4.1).
// Screenshots are saved to evidence/login/ for the results report.

const FACULTY_EMAIL = process.env.TEST_EMAIL!;
const FACULTY_PASSWORD = process.env.TEST_PASSWORD!;
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD;

// The profile button shows the faculty member's name (it also contains the initials).
const FACULTY_MENU = /Dr\. Asad/;

const EVIDENCE_DIR = "evidence/login";

// ---------- Small helpers ----------

async function openLoginForm(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Login" }).click();
}

// Fills only the fields that are given (an empty string leaves the field empty).
async function fillFields(page: Page, email: string, password: string) {
  if (email) {
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
  }
  if (password) {
    await page.getByRole("textbox", { name: "Password" }).fill(password);
  }
}

async function clickSignIn(page: Page) {
  await page.getByRole("button", { name: "Sign In" }).click();
}

// The Quick Tour opens by itself after login. Close it if it shows up.
async function skipTourIfShown(page: Page) {
  const skip = page.getByRole("button", { name: "Skip" });
  try {
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
  } catch {
    // The tour did not show up. That is fine.
  }
}

async function loginAsFaculty(page: Page) {
  await fillFields(page, FACULTY_EMAIL, FACULTY_PASSWORD);
  await clickSignIn(page);
  await skipTourIfShown(page);
}

// Profile button, then the Logout menu item, then the confirming Logout button.
async function logout(page: Page) {
  await page.getByRole("button", { name: FACULTY_MENU }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.getByRole("button", { name: "Logout" }).click();
}

async function saveEvidence(page: Page, name: string) {
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

// A short description of how the page looks right now (used for the theme test).
// Everything is read in one step inside the page, so nothing can change in between.
async function themeLook(page: Page) {
  return page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === "Login",
    );
    return JSON.stringify({
      headingColor: heading ? getComputedStyle(heading).color : "",
      htmlClass: document.documentElement.className,
      htmlTheme: document.documentElement.getAttribute("data-theme"),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    });
  });
}

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Tests that start on the login form ----------

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await openLoginForm(page);
  });

  test("LOG-01: valid faculty login goes to the Faculty Dashboard", async ({
    page,
  }) => {
    await fillFields(page, FACULTY_EMAIL, FACULTY_PASSWORD);
    await clickSignIn(page);
    await skipTourIfShown(page);

    await expect(page).toHaveURL(/\/faculty\/dashboard/);
    await expect(page.getByText("Faculty Dashboard")).toBeVisible();
    await expect(
      page.getByRole("button", { name: FACULTY_MENU }),
    ).toBeVisible();
    await saveEvidence(page, "LOG-01");
  });

  test("LOG-02: valid student login goes to the student course page", async ({
    page,
  }) => {
    test.skip(
      !STUDENT_EMAIL || !STUDENT_PASSWORD,
      "TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD are not set in .env",
    );
    await fillFields(page, STUDENT_EMAIL!, STUDENT_PASSWORD!);
    await clickSignIn(page);
    await skipTourIfShown(page);

    await expect(page).toHaveURL(/\/student\//);
    await expect(page.getByText("My Enrolled Courses")).toBeVisible();
    await expect(page.getByText("Faculty Dashboard")).toHaveCount(0);
    await saveEvidence(page, "LOG-02");
  });

  test("LOG-03: wrong password shows 'Invalid Credentials'", async ({
    page,
  }) => {
    await fillFields(page, FACULTY_EMAIL, "definitely_wrong_password_123");
    await clickSignIn(page);

    await expect(page.getByText("Invalid Credentials")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await saveEvidence(page, "LOG-03");
  });

  test("LOG-04: unknown email shows the same 'Invalid Credentials' message", async ({
    page,
  }) => {
    await fillFields(page, "nobody_here_123@example.com", "SomePassword123");
    await clickSignIn(page);

    // Same text as LOG-03, so the site does not reveal whether an email exists.
    await expect(page.getByText("Invalid Credentials")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await saveEvidence(page, "LOG-04");
  });

  test("LOG-05a: both fields empty shows both 'required' messages", async ({
    page,
  }) => {
    await clickSignIn(page);

    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await saveEvidence(page, "LOG-05a");
  });

  test("LOG-05b: empty password shows only 'Password is required'", async ({
    page,
  }) => {
    await fillFields(page, FACULTY_EMAIL, "");
    await clickSignIn(page);

    await expect(page.getByText("Password is required")).toBeVisible();
    await expect(page.getByText("Email is required")).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
    await saveEvidence(page, "LOG-05b");
  });

  test("LOG-05c: empty email shows only 'Email is required'", async ({
    page,
  }) => {
    await fillFields(page, "", "SomePassword123");
    await clickSignIn(page);

    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
    await saveEvidence(page, "LOG-05c");
  });

  test("LOG-06: an email without '@' is rejected by the browser", async ({
    page,
  }) => {
    await fillFields(page, "abc", "SomePassword123");
    await clickSignIn(page);

    // The browser's own check blocks the form, so no request is sent.
    const emailBox = page.getByRole("textbox", { name: "Email address" });
    const rejected = await emailBox.evaluate(
      (el) => (el as HTMLInputElement).validity.typeMismatch,
    );
    expect(rejected).toBe(true);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Invalid Credentials")).toHaveCount(0);
    await saveEvidence(page, "LOG-06");
  });

  test("LOG-07: the eye icon shows and hides the password", async ({
    page,
  }) => {
    const password = page.getByRole("textbox", { name: "Password" });
    // The eye button has no name, so we find it as the form button without text.
    const eye = page
      .locator("form")
      .getByRole("button")
      .filter({ hasText: /^$/ });

    await password.fill("abc");
    await expect(password).toHaveAttribute("type", "password");

    await eye.click();
    await expect(password).toHaveAttribute("type", "text");
    await saveEvidence(page, "LOG-07");

    await eye.click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("LOG-09: after logout, the Back button does not reopen the dashboard", async ({
    page,
  }) => {
    await loginAsFaculty(page);
    await expect(page.getByText("Faculty Dashboard")).toBeVisible();

    await logout(page);
    await expect(page.getByText("Faculty Dashboard")).toBeHidden();
    await saveEvidence(page, "LOG-09-after-logout");

    await page.goBack();

    await expect(page).not.toHaveURL(/\/faculty\//);
    await expect(page.getByText("Faculty Dashboard")).toBeHidden();
    await saveEvidence(page, "LOG-09-after-back");
  });

  test("LOG-10: refreshing the page keeps you logged in", async ({ page }) => {
    await loginAsFaculty(page);
    await expect(page).toHaveURL(/\/faculty\/dashboard/);

    await page.reload();

    await expect(page).toHaveURL(/\/faculty\/dashboard/);
    await expect(page.getByText("Faculty Dashboard")).toBeVisible();
    await saveEvidence(page, "LOG-10");
  });

  test("LOG-11: the Sign Up link opens the Sign Up page", async ({ page }) => {
    await page.getByRole("link", { name: "Sign Up" }).click();

    await expect(page).toHaveURL(/\/signup/);
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
    await page.waitForTimeout(500); // let the page finish fading in
    await saveEvidence(page, "LOG-11");
  });

  test("LOG-12: the theme button switches the look of the page and back", async ({
    page,
  }) => {
    const toggle = page.getByRole("button", {
      name: /Switch to (dark|light) mode/,
    });
    const labelNow = () =>
      toggle.evaluate(
        (el) => el.getAttribute("aria-label") ?? el.getAttribute("title"),
      );

    // Wait until the login page has finished loading before the first reading.
    await expect(
      page.getByText("Login", { exact: true }).first(),
    ).toBeVisible();
    const before = await themeLook(page);
    expect(before).not.toContain('"headingColor":""');
    expect(await labelNow()).toBe("Switch to dark mode");

    await toggle.click();
    await expect.poll(() => themeLook(page)).not.toBe(before);
    expect(await labelNow()).toBe("Switch to light mode");
    await page.waitForTimeout(500); // let the colour change finish
    await saveEvidence(page, "LOG-12-changed");

    await toggle.click();
    await expect.poll(() => themeLook(page)).toBe(before);
    expect(await labelNow()).toBe("Switch to dark mode");
    await page.waitForTimeout(500);
    await saveEvidence(page, "LOG-12-back");
  });
});

// ---------- Tests that must start logged out, on a protected page ----------

test.describe("Login - protected pages", () => {
  for (const [id, path] of [
    ["LOG-08a", "/faculty/dashboard"],
    ["LOG-08b", "/faculty/courses"],
  ]) {
    test(`${id}: opening ${path} while logged out goes to the login page`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/login/);
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
      await saveEvidence(page, id);
    });
  }
});
