import {
  test,
  expect,
  Page,
  Browser,
  Locator,
  TestInfo,
} from "@playwright/test";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

// Course overview and members module - test IDs match the testing plan (Module 4, OVW).
// Screenshots are saved to evidence/overview/ for the results report.
// The faculty session comes from tests/auth.setup.ts (.auth/faculty.json). The student and the
// second faculty log in in their own browser, with their own accounts from .env.
//
// Everything happens inside one course, qa_course. OVW-00 deletes any leftover and creates it fresh;
// OVW-99 deletes it. Every test puts the course back to plain (Active, Student Activity Enabled,
// no students, only the owner as faculty) in a finally block, even when it fails.
// Downloaded and built Excel files go to test-results/ (never to evidence/: they hold real emails).

const AUTH_FILE = ".auth/faculty.json";
const EVIDENCE_DIR = "evidence/overview";
const COURSE = "qa_course";
const BASELINE_FILE = `${EVIDENCE_DIR}/baseline.json`;

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;
const FACULTY2_EMAIL = process.env.TEST_FACULTY2_EMAIL!;
const FACULTY2_PASSWORD = process.env.TEST_FACULTY2_PASSWORD!;

test.use({ storageState: AUTH_FILE });
// The tests run one after another in file order. Not "serial" mode on purpose: in that mode one
// failure would skip every test after it. No retries: a retry would repeat enrolments and uploads.
test.describe.configure({ retries: 0, timeout: 300_000 });

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Small helpers ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRe = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

// Sample files can be anywhere under sample/ (Rauf's in sample/test-samples, the extra ones in sample/).
function sample(name: string): string {
  const walk = (dir: string): string | undefined => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      } else if (e.name === name) return p;
    }
  };
  const found = fs.existsSync("sample") ? walk("sample") : undefined;
  if (!found) throw new Error(`sample file not found under sample/: ${name}`);
  return found;
}

function note(text: string) {
  console.log(`NOTE | ${text}`);
  test.info().annotations.push({ type: "note", description: text });
}

async function saveEvidence(page: Page, name: string) {
  await page.waitForTimeout(1200); // pages and pop-ups fade in and out
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

// Guides (video pop-ups and tours) open by themselves on some pages and block clicks.
async function dismissGuides(page: Page, waitMs = 1500) {
  for (let i = 0; i < 4; i++) {
    const closer = page
      .getByRole("button", { name: /^(skip|close.*)$/i })
      .first();
    try {
      await closer.waitFor({ state: "visible", timeout: waitMs });
      await closer.click();
      await page.waitForTimeout(300);
    } catch {
      return;
    }
  }
}

const lines = async (page: Page) =>
  new Set(
    (await page.locator("body").innerText())
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

// Runs an action and returns the lines of text that appeared after it (toasts included).
// Toasts vanish quickly, so a picture is taken straight away.
async function act(
  page: Page,
  shot: string,
  action: () => Promise<unknown>,
  ignore: string[] = [],
) {
  const before = await lines(page);
  await action();
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(350);
    if (i === 1)
      await page.screenshot({ path: `${EVIDENCE_DIR}/${shot}-message.png` });
    for (const l of await lines(page))
      if (!before.has(l) && !ignore.includes(l) && !/^Updating/.test(l))
        seen.add(l);
  }
  const found = [...seen].slice(0, 10);
  console.log(`OVERVIEW | ${shot} | message: ${JSON.stringify(found)}`);
  return found.join(" | ");
}

async function bodyText(page: Page) {
  return page.locator("body").innerText();
}

// ---------- Logging in other accounts (their own browser) ----------

async function loginAs(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/(faculty|student)\//);
  await dismissGuides(page, 4000);
  return { context, page };
}

// The student's session is saved once by tests/auth.setup.ts (.auth/student.json), with the Quick Tour
// already skipped, so no test sees the tour or has to log in again. If that file is missing, the
// normal login is used.
const STUDENT_AUTH = ".auth/student.json";
async function loginAsStudent(browser: Browser) {
  if (!fs.existsSync(STUDENT_AUTH))
    return loginAs(browser, STUDENT_EMAIL, STUDENT_PASSWORD);
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL,
    storageState: STUDENT_AUTH,
  });
  const page = await context.newPage();
  await page.goto("/student/course-gate");
  await dismissGuides(page, 1500);
  return { context, page };
}

// The student's course list, filtered to qa_course. Returns where the course is listed.
async function studentSees(page: Page) {
  await page.goto("/student/course-gate");
  await dismissGuides(page, 1500);
  await expect(page.getByText("Available to Join")).toBeVisible();
  await page.getByPlaceholder(/Search title, code/).fill(COURSE);
  await page.waitForTimeout(1500); // the list filters while typing
  const text = await bodyText(page);
  const at = text.search(new RegExp(`\\n${COURSE}\\n`));
  if (at < 0) return "nowhere";
  return at < text.indexOf("Available to Join") ? "enrolled" : "available";
}

// ---------- The Courses page ----------

async function openCourses(page: Page) {
  await page.goto("/faculty/courses");
  await dismissGuides(page, 1200);
  await expect(
    page
      .getByRole("button", { name: "Add Course" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function totals(page: Page) {
  await expect(page.locator("h6").first()).toBeVisible();
  const text = await bodyText(page);
  const courses = text.match(/Courses\s+(\d+)/);
  const archived = text.match(/Archived\s+(\d+)/);
  return {
    courses: courses ? Number(courses[1]) : -1,
    archived: archived ? Number(archived[1]) : -1,
  };
}

const cardOf = (page: Page) =>
  page
    .locator(".MuiCard-root")
    .filter({ has: page.locator("h6").filter({ hasText: exactRe(COURSE) }) });

// Opens the Archived section (the arrow button at the bottom of the page).
async function openArchived(page: Page) {
  const heading = page.getByText(/^Archived\b/).first();
  if (!(await heading.isVisible().catch(() => false))) return;
  const toggle = page.getByRole("button").filter({ hasText: /^$/ }).last();
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.waitForTimeout(1200);
}

// Finds the qa_course card by name; search hides archived courses, so it also looks there.
async function findCard(page: Page) {
  await openCourses(page);
  await page.getByPlaceholder(/Search by title/).fill(COURSE);
  await page.waitForTimeout(1500); // the list filters while typing
  if ((await cardOf(page).count()) > 0) return cardOf(page).first();
  await openArchived(page);
  if ((await cardOf(page).count()) > 0) return cardOf(page).first();
  return null;
}

async function openCourse(page: Page) {
  const card = await findCard(page);
  if (!card) throw new Error("qa_course not found (not even in Archived)");
  await card.locator("h6").click();
  await expect(page.getByText("Course Overview")).toBeVisible();
  // The header badges (Active, Student Activity) can appear a moment after the title on this slow site.
  await expect(page.getByText(/Student Activity:/).first()).toBeVisible({
    timeout: 30_000,
  });
  await dismissGuides(page, 1500);
}

// ---------- Reading the overview ----------

async function tile(page: Page, label: string) {
  const m = (await bodyText(page)).match(new RegExp(`\\n${label}\\n(\\d+)`));
  return m ? Number(m[1]) : -1;
}
async function headerCount(page: Page, what: "Students" | "Questions") {
  const m = (await bodyText(page)).match(new RegExp(`(\\d+) ${what}`));
  return m ? Number(m[1]) : -1;
}
async function headerState(page: Page) {
  // The status word and the "Student Activity: ..." badge are read separately, so an extra line or
  // icon text between them does not break the reading.
  const text = await bodyText(page);
  const status = text.match(/^(Active|Archived)\s*$/m);
  const activity = text.match(/Student Activity: (\w+)/);
  if (status && activity)
    return `${status[1]} | Student Activity: ${activity[1]}`;
  console.log(
    `OVERVIEW | header not recognised, the page text starts: ${JSON.stringify(text.slice(0, 400))}`,
  );
  return "unknown";
}

// ---------- Pop-ups ----------

const dialog = (page: Page) => page.getByRole("dialog").last();

// Closes every open pop-up with its X button (Escape does not close the Manage pop-ups).
// It does not fail: the next step reloads the page anyway.
async function closeDialogs(page: Page) {
  for (let i = 0; i < 4 && (await page.getByRole("dialog").count()) > 0; i++) {
    const x = dialog(page)
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .first();
    await x.click({ timeout: 5000 }).catch(() => page.keyboard.press("Escape"));
    await page.waitForTimeout(700); // the pop-up fades out
    const discard = page.getByRole("button", { name: "Discard" });
    if (await discard.isVisible().catch(() => false)) await discard.click();
  }
}

async function openMembers(page: Page, kind: "students" | "faculty") {
  await page.getByRole("button", { name: `Manage ${kind}` }).click();
  const d = dialog(page);
  await expect(
    d.getByText(kind === "students" ? "Manage Students" : "Manage Faculty"),
  ).toBeVisible();
  await page.waitForTimeout(1200); // the pop-up fades in; clicks during the fade are lost
  return d;
}

const searchBox = (d: Locator) => d.getByPlaceholder(/Search by name/);

async function searchMembers(page: Page, d: Locator, text: string) {
  await searchBox(d).fill(text);
  await page.waitForTimeout(1200); // the list filters while typing
}

// "1–10 of 24" under the table: returns the total (24).
async function listTotal(d: Locator) {
  const t = await d.getByText(/\d+–\d+ of \d+/).innerText();
  return Number(t.match(/of (\d+)/)![1]);
}

async function showTab(
  page: Page,
  d: Locator,
  tab: "All" | "Selected" | "Not Selected",
) {
  await d.getByText(tab, { exact: true }).click();
  await page.waitForTimeout(1000);
}

// The first data row (row 0 is the header row).
const firstRow = (d: Locator) => d.getByRole("row").nth(1);
const rowTick = (row: Locator) => row.locator("input[type=checkbox]").first();

// Ticks (or unticks) people found by searching for them, then presses Update.
async function setMembers(
  page: Page,
  kind: "students" | "faculty",
  people: string[],
  on: boolean,
  shot?: string,
) {
  await openCourse(page);
  const d = await openMembers(page, kind);
  for (const p of people) {
    await searchMembers(page, d, p);
    await expect(d.getByRole("row")).toHaveCount(2);
    if (on) await rowTick(firstRow(d)).check({ force: true });
    else await rowTick(firstRow(d)).uncheck({ force: true });
  }
  const msg = await act(page, shot ?? `update-${kind}`, () =>
    d.getByRole("button", { name: "Update" }).click(),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
  return msg;
}

// The emails of the people in the Selected tab (the owner, whose tick is locked, is left out).
async function selectedEmails(page: Page, kind: "students" | "faculty") {
  const d = await openMembers(page, kind);
  await showTab(page, d, "Selected");
  const emails: string[] = [];
  for (const row of (await d.getByRole("row").all()).slice(1)) {
    if (
      await rowTick(row)
        .isDisabled()
        .catch(() => false)
    )
      continue;
    const m = (await row.innerText()).match(/\S+@\S+/);
    if (m) emails.push(m[0]);
  }
  await closeDialogs(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return emails;
}

async function setMenu(
  page: Page,
  opener: RegExp | string,
  item: RegExp,
  shot: string,
) {
  await page
    .getByText(opener, { exact: typeof opener === "string" })
    .first()
    .click();
  return act(page, shot, () =>
    page.getByRole("menuitem", { name: item }).click(),
  );
}

// Puts qa_course back to plain: Active, Student Activity Enabled, no students, only the owner.
async function resetCourse(page: Page) {
  await openCourse(page);
  if ((await headerState(page)).startsWith("Archived"))
    await setMenu(page, "Archived", /^Active/, "reset-active");
  if ((await headerState(page)).includes("Disabled"))
    await setMenu(page, /Student Activity:/, /Enabled/, "reset-enabled");
  await openCourse(page);
  if ((await headerCount(page, "Students")) > 0) {
    const emails = await selectedEmails(page, "students");
    if (emails.length)
      await setMembers(page, "students", emails, false, "reset-students");
    await openCourse(page);
  }
  if ((await tile(page, "Faculty")) > 1) {
    const emails = await selectedEmails(page, "faculty");
    if (emails.length)
      await setMembers(page, "faculty", emails, false, "reset-faculty");
    await openCourse(page);
  }
  const state = `${await headerState(page)} | ${await headerCount(page, "Students")} students | ${await tile(page, "Faculty")} faculty`;
  console.log(`OVERVIEW | course after reset: ${state}`);
  expect(state).toBe(
    "Active | Student Activity: Enabled | 0 students | 1 faculty",
  );
}

// ---------- Excel files ----------

async function readSheet(file: string) {
  const wb = new ExcelJS.Workbook();
  if (file.endsWith(".csv")) await wb.csv.readFile(file);
  else await wb.xlsx.readFile(file);
  const rows: string[][] = [];
  wb.worksheets[0].eachRow((r) =>
    rows.push(
      (r.values as unknown[]).slice(1).map((v) => {
        const cell = v as { text?: string } | null;
        return String(
          cell && typeof cell === "object" && "text" in cell
            ? cell.text
            : (v ?? ""),
        ).trim();
      }),
    ),
  );
  return rows;
}

async function download(
  page: Page,
  info: TestInfo,
  click: () => Promise<unknown>,
) {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  const file = info.outputPath(d.suggestedFilename());
  await d.saveAs(file);
  console.log(`OVERVIEW | downloaded ${d.suggestedFilename()}`);
  return { file, name: d.suggestedFilename() };
}

// Uploads a file through Bulk Enroll and returns the message and the counts before and after.
// If the site shows a confirm button after reading the file, it is pressed.
async function bulkEnroll(
  page: Page,
  kind: "students" | "faculty",
  file: string,
  id: string,
) {
  const count = () =>
    kind === "students" ? headerCount(page, "Students") : tile(page, "Faculty");
  await openCourse(page);
  const before = await count();
  const d = await openMembers(page, kind);
  await d.getByRole("button", { name: "Bulk Enroll" }).click();
  const bulk = dialog(page);
  await expect(bulk.getByText(/Bulk Enroll (Students|Faculty)/)).toBeVisible();
  await page.waitForTimeout(800); // the pop-up fades in
  let message = await act(
    page,
    id,
    () => bulk.locator("input[type=file]").setInputFiles(file),
    [path.basename(file)],
  );
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", {
      name: /^(enroll|upload|confirm|import|submit|save|add)/i,
    });
  if (
    (await confirm
      .first()
      .isVisible()
      .catch(() => false)) &&
    (await confirm.first().isEnabled())
  ) {
    const label = await confirm.first().innerText();
    message +=
      " || after pressing " +
      JSON.stringify(label) +
      ": " +
      (await act(page, `${id}-confirm`, () => confirm.first().click()));
  }
  await saveEvidence(page, id);
  // Close the pop-ups WITHOUT pressing Update, then read the saved count from a fresh page.
  await closeDialogs(page);
  await openCourse(page);
  const after = await count();
  console.log(
    `OVERVIEW | ${id} | ${path.basename(file)} | ${kind} ${before} -> ${after} | message: ${message}`,
  );
  return { message, before, after };
}

// ======================= Tests =======================

test("OVW-00: clean start (delete any leftover qa_course, create a fresh one)", async ({
  page,
}) => {
  await deleteCourse(page);
  await openCourses(page);
  const t = await totals(page);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(t));
  console.log(`OVERVIEW | baseline: ${JSON.stringify(t)}`);

  await page
    .getByRole("button", { name: "Add Course" })
    .filter({ visible: true })
    .first()
    .click();
  const d = page.getByRole("dialog").first();
  await d.getByPlaceholder("Course title").fill(COURSE);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await openCourse(page);
  expect(await headerState(page)).toBe("Active | Student Activity: Enabled");
  await saveEvidence(page, "OVW-00");
});

test("OVW-01: overview tiles show the right numbers; edit icons and View links work", async ({
  page,
}) => {
  try {
    await openCourse(page);
    const t: Record<string, number> = {};
    for (const label of [
      "Students",
      "Faculty",
      "Student Questions",
      "Bank Questions",
      "Total Questions",
      "Tags",
      "Teams",
      "Contests",
      "Help Requests",
    ])
      t[label] = await tile(page, label);
    console.log(`OVERVIEW | OVW-01 tiles: ${JSON.stringify(t)}`);
    await saveEvidence(page, "OVW-01");
    expect(t["Total Questions"]).toBe(
      t["Student Questions"] + t["Bank Questions"],
    );

    // Edit icons open the right pop-up, and the pop-up agrees with the tile.
    let d = await openMembers(page, "students");
    await showTab(page, d, "Selected");
    expect(await d.getByText("0–0 of 0").isVisible()).toBe(t["Students"] === 0);
    await closeDialogs(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    d = await openMembers(page, "faculty");
    await showTab(page, d, "Selected");
    expect(await listTotal(d)).toBe(t["Faculty"]);
    await closeDialogs(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit tags" }).click();
    await expect(dialog(page).getByText("Edit Course Tags")).toBeVisible();
    await expect(dialog(page).locator("[data-tag-index]")).toHaveCount(
      t["Tags"],
    );
    await closeDialogs(page);

    // View links open the right tab; a new course has nothing in them, like the tiles say.
    const views: [string, RegExp][] = [
      // Not case-sensitive: the Student Questions tab shows "No questions found!" in lower case.
      ["Student Questions", /No Questions Found!/i],
      ["Bank Questions", /No Questions Found!/i],
      ["Teams", /Team/],
      ["Contests", /No Contests Found!/i],
      ["Help Requests", /No Help Requests Found!/i],
    ];
    for (const [label, expected] of views) {
      await openCourse(page);
      await page
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .filter({ has: page.getByText("View", { exact: true }) })
        .last()
        .getByText("View", { exact: true })
        .click();
      // The tab content loads slowly (the first run timed out after 10 s with only the tab bar drawn).
      await expect(page.locator("body")).toContainText(expected, {
        timeout: 30_000,
      });
      await expect(page.getByText("Course Overview")).toHaveCount(0);
      console.log(
        `OVERVIEW | OVW-01 View on "${label}" opened a page with ${expected}`,
      );
      await dismissGuides(page);
      await saveEvidence(page, `OVW-01-view-${label.replace(/ /g, "-")}`);
    }
  } finally {
    await resetCourse(page);
  }
});

test("OVW-02: the header badges match the overview and follow changes", async ({
  page,
}) => {
  try {
    await openCourse(page);
    expect(await headerCount(page, "Students")).toBe(
      await tile(page, "Students"),
    );
    const q = await headerCount(page, "Questions");
    const total = await tile(page, "Total Questions");
    note(
      `OVW-02: header "Questions" badge ${q}, Total Questions tile ${total}. The developer must confirm which number the badge should match (Total, Bank or Student Questions).`,
    );
    expect(q).toBe(total);

    await setMembers(page, "students", [STUDENT_EMAIL], true, "OVW-02-enrol");
    await openCourse(page);
    expect(await headerCount(page, "Students")).toBe(1);
    expect(await tile(page, "Students")).toBe(1);
    await saveEvidence(page, "OVW-02");
    await setMembers(page, "students", [STUDENT_EMAIL], false, "OVW-02-remove");
    await openCourse(page);
    expect(await headerCount(page, "Students")).toBe(0);
    expect(await tile(page, "Students")).toBe(0);
  } finally {
    await resetCourse(page);
  }
});

test("OVW-03: Manage Students tabs All / Selected / Not Selected filter correctly", async ({
  page,
}) => {
  try {
    await setMembers(
      page,
      "students",
      ["Test One", "Test Two"],
      true,
      "OVW-03-enrol",
    );
    await openCourse(page);
    const d = await openMembers(page, "students");
    const all = await listTotal(d);
    await showTab(page, d, "Selected");
    expect(await listTotal(d)).toBe(2);
    await expect(
      d.getByRole("row").filter({ hasText: "Test One" }),
    ).toHaveCount(1);
    await expect(
      d.getByRole("row").filter({ hasText: "Test Two" }),
    ).toHaveCount(1);
    await saveEvidence(page, "OVW-03-selected");
    await showTab(page, d, "Not Selected");
    expect(await listTotal(d)).toBe(all - 2);
    await searchMembers(page, d, "Test One");
    await expect(d.getByText("No rows")).toBeVisible();
    await saveEvidence(page, "OVW-03-not-selected");
    console.log(
      `OVERVIEW | OVW-03 All ${all}, Selected 2, Not Selected ${all - 2}`,
    );
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-04: Manage Students search, rows per page and paging", async ({
  page,
}) => {
  try {
    await openCourse(page);
    const d = await openMembers(page, "students");
    const all = await listTotal(d);
    await expect(d.getByText(`1–${Math.min(10, all)} of ${all}`)).toBeVisible();

    await searchMembers(page, d, "Test");
    expect(await listTotal(d)).toBe(3);
    await searchMembers(page, d, "test_1"); // username of Test One
    await expect(
      d.getByRole("row").filter({ hasText: "Test One" }),
    ).toHaveCount(1);
    await searchMembers(page, d, STUDENT_EMAIL);
    expect(await listTotal(d)).toBe(1);
    await searchMembers(page, d, "zzzz_no_match_qa");
    await expect(d.getByText("No rows")).toBeVisible();
    await saveEvidence(page, "OVW-04-no-match");
    await searchMembers(page, d, "");

    await d
      .getByText("Rows per page:")
      .locator("..")
      .getByRole("combobox")
      .click();
    await expect(page.getByRole("option")).toHaveText(["10", "25", "50"]);
    await page.getByRole("option", { name: "25" }).click();
    await expect(d.getByText(`1–${Math.min(25, all)} of ${all}`)).toBeVisible();
    await saveEvidence(page, "OVW-04-25-rows");

    await d
      .getByText("Rows per page:")
      .locator("..")
      .getByRole("combobox")
      .click();
    await page.getByRole("option", { name: "10" }).click();
    await d.getByRole("button", { name: /next page/i }).click();
    await expect(
      d.getByText(`11–${Math.min(20, all)} of ${all}`),
    ).toBeVisible();
    await saveEvidence(page, "OVW-04-page-2");
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-05: ticking / unticking a student and pressing Update changes the enrolment", async ({
  page,
}) => {
  try {
    await openCourse(page);
    const before = await tile(page, "Students");
    const msg = await setMembers(
      page,
      "students",
      [STUDENT_EMAIL],
      true,
      "OVW-05-enrol",
    );
    expect(msg).toContain("Users Updated Successfully");
    await openCourse(page);
    expect(await tile(page, "Students")).toBe(before + 1);
    await saveEvidence(page, "OVW-05-enrolled");
    const msg2 = await setMembers(
      page,
      "students",
      [STUDENT_EMAIL],
      false,
      "OVW-05-remove",
    );
    expect(msg2).toContain("Users Updated Successfully");
    await openCourse(page);
    expect(await tile(page, "Students")).toBe(before);
    await saveEvidence(page, "OVW-05");
  } finally {
    await resetCourse(page);
  }
});

test("OVW-06: Export Students downloads the enrolled students", async ({
  page,
}, info) => {
  try {
    await openCourse(page);
    let d = await openMembers(page, "students");
    await expect(
      d.getByRole("button", { name: /Export Students/ }),
    ).toBeDisabled(); // nobody enrolled yet
    await closeDialogs(page);

    await setMembers(page, "students", [STUDENT_EMAIL], true, "OVW-06-enrol");
    await openCourse(page);
    d = await openMembers(page, "students");
    const { file, name } = await download(page, info, () =>
      d.getByRole("button", { name: /Export Students/ }).click(),
    );
    await saveEvidence(page, "OVW-06");
    const rows = await readSheet(file);
    console.log(
      `OVERVIEW | OVW-06 ${name}: headers ${JSON.stringify(rows[0])}, ${rows.length - 1} data row(s)`,
    );
    expect(rows[0]).toEqual(["Name", "Username", "Email"]);
    expect(rows.length - 1).toBe(1);
    expect(rows[1][2].toLowerCase()).toBe(STUDENT_EMAIL.toLowerCase());
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-07: Bulk Enroll with a correct XLSX enrols the students", async ({
  page,
}) => {
  try {
    // The sample file must contain emails of students that exist on the site.
    const file = sample("enroll_students_CORRECT.xlsx");
    const rows = (await readSheet(file)).length - 1;
    const r = await bulkEnroll(page, "students", file, "OVW-07");
    expect(r.message, "no message after the upload").not.toBe("");
    expect(r.after).toBe(r.before + rows);
  } finally {
    await resetCourse(page);
  }
});

// OVW-08 is split into one test per file, so every file gets its own result line.
// a) the same correct list saved as .csv and as .xls: both types must be accepted and must enrol the
// same students as the .xlsx (the emails in the sample files must exist on the site).
for (const name of [
  "enroll_students_CORRECT.csv",
  "enroll_students_CORRECT.xls",
]) {
  const ext = name.split(".").pop()!;
  test(`OVW-08a-${ext}: Bulk Enroll accepts a correct .${ext} file and enrols the students`, async ({
    page,
  }) => {
    try {
      const expected =
        (await readSheet(sample("enroll_students_CORRECT.xlsx"))).length - 1;
      const r = await bulkEnroll(
        page,
        "students",
        sample(name),
        `OVW-08a-${ext}`,
      );
      expect
        .soft(r.message, `${name}: the file type was refused`)
        .not.toContain("Invalid File Type");
      expect
        .soft(r.after, `${name}: wrong number of students enrolled`)
        .toBe(r.before + expected);
    } finally {
      await closeDialogs(page);
      await resetCourse(page);
    }
  });
}

// b) fully wrong files: a message, and the student count does not change.
const BULK_WRONG: [string, string, string][] = [
  [
    "enroll_WRONG_no_email_column.xlsx",
    "b-no-email-column",
    "with no email column",
  ],
  ["enroll_WRONG_headers_only.xlsx", "b-headers-only", "with headers only"],
  [
    "enroll_WRONG_unknown_emails.xlsx",
    "b-unknown-emails",
    "with unknown emails",
  ],
  ["enroll_WRONG_empty.xlsx", "b-empty", "that is empty"],
  ["enroll_WRONG_over_10MB.xlsx", "b-over-10MB", "over 10 MB"],
  ["test-wrong-type.txt", "b-wrong-type", "of the wrong type (.txt)"],
];
for (const [name, id, label] of BULK_WRONG) {
  test(`OVW-08${id}: Bulk Enroll refuses a file ${label}`, async ({ page }) => {
    try {
      const file = name.endsWith(".txt")
        ? "test-data/test-wrong-type.txt"
        : sample(name);
      const r = await bulkEnroll(page, "students", file, `OVW-08${id}`);
      expect.soft(r.message, `${name}: no message appeared`).not.toBe("");
      expect
        .soft(r.after, `${name}: students were enrolled from a wrong file`)
        .toBe(r.before);
    } finally {
      await closeDialogs(page);
      await resetCourse(page);
    }
  });
}

// c) files with some good and some bad rows. Accepted behaviour (confirmed by the tester): the site
// shows a preview that counts the bad rows, and after "Enroll Students" saves ONLY the valid ones.
const BULK_PARTLY: [string, string, number, RegExp, string][] = [
  [
    "enroll_WRONG_mixed_real_and_unknown.xlsx",
    "c-mixed",
    2,
    /Invalid \(1\)/,
    "with some real and some unknown emails",
  ],
  [
    "enroll_WRONG_bad_and_duplicate_emails.xlsx",
    "c-bad-and-duplicate",
    1,
    /Duplicate|Ignored/,
    "with bad and duplicate emails",
  ],
];
for (const [name, id, valid, warning, label] of BULK_PARTLY) {
  test(`OVW-08${id}: Bulk Enroll reports the bad rows and saves only the valid ones (file ${label})`, async ({
    page,
  }) => {
    try {
      const r = await bulkEnroll(page, "students", sample(name), `OVW-08${id}`);
      expect
        .soft(r.message, `${name}: the bad rows were not reported`)
        .toMatch(warning);
      expect
        .soft(
          r.after,
          `${name}: only the ${valid} valid email(s) should be saved`,
        )
        .toBe(r.before + valid);
    } finally {
      await closeDialogs(page);
      await resetCourse(page);
    }
  });
}

test("OVW-09: Download Template gives the required email column", async ({
  page,
}, info) => {
  try {
    for (const kind of ["students", "faculty"] as const) {
      await openCourse(page);
      const d = await openMembers(page, kind);
      await d.getByRole("button", { name: "Bulk Enroll" }).click();
      const bulk = dialog(page);
      await expect(bulk.getByText("REQUIRED COLUMNS")).toBeVisible();
      const required = (await bulk.innerText())
        .split("REQUIRED COLUMNS")[1]
        .trim()
        .split(/\s+/);
      const { file, name } = await download(page, info, () =>
        bulk.getByRole("button", { name: "Download Template" }).click(),
      );
      await saveEvidence(page, `OVW-09-${kind}`);
      const rows = await readSheet(file);
      console.log(
        `OVERVIEW | OVW-09 ${kind}: ${name} headers ${JSON.stringify(rows[0])}; required on screen ${JSON.stringify(required)}`,
      );
      expect(rows[0]).toEqual(["email"]);
      expect(rows[0]).toEqual(required);
      await closeDialogs(page);
      await closeDialogs(page);
    }
  } finally {
    await resetCourse(page);
  }
});

test("OVW-10: Manage Faculty: owner locked, role labels, add and remove a faculty member", async ({
  page,
  browser,
}) => {
  let f2: Awaited<ReturnType<typeof loginAs>> | undefined;
  try {
    await openCourse(page);
    expect(await tile(page, "Faculty")).toBe(1);
    const d = await openMembers(page, "faculty");
    const owner = d
      .getByRole("row")
      .filter({ hasText: "Dr. Asad Mansoor Khan" });
    await expect(rowTick(owner)).toBeChecked();
    await expect(rowTick(owner)).toBeDisabled();
    await expect(owner.getByText("HoD")).toBeVisible();
    for (const role of ["HoD", "Senior Faculty", "Junior Faculty"])
      await expect(d.getByText(role, { exact: true }).first()).toBeVisible();
    const switches = d.locator("input[role=switch]");
    const disabled = await switches.evaluateAll(
      (els) => els.filter((e) => (e as HTMLInputElement).disabled).length,
    );
    note(
      `OVW-10: Access toggle: ${disabled} of ${await switches.count()} switches are greyed out. What it should do is unknown (question for the developer).`,
    );
    await saveEvidence(page, "OVW-10-list");
    await closeDialogs(page);

    // The second faculty account is found by its email (two people are called "Dr. Asad").
    const msg = await setMembers(
      page,
      "faculty",
      [FACULTY2_EMAIL],
      true,
      "OVW-10-add",
    );
    expect(msg).toContain("Users Updated Successfully");
    await openCourse(page);
    expect(await tile(page, "Faculty")).toBe(2);
    const d2 = await openMembers(page, "faculty");
    await searchMembers(page, d2, FACULTY2_EMAIL);
    const sw = firstRow(d2).locator("input[role=switch]");
    note(
      `OVW-10: after adding the second faculty, its Access switch is ${(await sw.isDisabled()) ? "still greyed out" : "usable"}.`,
    );
    await saveEvidence(page, "OVW-10-added");
    await closeDialogs(page);

    f2 = await loginAs(browser, FACULTY2_EMAIL, FACULTY2_PASSWORD);
    await f2.page.goto("/faculty/courses");
    await dismissGuides(f2.page, 1500);
    await f2.page.getByPlaceholder(/Search by title/).fill(COURSE);
    await expect(
      f2.page.locator("h6").filter({ hasText: exactRe(COURSE) }),
    ).toBeVisible();
    await f2.page.screenshot({
      path: `${EVIDENCE_DIR}/OVW-10-faculty2-sees-course.png`,
    });

    await setMembers(page, "faculty", [FACULTY2_EMAIL], false, "OVW-10-remove");
    await openCourse(page);
    expect(await tile(page, "Faculty")).toBe(1);
    await saveEvidence(page, "OVW-10");
  } finally {
    await f2?.context.close();
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-10b: a Senior Faculty cannot switch off his own Access", async ({
  page,
  browser,
}) => {
  // Confirmed bug (tester + developer): a Senior Faculty can switch off his own Access switch,
  // press Update and drop himself to Junior level, losing the Manage panel and the edit buttons.
  // Expected: his own switch is locked, like the owner's row.
  let f2: Awaited<ReturnType<typeof loginAs>> | undefined;
  try {
    // The HoD adds the second faculty account (a Senior Faculty) to the course.
    await setMembers(page, "faculty", [FACULTY2_EMAIL], true, "OVW-10b-add");

    // The Senior Faculty opens the course in his own browser and looks at his own row.
    f2 = await loginAs(browser, FACULTY2_EMAIL, FACULTY2_PASSWORD);
    await openCourse(f2.page);
    const d = await openMembers(f2.page, "faculty");
    await searchMembers(f2.page, d, FACULTY2_EMAIL);
    const ownSwitch = firstRow(d).locator("input[role=switch]");
    await expect(ownSwitch).toBeChecked(); // a new member starts with Access on
    await saveEvidence(f2.page, "OVW-10b-before");

    const locked = await ownSwitch.isDisabled();
    if (!locked) {
      // Show what happens when he switches himself off and presses Update.
      await ownSwitch.click({ force: true });
      const msg = await act(f2.page, "OVW-10b-update", () =>
        d.getByRole("button", { name: "Update" }).click(),
      );
      await closeDialogs(f2.page);
      await openCourse(f2.page);
      const stillManages = await f2.page
        .getByRole("button", { name: "Manage Members" })
        .isVisible()
        .catch(() => false);
      await saveEvidence(f2.page, "OVW-10b-after");
      note(
        `OVW-10b: the Senior Faculty switched off his own Access. Message: ${msg}. Manage Members button still visible: ${stillManages}.`,
      );
    }
    expect(locked, "a faculty member can switch off his own Access").toBe(true);
  } finally {
    await f2?.context.close();
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-11: Faculty export and bulk enrol behave like the students' ones", async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  try {
    // a) export: columns and the owner's role
    await openCourse(page);
    const d = await openMembers(page, "faculty");
    const { file, name } = await download(page, info, () =>
      d.getByRole("button", { name: "Export Faculty" }).click(),
    );
    const rows = await readSheet(file);
    console.log(
      `OVERVIEW | OVW-11 ${name}: headers ${JSON.stringify(rows[0])}, ${rows.length - 1} data row(s)`,
    );
    expect(rows[0]).toEqual(["Name", "Email", "Role"]);
    expect(rows.length - 1).toBe(1);
    // The export shows the course owner's role as "admin" (confirmed with the developer),
    // while the screen shows the person's account role (HoD).
    expect(rows[1][2]).toBe("admin");
    await saveEvidence(page, "OVW-11-export");
    await closeDialogs(page);

    // b) a correct file
    const correct = sample("enroll_faculty_CORRECT.xlsx");
    const n = (await readSheet(correct)).length - 1;
    const r = await bulkEnroll(page, "faculty", correct, "OVW-11b-correct");
    expect.soft(r.message, "no message after the upload").not.toBe("");
    expect.soft(r.after).toBe(r.before + n);
    await resetCourse(page);

    // c) wrong files: a message and no change
    for (const [fname, id] of [
      ["enroll_faculty_WRONG_no_email_column.xlsx", "c-no-email-column"],
      ["enroll_faculty_WRONG_unknown_emails.xlsx", "c-unknown-emails"],
    ]) {
      const w = await bulkEnroll(page, "faculty", sample(fname), `OVW-11${id}`);
      expect.soft(w.message, `${fname}: no message appeared`).not.toBe("");
      expect
        .soft(w.after, `${fname}: faculty were added from a wrong file`)
        .toBe(w.before);
      if (w.after !== w.before) await resetCourse(page);
    }
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-12: the Manage Members menu opens the same Students / Faculty screens", async ({
  page,
}) => {
  try {
    for (const [item, heading] of [
      ["Students", "Manage Students"],
      ["Faculty", "Manage Faculty"],
    ]) {
      await openCourse(page);
      await page.getByText("Manage Members").click();
      await page
        .getByRole("menuitem", { name: new RegExp(`^${item}`) })
        .click();
      await expect(dialog(page).getByText(heading)).toBeVisible();
      await expect(
        dialog(page).getByRole("button", { name: "Bulk Enroll" }),
      ).toBeVisible();
      await saveEvidence(page, `OVW-12-${item.toLowerCase()}`);
      await closeDialogs(page);
    }
  } finally {
    await resetCourse(page);
  }
});

test("OVW-13: Edit Course Tags saves the tags and the Tags count follows", async ({
  page,
}) => {
  try {
    await openCourse(page);
    const before = await tile(page, "Tags");
    await page.getByRole("button", { name: "Edit tags" }).click();
    const d = dialog(page);
    await page.waitForTimeout(800); // the pop-up fades in
    const box = d.getByPlaceholder(/Type and press/);
    await box.fill("qa_ovw_tag1");
    await box.press("Enter");
    await box.fill("qa_ovw_tag2");
    await box.press("Space");
    const msg = await act(page, "OVW-13-add", () =>
      d.getByRole("button", { name: "Update" }).click(),
    );
    expect(msg).toContain("Course Tags Updated");
    await page.reload();
    await dismissGuides(page);
    await expect(page.getByText("Course Overview")).toBeVisible();
    expect(await tile(page, "Tags")).toBe(before + 2);
    await saveEvidence(page, "OVW-13-added");

    await page.getByRole("button", { name: "Edit tags" }).click();
    await page.waitForTimeout(800); // the pop-up fades in
    const chips = dialog(page).locator("[data-tag-index]");
    await chips
      .filter({ hasText: "qa_ovw_tag1" })
      .locator("svg")
      .first()
      .click();
    await act(page, "OVW-13-remove", () =>
      dialog(page).getByRole("button", { name: "Update" }).click(),
    );
    await page.reload();
    await expect(page.getByText("Course Overview")).toBeVisible();
    expect(await tile(page, "Tags")).toBe(before + 1);
    await saveEvidence(page, "OVW-13");
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

test("OVW-14: Edit Description is saved and still there after refresh", async ({
  page,
}) => {
  try {
    await openCourse(page);
    await page.getByRole("button", { name: "Edit Description" }).click();
    await page.waitForTimeout(800); // the pop-up fades in
    await dialog(page)
      .getByPlaceholder("Enter course description")
      .fill("qa_ovw_description");
    const msg = await act(page, "OVW-14-save", () =>
      dialog(page).getByRole("button", { name: "Update" }).click(),
    );
    expect(msg).toContain("Description Updated Successfully");
    await page.reload();
    await expect(page.getByText("Course Overview")).toBeVisible();
    await dismissGuides(page);
    await page.getByRole("button", { name: "Edit Description" }).click();
    await expect(
      dialog(page).getByPlaceholder("Enter course description"),
    ).toHaveValue("qa_ovw_description");
    await saveEvidence(page, "OVW-14");

    // Observation: an empty description.
    await dialog(page).getByPlaceholder("Enter course description").fill("");
    const empty = await act(page, "OVW-14-empty", () =>
      dialog(page).getByRole("button", { name: "Update" }).click(),
    );
    note(`OVW-14: saving an EMPTY description gives: ${JSON.stringify(empty)}`);
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

async function postHoc(page: Page, file: string, id: string) {
  await openCourse(page);
  await page.getByRole("button", { name: "Post Hoc Analysis" }).click();
  await expect(dialog(page).getByText("Template Format")).toBeVisible();
  await page.waitForTimeout(800); // the pop-up fades in
  const msg = await act(
    page,
    id,
    () => dialog(page).locator("input[type=file]").setInputFiles(file),
    [path.basename(file)],
  );
  await page.waitForTimeout(2000); // the analysis may take a moment to draw
  await saveEvidence(page, id);
  const shown = (await bodyText(page)).replace(/\s+/g, " ");
  console.log(`OVERVIEW | ${id} | ${path.basename(file)} | message: ${msg}`);
  return { msg, shown };
}

const ERROR_TEXT =
  /invalid|error|failed|no question data|not found|missing|empty|wrong|unable|please/i;

test("OVW-15: Post Hoc Analysis with a correct Excel file shows an analysis", async ({
  page,
}) => {
  try {
    for (const name of ["posthoc_CORRECT.xlsx", "posthoc_CORRECT.xls"]) {
      const id = `OVW-15-${name.split(".").pop()}`;
      const r = await postHoc(page, sample(name), id);
      console.log(
        `OVERVIEW | ${id} what the page shows: ${r.shown.slice(0, 600)}`,
      );
      expect
        .soft(r.msg, `${name}: an error message appeared`)
        .not.toMatch(ERROR_TEXT);
      expect.soft(r.msg, `${name}: nothing new was shown`).not.toBe("");
      await closeDialogs(page);
    }
  } finally {
    await closeDialogs(page);
    await resetCourse(page);
  }
});

// OVW-16 is split into one test per file, so every file gets its own result line.
// A wrong file must never produce an analysis. Known bugs: a file without the key row (the first
// student row is used as the key, so one participant is lost) and a .csv (the pop-up says
// ".xlsx / .xls" only) are both accepted.
const POSTHOC_WRONG: [string, string, string][] = [
  [
    "posthoc_WRONG_no_question_columns.xlsx",
    "no-question-columns",
    "with no question columns",
  ],
  [
    "posthoc_WRONG_no_student_rows.xlsx",
    "no-student-rows",
    "with no student rows",
  ],
  ["posthoc_WRONG_no_key_row.xlsx", "no-key-row", "with no answer-key row"],
  ["posthoc_WRONG_empty.xlsx", "empty", "that is empty"],
  ["posthoc_WRONG_type.csv", "type-csv", "of the wrong type (.csv)"],
  ["test-wrong-type.txt", "type-txt", "of the wrong type (.txt)"],
];
for (const [name, id, label] of POSTHOC_WRONG) {
  test(`OVW-16-${id}: Post Hoc Analysis gives an error for a file ${label}`, async ({
    page,
  }) => {
    try {
      const file = name.endsWith(".txt")
        ? "test-data/test-wrong-type.txt"
        : sample(name);
      const r = await postHoc(page, file, `OVW-16-${id}`);
      expect.soft(r.msg, `${name}: no message appeared`).not.toBe("");
      expect
        .soft(r.msg, `${name}: a wrong file was accepted ("Analysis ready")`)
        .not.toContain("Analysis ready");
      if (id === "type-txt" && /No Question Data Found/i.test(r.msg))
        note(
          `OVW-16: a .txt file gives "${r.msg}" instead of a wrong-file-type message.`,
        );
    } finally {
      await closeDialogs(page);
      await resetCourse(page);
    }
  });
}

test("OVW-17: an archived course is hidden from the student; Active brings it back", async ({
  page,
  browser,
}) => {
  let stu: Awaited<ReturnType<typeof loginAs>> | undefined;
  try {
    await setMembers(page, "students", [STUDENT_EMAIL], true, "OVW-17-enrol");
    stu = await loginAsStudent(browser);
    expect(await studentSees(stu.page)).toBe("enrolled");

    await openCourse(page);
    const msg = await setMenu(page, "Active", /Archived/, "OVW-17-archive");
    expect(msg).toContain("Course Archived Successfully");
    expect(await headerState(page)).toMatch(/^Archived/);
    expect(await studentSees(stu.page)).toBe("nowhere");
    await stu.page.screenshot({
      path: `${EVIDENCE_DIR}/OVW-17-student-archived.png`,
    });

    await openCourse(page);
    const msg2 = await setMenu(page, "Archived", /^Active/, "OVW-17-activate");
    expect(msg2).toContain("Course Activated Successfully");
    expect(await studentSees(stu.page)).toBe("enrolled");
    await stu.page.screenshot({ path: `${EVIDENCE_DIR}/OVW-17.png` });
  } finally {
    await stu?.context.close();
    await resetCourse(page);
  }
});

test("OVW-18: Student Activity Enabled to Disabled and back", async ({
  page,
  browser,
}) => {
  let stu: Awaited<ReturnType<typeof loginAs>> | undefined;
  try {
    await setMembers(page, "students", [STUDENT_EMAIL], true, "OVW-18-enrol");
    stu = await loginAsStudent(browser);
    expect(await studentSees(stu.page)).toBe("enrolled");

    // a) Student Activity ENABLED: clicking the enrolled course must open it.
    // Known bug: the student is sent back to the student dashboard and the course never opens.
    await stu.page.getByText(COURSE, { exact: true }).first().click();
    await stu.page.waitForTimeout(5000); // the site may load the course and then send the student back
    await dismissGuides(stu.page, 1500);
    await stu.page.screenshot({
      path: `${EVIDENCE_DIR}/OVW-18-student-enabled.png`,
      fullPage: true,
    });
    const pathEnabled = new URL(stu.page.url()).pathname;
    console.log(
      `OVERVIEW | OVW-18 Enabled: the student's click on qa_course ends on ${pathEnabled}`,
    );
    expect
      .soft(
        pathEnabled,
        "the enrolled course did not open (the student is back on the dashboard)",
      )
      .not.toMatch(/\/student\/dashboard/);

    // b) Student Activity DISABLED on the faculty side.
    await openCourse(page);
    const msg = await setMenu(
      page,
      /Student Activity:/,
      /Disabled/,
      "OVW-18-disable",
    );
    expect(msg).toContain("Student Activity Disabled Successfully");
    await expect(page.getByText("Student Activity: Disabled")).toBeVisible();
    await saveEvidence(page, "OVW-18-faculty");

    // What the student sees now is recorded only: "read-only" cannot be checked while the course
    // does not open at all (blocked by the bug above).
    expect(await studentSees(stu.page)).toBe("enrolled");
    await stu.page.getByText(COURSE, { exact: true }).first().click();
    await stu.page.waitForTimeout(5000);
    await dismissGuides(stu.page, 1500);
    await stu.page.screenshot({
      path: `${EVIDENCE_DIR}/OVW-18-student.png`,
      fullPage: true,
    });
    const text = (await bodyText(stu.page)).replace(/\s+/g, " ").slice(0, 400);
    note(
      `OVW-18 (blocked): with Student Activity Disabled, the student opening qa_course goes to ${new URL(stu.page.url()).pathname}. Read-only could not be checked. Page text: ${text}`,
    );

    await openCourse(page);
    const msg2 = await setMenu(
      page,
      /Student Activity:/,
      /Enabled/,
      "OVW-18-enable",
    );
    expect(msg2).toContain("Student Activity Enabled Successfully");
    await expect(page.getByText("Student Activity: Enabled")).toBeVisible();
  } finally {
    await stu?.context.close();
    await resetCourse(page);
  }
});

test("OVW-19: the join code can be copied and a student joins with it", async ({
  page,
  browser,
}) => {
  let stu: Awaited<ReturnType<typeof loginAs>> | undefined;
  try {
    // a) copy
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await openCourse(page);
    const code = (await bodyText(page)).match(/JOIN CODE:\s*(\S+)/)![1];
    await page.getByRole("button", { name: "Copy join code" }).click();
    await expect(page.getByText("Copied")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE_DIR}/OVW-19a.png` });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      code,
    );

    // b) the student joins with it
    stu = await loginAsStudent(browser);
    const sp = stu.page;
    const where = await studentSees(sp);
    if (where === "available")
      note(
        'OVW-19: the student sees qa_course under "Available to Join" without being invited.',
      );
    expect(where).toBe("available");
    const openJoin = async () => {
      await studentSees(sp);
      await sp.getByText(COURSE, { exact: true }).first().click();
      await expect(sp.getByPlaceholder("e.g. A1B2C3D4E5")).toBeVisible();
      await sp.waitForTimeout(800); // the pop-up fades in
    };
    const codeBox = sp.getByPlaceholder("e.g. A1B2C3D4E5");
    const join = sp.getByRole("button", { name: "Join Course" });

    await openJoin();
    await codeBox.fill("ABC");
    await expect(join).toBeDisabled(); // a code that is too short cannot be sent

    // ONE wrong code only (the site counts attempts).
    await codeBox.fill("ZZZZ999999");
    const wrong = await act(sp, "OVW-19b-wrong-code", () => join.click());
    expect(wrong).toContain("Invalid enrollment code.");
    const left = Number(
      ((await bodyText(sp)).match(/(\d+) left/) ?? [])[1] ?? -1,
    );
    console.log(
      `OVERVIEW | OVW-19 attempts left after one wrong code: ${left}`,
    );
    if (left === 0 || /blocked|locked|too many/i.test(wrong))
      throw new Error(
        `the student is out of join attempts or blocked: ${wrong}`,
      );

    await closeDialogs(sp);
    await openJoin();
    await codeBox.fill(code);
    const ok = await act(sp, "OVW-19b-right-code", () => join.click());
    expect(ok).toContain("Joined Course Successfully");
    expect(await studentSees(sp)).toBe("enrolled");
    await sp.screenshot({ path: `${EVIDENCE_DIR}/OVW-19b-student.png` });

    await openCourse(page);
    expect(await headerCount(page, "Students")).toBe(1);
    const d = await openMembers(page, "students");
    await showTab(page, d, "Selected");
    await expect(
      d.getByRole("row").filter({ hasText: STUDENT_EMAIL }),
    ).toHaveCount(1);
    await saveEvidence(page, "OVW-19b");
    await closeDialogs(page);
  } finally {
    await stu?.context.close();
    await resetCourse(page);
  }
});

test("OVW-20: Watch Guide opens the video and it can be closed", async ({
  page,
}) => {
  try {
    await openCourse(page);
    await page.getByText("Watch Guide").click();
    await expect(page.getByText("Course Workspace")).toBeVisible();
    await expect(page.getByText(/STEP 1 OF \d+/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible(); // it is playing
    await saveEvidence(page, "OVW-20");
    await page.getByRole("button", { name: "Close guide" }).click();
    await expect(page.getByText("Course Workspace")).toBeHidden();
  } finally {
    await resetCourse(page);
  }
});

// ---------- Delete qa_course ----------

async function deleteCourse(page: Page) {
  for (let round = 0; round < 3; round++) {
    const card = await findCard(page);
    if (!card) return;
    const raw = (await card.locator("h6").first().textContent()) ?? COURSE;
    await card.scrollIntoViewIfNeeded();
    await card
      .locator("button[aria-haspopup='menu']")
      .first()
      .click({ force: true });
    await page.getByRole("menuitem", { name: /Delete Course/ }).click();
    await page.getByRole("textbox", { name: /Type/ }).fill(raw.trim());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /Type/ })).toBeHidden({
      timeout: 20_000,
    });
    console.log(`CLEANUP | deleted "${raw.trim()}"`);
  }
}

test("OVW-99: delete qa_course, then the course numbers are back to the start", async ({
  page,
}) => {
  await deleteCourse(page);
  expect(await findCard(page)).toBeNull();
  await openCourses(page);
  const after = await totals(page);
  await saveEvidence(page, "OVW-cleanup");
  console.log(`OVERVIEW | after clean-up: ${JSON.stringify(after)}`);
  const start = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  expect(after).toEqual(start);
});
