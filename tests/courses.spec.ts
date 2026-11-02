import { test, expect, Page, Browser, Locator } from "@playwright/test";
import fs from "fs";
import path from "path";

// Courses module (Courses list and Add Course) - test IDs match the testing plan (section 4.3).
// Screenshots are saved to evidence/courses/ for the results report.
// The session comes from tests/auth.setup.ts (.auth/faculty.json).
//
// Everything the data tests create has a title containing qa_crs_ and is deleted at the end
// (and also at the start, in case an earlier run stopped halfway). Nothing else is ever deleted.
// The data tests do NOT depend on each other: each one creates what it needs if it is missing,
// so one failed test cannot skip the rest.

const AUTH_FILE = ".auth/faculty.json";
const EVIDENCE_DIR = "evidence/courses";
const PREFIX = "qa_crs_";
const TEST_DATA = path.resolve("test-data");

const TITLE_ONLY = "qa_crs_title_only";
const FULL = "qa_crs_full";
const FULL_DESCRIPTION = "qa_crs_description_text";
const JPG_COURSE = "qa_crs_jpg";
const OWNER_CHECK = "qa_crs_owner_check";
const ARCHIVED = "qa_crs_archived";
const DOUBLE = "qa_crs_double";
const DISABLED = "qa_crs_disabled";

const DUPLICATE_TOAST =
  /A Course With This Name Already Exists In Your Institution/i;

test.use({ storageState: AUTH_FILE });

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Small helpers ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactRe = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

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

async function openCourses(page: Page) {
  await page.goto("/faculty/courses");
  await dismissGuides(page, 1200);
  await expect(
    page
      .getByRole("button", { name: "Add Course" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.locator("h6").first()).toBeVisible(); // the course cards have loaded
}

async function search(page: Page, text: string) {
  await page.getByPlaceholder(/Search by title/).fill(text);
  await page.waitForTimeout(1200); // the list filters while typing
}

// The card of a course: the card block that holds an <h6> with this title.
const cardOf = (page: Page, title: string | RegExp) =>
  page
    .locator(".MuiCard-root")
    .filter({ has: page.locator("h6").filter({ hasText: title }) });

// The three numbers on a card (the site names them Faculty, Questions and Students).
async function cardNumber(
  card: Locator,
  label: "Faculty" | "Questions" | "Students",
) {
  return Number(
    (await card.locator(`[aria-label='${label}']`).innerText()).trim(),
  );
}

// The numbers next to the "Courses" heading and the "Archived" section.
async function totals(page: Page) {
  const text = await page.locator("body").innerText();
  const courses = text.match(/Courses\s+(\d+)/);
  const archived = text.match(/Archived\s+(\d+)/);
  return {
    courses: courses ? Number(courses[1]) : -1,
    archived: archived ? Number(archived[1]) : -1,
  };
}

// Opens the Archived section (the arrow button at the bottom of the page).
async function openArchived(page: Page) {
  // With no Archived section on screen, the last unnamed button is a course's ⋮ menu: do not click it.
  const heading = page.getByText(/^Archived\b/).first();
  if (!(await heading.isVisible().catch(() => false))) return;
  const toggle = page.getByRole("button").filter({ hasText: /^$/ }).last();
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.waitForTimeout(1200);
}

// ---------- The Add Course form ----------

async function openForm(page: Page) {
  await openCourses(page);
  await page
    .getByRole("button", { name: "Add Course" })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog.getByPlaceholder("Course title")).toBeVisible();
  await page.waitForTimeout(500);
  return dialog;
}

// Picks people in the Select Faculty / Select Students pop-up and presses Continue.
async function pickPeople(
  page: Page,
  dialog: Locator,
  kind: "Faculty" | "Students",
  names: string[],
) {
  // "Students" is also the small label above the box, so the box is the last one.
  if (kind === "Faculty")
    await dialog.getByText("Faculty", { exact: true }).first().click();
  else await dialog.getByText("Students", { exact: true }).last().click();
  const picker = page.getByRole("dialog").last();
  await expect(
    page.getByRole("heading", { name: `Select ${kind}` }),
  ).toBeVisible();
  for (const name of names) await tick(picker, name);
  await picker.getByRole("button", { name: /continue/i }).click();
  await expect(
    page.getByRole("heading", { name: `Select ${kind}` }),
  ).toBeHidden();
}

// The tick box that sits in the same row as a person's name.
function tickBox(picker: Locator, name: string) {
  return picker
    .locator("p")
    .filter({ hasText: exactRe(name) })
    .locator("xpath=following-sibling::span//input[@type='checkbox']");
}
async function tick(picker: Locator, name: string) {
  await tickBox(picker, name).check({ force: true });
}

async function addTag(
  dialog: Locator,
  text: string,
  key: "Enter" | "Space" = "Enter",
) {
  const box = dialog.getByPlaceholder(/Type and press space or enter/);
  await box.fill(text);
  await box.press(key);
}

type CourseSpec = {
  title: string;
  faculty?: string[];
  students?: string[];
  image?: string;
  tags?: string[];
  archived?: boolean;
  disableStudentActivity?: boolean;
  description?: string;
};

// Fills the form (it does not press Save).
async function fillForm(page: Page, dialog: Locator, c: CourseSpec) {
  await dialog.getByPlaceholder("Course title").fill(c.title);
  if (c.faculty?.length) await pickPeople(page, dialog, "Faculty", c.faculty);
  if (c.students?.length)
    await pickPeople(page, dialog, "Students", c.students);
  if (c.image)
    await dialog
      .locator("input[type=file]")
      .setInputFiles(path.join(TEST_DATA, c.image));
  for (const t of c.tags ?? []) await addTag(dialog, t);
  if (c.archived) {
    // The Status box is a drop-down: focus it, open it with the arrow key, pick the option.
    await dialog.locator("input[aria-haspopup='true']").focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("option", { name: "Archived" }).click();
  }
  if (c.disableStudentActivity)
    await dialog.getByText("Disable Student Activity").click();
  if (c.description)
    await dialog.getByPlaceholder("Description").fill(c.description);
}

const saveButton = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Save", exact: true });

// Creates a course through the form. Returns once the form has closed.
async function createCourse(page: Page, c: CourseSpec) {
  const dialog = await openForm(page);
  await fillForm(page, dialog, c);
  await saveButton(dialog).click();
  await page.waitForTimeout(1500);
  const slugNow = c.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  await page.screenshot({ path: `${EVIDENCE_DIR}/after-save-${slugNow}.png` });
  const alerts = await page
    .getByRole("alert")
    .allInnerTexts()
    .catch(() => []);
  if (alerts.length)
    console.log(
      `COURSES | message right after Save for "${c.title}": ${JSON.stringify(alerts)}`,
    );
  try {
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  } catch (e) {
    // The form did not close: keep a picture and the page text so we can see why.
    const slug = c.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    await page.screenshot({ path: `${EVIDENCE_DIR}/form-stuck-${slug}.png` });
    const text = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .slice(0, 500);
    console.log(
      `COURSES | form did not close after Save for "${c.title}". Page text: ${text}`,
    );
    throw e;
  }
}

// Closes the form with the X. If the site asks "Discard Changes?", it presses Discard.
async function closeForm(page: Page) {
  const dialog = page.getByRole("dialog").first();
  await dialog.getByRole("button").filter({ hasText: /^$/ }).first().click();
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  else {
    await page.waitForTimeout(600);
    if (await discard.isVisible().catch(() => false)) await discard.click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

// Makes sure a course exists. Creates it if it is missing (so tests do not depend on each other).
async function ensureCourse(page: Page, c: CourseSpec) {
  await openCourses(page);
  await search(page, c.title);
  if ((await cardOf(page, exactRe(c.title)).count()) > 0) return;
  await createCourse(page, c);
}

const FULL_SPEC: CourseSpec = {
  title: FULL,
  faculty: ["Umar Ahmad"],
  students: ["Test One", "Test Two"],
  image: "test-small.png",
  tags: ["qa_tag_one", "qa_tag_two"],
  description: FULL_DESCRIPTION,
};

// ---------- Delete everything we created ----------

async function cleanUp(browser: Browser) {
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    baseURL: process.env.BASE_URL,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000); // a missing item must fail fast
  page.setDefaultNavigationTimeout(30_000);

  let deleted = 0;
  for (let round = 0; round < 25; round++) {
    let removedOne = false;
    try {
      await page.goto("/faculty/courses");
      await dismissGuides(page, 800);
      await page.getByPlaceholder(/Search by title/).fill(PREFIX);
      await page.waitForTimeout(1500);
      // A course created with the Archived status lives in the Archived section.
      try {
        await openArchived(page);
      } catch {
        /* no Archived section on screen: nothing to open */
      }
      const ours = cardOf(page, /qa_crs_/i);
      const n = await ours.count();
      if (n === 0) break;

      // Try the cards one by one: if one cannot be deleted, move on to the next.
      for (let i = 0; i < n && !removedOne; i++) {
        const card = ours.nth(i);
        const raw = (await card.locator("h6").first().textContent()) ?? "";
        try {
          await card.scrollIntoViewIfNeeded();
          await card
            .locator("button[aria-haspopup='menu']")
            .first()
            .click({ force: true });
          await page.getByRole("menuitem", { name: /Delete Course/ }).click();
          // The site asks to type the exact name. Try the name as stored, then without outer spaces.
          for (const name of [raw, raw.trim()]) {
            await page.getByRole("textbox", { name: /Type/ }).fill(name);
            await page
              .getByRole("button", { name: "Delete", exact: true })
              .click();
            await page.waitForTimeout(1500);
            if (
              !(await page
                .getByRole("textbox", { name: /Type/ })
                .isVisible()
                .catch(() => false))
            )
              break;
          }
          if (
            await page
              .getByRole("textbox", { name: /Type/ })
              .isVisible()
              .catch(() => false)
          ) {
            throw new Error(
              "the delete box is still open (name not accepted?)",
            );
          }
          removedOne = true;
          deleted++;
          console.log(`CLEANUP | deleted "${raw.trim().slice(0, 60)}"`);
        } catch (e) {
          console.log(
            `CLEANUP | could not delete "${raw.trim().slice(0, 60)}": ${String((e as Error).message).split("\n")[0]}`,
          );
          await page
            .screenshot({
              path: `${EVIDENCE_DIR}/cleanup-problem-${round}-${i}.png`,
            })
            .catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {
      console.log(
        `CLEANUP | round ${round} stopped: ${String((e as Error).message).split("\n")[0]}`,
      );
      break;
    }
    if (!removedOne) break;
  }
  console.log(`CLEANUP | ${deleted} course(s) deleted`);
  await context.close();
}

const BASELINE_FILE = `${EVIDENCE_DIR}/baseline.json`;

// ======================= Read-only tests =======================

test.describe("Courses - list (read only)", () => {
  test.beforeEach(async ({ page }) => {
    await openCourses(page);
  });

  test("CRS-01: the Courses page loads, cards show the role badge and the counts", async ({
    page,
  }) => {
    const cards = page
      .locator(".MuiCard-root")
      .filter({ has: page.locator("h6") });
    await expect(cards).toHaveCount(8); // one page shows 8 courses
    for (const card of await cards.all()) {
      await expect(card.getByText("Owner", { exact: true })).toBeVisible();
      for (const label of ["Faculty", "Questions", "Students"] as const) {
        expect(await cardNumber(card, label)).toBeGreaterThanOrEqual(0);
      }
    }
    // The first course, anatomy5, has 2 faculty, 1 question and 3 students (as seen by hand).
    const anatomy5 = cardOf(page, exactRe("anatomy5"));
    expect([
      await cardNumber(anatomy5, "Faculty"),
      await cardNumber(anatomy5, "Questions"),
      await cardNumber(anatomy5, "Students"),
    ]).toEqual([2, 1, 3]);

    // The number next to "Courses" is the active courses plus the archived ones.
    const t = await totals(page);
    await page.getByRole("button", { name: "Go to page 2" }).click();
    await page.waitForTimeout(1000);
    const page2 = await page.locator("h6").count();
    expect(8 + page2 + t.archived).toBe(t.courses);
    await saveEvidence(page, "CRS-01");
  });

  test("CRS-02: the grid and list views show the same courses", async ({
    page,
  }) => {
    const gridTitles = await page.locator("h6").allInnerTexts();
    expect(gridTitles.length).toBe(8);

    await page.getByRole("button", { name: "List view" }).click();
    await page.waitForTimeout(1500);
    // The list view does not use <h6>, so look for each title as text.
    for (const title of gridTitles)
      await expect(
        page.getByText(title, { exact: true }).first(),
      ).toBeVisible();
    await saveEvidence(page, "CRS-02-list");

    await page.getByRole("button", { name: "Grid view" }).click();
    await page.waitForTimeout(1000);
    expect(await page.locator("h6").allInnerTexts()).toEqual(gridTitles);
    await saveEvidence(page, "CRS-02-grid");
  });

  test("CRS-03: filter by role shows only the matching courses", async ({
    page,
  }) => {
    const choose = async (option: string) => {
      await page.locator("#react-select-2-input").click({ force: true });
      await page.getByRole("option", { name: option }).click();
      await page.waitForTimeout(1500);
    };

    await choose("Owner");
    const cards = page
      .locator(".MuiCard-root")
      .filter({ has: page.locator("h6") });
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all())
      await expect(card.getByText("Owner", { exact: true })).toBeVisible();
    await saveEvidence(page, "CRS-03-owner");

    // This account owns every course, so the other two filters can only show their empty message.
    await openCourses(page);
    await choose("Manager");
    await expect(page.getByText("No Managed Course Found")).toBeVisible();
    await saveEvidence(page, "CRS-03-manager");

    await openCourses(page);
    await choose("Collaborator");
    await expect(page.getByText("No Shared Course Found")).toBeVisible();
    await saveEvidence(page, "CRS-03-collaborator");
  });

  test("CRS-04: search by title, and the message when nothing matches", async ({
    page,
  }) => {
    await search(page, "anatomy");
    const titles = await page.locator("h6").allInnerTexts();
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t.toLowerCase()).toContain("anatomy");
    await expect(
      page.locator("h6").filter({ hasText: exactRe("anatomy5") }),
    ).toBeVisible();
    await saveEvidence(page, "CRS-04-title");

    await search(page, "zzzz_no_match_qa");
    await expect(page.getByText(/No Results Found For/i)).toBeVisible();
    await saveEvidence(page, "CRS-04-no-match");
  });
});

// ======================= Data tests =======================
// They create courses named qa_crs_... and delete them. No retries: a retry would repeat creation.

test.describe("Courses - data tests (create, check, delete)", () => {
  test.setTimeout(150_000);
  test.describe.configure({ retries: 0 });

  test("CRS-00: clean start (delete leftovers, note the starting numbers)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    await cleanUp(browser);
    await openCourses(page);
    const t = await totals(page);
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(t));
    console.log(`COURSES | baseline: ${JSON.stringify(t)}`);
  });

  test("CRS-05: add a course with a title only", async ({ page }) => {
    await createCourse(page, { title: TITLE_ONLY });
    await search(page, TITLE_ONLY);
    const card = cardOf(page, exactRe(TITLE_ONLY));
    await expect(card).toBeVisible();
    await expect(card.getByText("Owner", { exact: true })).toBeVisible();
    // Only the owner is in the course: 1 faculty, 0 questions, 0 students.
    expect([
      await cardNumber(card, "Faculty"),
      await cardNumber(card, "Questions"),
      await cardNumber(card, "Students"),
    ]).toEqual([1, 0, 0]);
    await saveEvidence(page, "CRS-05");
  });

  test("CRS-06: add a course with every field filled", async ({ page }) => {
    const dialog = await openForm(page);
    await fillForm(page, dialog, FULL_SPEC);
    await saveEvidence(page, "CRS-06-form-filled");
    await saveButton(dialog).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    await search(page, FULL);
    const card = cardOf(page, exactRe(FULL));
    await expect(card).toBeVisible();
    // Owner + Umar Ahmad = 2 faculty; Test One + Test Two = 2 students.
    expect([
      await cardNumber(card, "Faculty"),
      await cardNumber(card, "Students"),
    ]).toEqual([2, 2]);
    await saveEvidence(page, "CRS-06-card");

    // The overview of the new course shows what was saved.
    await card.locator("h6").click();
    await dismissGuides(page);
    await saveEvidence(page, "CRS-06-overview");
    console.log(
      `COURSES | CRS-06 overview page text: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600)}`,
    );
    // Tags are shown as a count on the overview.
    await expect
      .soft(page.locator("body"), "tag count not shown on the overview")
      .toContainText(/Tags\s*2/);
    // The description is behind the Edit Description button.
    await page.getByRole("button", { name: /Edit Description/ }).click();
    await page.waitForTimeout(1500);
    await saveEvidence(page, "CRS-06-description");
    const bodyText = await page.locator("body").innerText();
    const fieldValues = await page
      .locator("textarea, input")
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLInputElement).value).join(" "),
      );
    console.log(
      `COURSES | CRS-06 after Edit Description, field values: ${JSON.stringify(fieldValues.slice(0, 200))}`,
    );
    expect
      .soft(bodyText + " " + fieldValues, "the saved description was not found")
      .toContain(FULL_DESCRIPTION);
  });

  test("CRS-04 (description): search finds a course by its description", async ({
    page,
  }) => {
    await ensureCourse(page, FULL_SPEC);
    await openCourses(page);
    await search(page, FULL_DESCRIPTION);
    await expect(cardOf(page, exactRe(FULL))).toBeVisible();
    await expect(cardOf(page, exactRe(TITLE_ONLY))).toHaveCount(0);
    await saveEvidence(page, "CRS-04-description");
  });

  test("CRS-07: an empty title is blocked with a message", async ({ page }) => {
    await openCourses(page);
    const before = await totals(page);
    const dialog = await openForm(page);
    await saveButton(dialog).click();
    await expect(dialog.getByText("Title is required")).toBeVisible();
    await expect(dialog).toBeVisible(); // the form stays open
    await saveEvidence(page, "CRS-07");
    await closeForm(page);
    await openCourses(page);
    expect((await totals(page)).courses).toBe(before.courses);
  });

  // CRS-08: four titles. Each is either saved and shown without breaking the page, or rejected
  // with a message. The test records which one happened (see the console and the notes).
  const titles: [string, string, string][] = [
    ["CRS-08a", "very long title (150 letters)", PREFIX + "L".repeat(150)],
    ["CRS-08b", "special characters", `${PREFIX}<b>&"'%$#@!`],
    ["CRS-08c", "emoji", `${PREFIX}emoji_😀_é`],
    ["CRS-08d", "leading spaces", `   ${PREFIX}lead_space`],
  ];
  for (const [id, what, title] of titles) {
    test(`${id}: title with ${what}`, async ({ page }) => {
      const dialog = await openForm(page);
      await dialog.getByPlaceholder("Course title").fill(title);
      await saveButton(dialog).click();
      await page.waitForTimeout(4000);

      if (
        await page
          .getByRole("dialog")
          .isVisible()
          .catch(() => false)
      ) {
        // Rejected: record the message the site shows.
        const message = (await page.locator("body").innerText())
          .replace(/\s+/g, " ")
          .slice(0, 400);
        console.log(`COURSES | ${id} REJECTED. Page text: ${message}`);
        await saveEvidence(page, `${id}-rejected`);
        test
          .info()
          .annotations.push({
            type: "result",
            description: "rejected by the site",
          });
        await closeForm(page);
        return;
      }

      // Saved: find it and check the page is not broken.
      await search(page, title.trim().slice(0, 40));
      const h6 = page
        .locator("h6")
        .filter({ hasText: title.trim().slice(0, 40) })
        .first();
      await expect(h6).toBeVisible();
      const shown = (await h6.textContent()) ?? "";
      console.log(
        `COURSES | ${id} saved. Typed (${title.length} chars): ${JSON.stringify(title.slice(0, 70))} Shown (${shown.length} chars): ${JSON.stringify(shown.slice(0, 70))}`,
      );
      await saveEvidence(page, id);
      // No sideways scrolling: the layout did not break.
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(wide, "the page got a sideways scroll bar").toBe(false);
      // The text is shown as typed, not read as HTML.
      if (id === "CRS-08b") expect(shown.trim()).toBe(title);
    });
  }

  test("CRS-09: a duplicate title is rejected with a message", async ({
    page,
  }) => {
    await ensureCourse(page, { title: TITLE_ONLY });
    await openCourses(page);
    const before = await totals(page);

    const dialog = await openForm(page);
    await dialog.getByPlaceholder("Course title").fill(TITLE_ONLY);
    await saveButton(dialog).click();
    await expect(page.getByText(DUPLICATE_TOAST)).toBeVisible();
    await expect(dialog).toBeVisible();
    await saveEvidence(page, "CRS-09");
    await closeForm(page);

    await openCourses(page);
    await search(page, TITLE_ONLY);
    await expect(cardOf(page, exactRe(TITLE_ONLY))).toHaveCount(1);
    expect((await totals(page)).courses).toBe(before.courses);
  });

  test("CRS-10: select faculty: search, tick, Select All; the count matches", async ({
    page,
  }) => {
    const dialog = await openForm(page);
    await dialog.getByText("Faculty", { exact: true }).first().click();
    const picker = page.getByRole("dialog").last();
    const counter = picker.getByText(/^\d+\/\d+$/);
    await expect(counter).toHaveText("0/11");

    // Search narrows the list and the counter follows it.
    await picker.getByPlaceholder("Search faculty...").fill("Umar");
    await expect(counter).toHaveText("0/1");
    await expect(
      picker.locator("p").filter({ hasText: "Umar Ahmad" }),
    ).toBeVisible();
    await expect(
      picker.locator("p").filter({ hasText: "Amna Khan" }),
    ).toHaveCount(0);
    await tick(picker, "Umar Ahmad");
    await expect(counter).toHaveText("1/1");
    await picker.getByPlaceholder("Search faculty...").fill("");
    await expect(counter).toHaveText("1/11");

    // Tick one more person: 2 ticked.
    await tick(picker, "Jess");
    await expect(counter).toHaveText("2/11");
    // Select All ticks everybody.
    await picker.locator("input[type=checkbox]").first().check({ force: true });
    await expect(counter).toHaveText("11/11");
    await saveEvidence(page, "CRS-10-select-all");
    // Back to the two people for the final count.
    await picker
      .locator("input[type=checkbox]")
      .first()
      .uncheck({ force: true });
    await expect(counter).toHaveText("0/11");
    await tick(picker, "Umar Ahmad");
    await tick(picker, "Jess");
    await expect(counter).toHaveText("2/11");
    await picker.getByRole("button", { name: /continue/i }).click();

    // The owner is always included: 2 ticked + the owner = 3.
    await expect(dialog).toContainText(/Faculty\s*3\s*\(Owner Included\)/);
    await saveEvidence(page, "CRS-10-form-count");
    await closeForm(page);
  });

  test("CRS-10 (owner): the owner is not offered in the faculty list; ticking another person adds one", async ({
    page,
  }) => {
    // The logged-in account is Dr. Asad Mansoor Khan (HoD, the owner). The list holds the 11 OTHER
    // faculty accounts. "Dr. Asad" in that list is a different person (asad.m.khan12.teacher@gmail.com).
    const dialog = await openForm(page);
    await dialog.getByPlaceholder("Course title").fill(OWNER_CHECK);
    await dialog.getByText("Faculty", { exact: true }).first().click();
    const picker = page.getByRole("dialog").last();
    await expect(
      page.getByRole("heading", { name: "Select Faculty" }),
    ).toBeVisible();
    // The owner must not be offered in the list.
    await expect(
      picker.locator("p").filter({ hasText: exactRe("Dr. Asad Mansoor Khan") }),
    ).toHaveCount(0);
    await tick(picker, "Dr. Asad");
    await picker.getByRole("button", { name: /continue/i }).click();
    await expect(
      page.getByRole("heading", { name: "Select Faculty" }),
    ).toBeHidden();
    // Owner + Dr. Asad = 2.
    await expect(dialog).toContainText(/Faculty\s*2\s*\(Owner Included\)/);
    await saveEvidence(page, "CRS-10-owner-form");
    await saveButton(dialog).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    await search(page, OWNER_CHECK);
    const card = cardOf(page, exactRe(OWNER_CHECK));
    await expect(card).toBeVisible();
    await saveEvidence(page, "CRS-10-owner-card");
    expect(await cardNumber(card, "Faculty")).toBe(2);
  });

  test("CRS-11: select students: search, tick, Select All; the count matches", async ({
    page,
  }) => {
    const dialog = await openForm(page);
    await dialog.getByText("Students", { exact: true }).last().click();
    const picker = page.getByRole("dialog").last();
    const counter = picker.getByText(/^\d+\/\d+$/);
    await expect(counter).toHaveText("0/24");

    // Select All ticks everybody (this is only inside the form; it is not saved).
    await picker.locator("input[type=checkbox]").first().check({ force: true });
    await expect(counter).toHaveText("24/24");
    await saveEvidence(page, "CRS-11-select-all");
    await picker
      .locator("input[type=checkbox]")
      .first()
      .uncheck({ force: true });
    await expect(counter).toHaveText("0/24");

    // Search "Test" finds the three test accounts; tick two of them.
    await picker.getByPlaceholder("Search students...").fill("Test");
    await expect(counter).toHaveText("0/3");
    await tick(picker, "Test One");
    await tick(picker, "Test Two");
    await expect(counter).toHaveText("2/3");
    await picker.getByPlaceholder("Search students...").fill("");
    await expect(counter).toHaveText("2/24");
    await picker.getByRole("button", { name: /continue/i }).click();

    await expect(dialog.getByText(/^2$/).first()).toBeVisible(); // the Students box now shows 2
    await saveEvidence(page, "CRS-11-form-count");
    await closeForm(page);
  });

  test("CRS-12: the course picture (png and jpg) is shown on the card", async ({
    page,
  }) => {
    await ensureCourse(page, FULL_SPEC); // uploaded test-small.png
    await ensureCourse(page, { title: JPG_COURSE, image: "test-small.jpg" });

    // For comparison: the picture of an existing course.
    await openCourses(page);
    // (anatomy5 may have no <img> at all, so this is only for information.)
    const oldImg = cardOf(page, exactRe("anatomy5")).locator("img");
    const oldSrc = (await oldImg.count())
      ? await oldImg.first().getAttribute("src")
      : "no picture";
    console.log(
      `COURSES | CRS-12 picture address of the existing course anatomy5: ${oldSrc}`,
    );

    const results: string[] = [];
    for (const title of [FULL, JPG_COURSE]) {
      await openCourses(page);
      await search(page, title);
      const img = cardOf(page, exactRe(title)).locator("img");
      await expect(img).toHaveCount(1);
      const src = await img.getAttribute("src");
      const loaded = await img.evaluate(
        (e) =>
          (e as HTMLImageElement).complete &&
          (e as HTMLImageElement).naturalWidth > 0,
      );
      console.log(
        `COURSES | CRS-12 ${title}: picture address ${src}; loaded: ${loaded}`,
      );
      results.push(`${title}: ${loaded}`);
      await saveEvidence(page, `CRS-12-${title === FULL ? "png" : "jpg"}`);
      // The picture must really load (known bug F7: it does not).
      expect
        .soft(
          loaded,
          `${title}: the uploaded picture did not load. Address: ${src}`,
        )
        .toBe(true);
    }
  });

  test("CRS-13: a wrong file type and a very large picture are rejected with a message", async ({
    page,
  }) => {
    const files: [string, string][] = [
      ["test-wrong-type.txt", "a text file"],
      ["test-fake-image.png", "a text file named .png"],
      ["test-large.png", "a picture of 12 MB"],
    ];
    for (const [file, what] of files) {
      if (!fs.existsSync(path.join(TEST_DATA, file))) {
        console.log(`COURSES | CRS-13 skipped ${file}: not in test-data/`);
        continue;
      }
      const dialog = await openForm(page);
      const bodyBefore = await page.locator("body").innerText();
      const imagesBefore = await dialog.locator("img").count();
      // The browser's own file picker hides non-pictures, so the file is put straight into the input.
      await dialog
        .locator("input[type=file]")
        .setInputFiles(path.join(TEST_DATA, file));
      // The message is a pop-up that disappears quickly: take the picture straight away.
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${EVIDENCE_DIR}/CRS-13-${file.replace(/\.[a-z]+$/, "")}-message.png`,
      });
      await page.waitForTimeout(2100);
      const bodyAfter = await page.locator("body").innerText();
      const imagesAfter = await dialog.locator("img").count();
      // Compare whole lines (comparing single words hid words already on the page, such as "Image").
      const beforeLines = new Set(bodyBefore.split("\n").map((l) => l.trim()));
      const newText = bodyAfter
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !beforeLines.has(l))
        .join(" | ");
      console.log(
        `COURSES | CRS-13 ${what}: new text on the page: ${JSON.stringify(newText.slice(0, 300))}; pictures in the form ${imagesBefore} -> ${imagesAfter}`,
      );
      await saveEvidence(page, `CRS-13-${file.replace(/\.[a-z]+$/, "")}`);
      // Expected: a message appears and no picture is accepted.
      expect
        .soft(newText, `${what}: no message appeared`)
        .toMatch(
          /invalid|only|support|image|format|type|large|size|exceed|max|MB|allowed|select/i,
        );
      expect
        .soft(
          imagesAfter,
          `${what}: the form accepted it (a picture preview appeared)`,
        )
        .toBe(imagesBefore);
      await closeForm(page);
    }
  });

  test("CRS-14: tags are added with space or Enter and removed", async ({
    page,
  }) => {
    const dialog = await openForm(page);
    const chips = dialog.locator("[data-tag-index]");

    await addTag(dialog, "qa_one", "Enter");
    await addTag(dialog, "qa_two", "Space");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText("qa_one");
    await expect(chips.nth(1)).toHaveText("qa_two");
    await saveEvidence(page, "CRS-14-added");

    // Remove the first tag with its x.
    await chips.nth(0).locator("svg").first().click();
    await expect(chips).toHaveCount(1);
    await expect(chips.nth(0)).toHaveText("qa_two");

    // Extra checks (soft): the same tag twice and a tag of only spaces should not add a tag.
    await addTag(dialog, "qa_two", "Enter");
    await expect.soft(chips, "the same tag was added twice").toHaveCount(1);
    await addTag(dialog, "   ", "Enter");
    await expect
      .soft(chips, "a tag made of only spaces was added (a blank chip)")
      .toHaveCount(1);
    await saveEvidence(page, "CRS-14-extra");

    // The Clear button removes all tags.
    await dialog.getByRole("button", { name: "Clear" }).click();
    await expect(chips).toHaveCount(0);
    await closeForm(page);
  });

  test("CRS-15a: a course can be created with Status Archived", async ({
    page,
  }) => {
    await openCourses(page);
    const before = await totals(page);
    const dialog = await openForm(page);
    await fillForm(page, dialog, { title: ARCHIVED, archived: true });
    await saveButton(dialog).click();
    await page.waitForTimeout(1500);
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const m = text.match(/Course Validation Failed.{0,120}/i);
    const message = m ? m[0] : "no error message seen";
    console.log(
      `COURSES | CRS-15a message after Save with Status Archived: ${message}`,
    );
    await saveEvidence(page, "CRS-15a-message");
    const closed = (await page.getByRole("dialog").count()) === 0;
    if (!closed) await closeForm(page);
    expect(
      closed,
      `the Archived course was not saved. Site message: ${message}`,
    ).toBe(true);

    // (only reached when the site accepts it) the course counts as archived, not active.
    await openCourses(page);
    expect((await totals(page)).archived).toBe(before.archived + 1);
    await search(page, ARCHIVED);
    await expect(cardOf(page, exactRe(ARCHIVED))).toHaveCount(0);
    await openArchived(page);
    await expect(cardOf(page, exactRe(ARCHIVED))).toBeVisible();
    await saveEvidence(page, "CRS-15a-archived");
  });

  test("CRS-15b: Disable Student Activity is saved as chosen", async ({
    page,
  }) => {
    await createCourse(page, { title: DISABLED, disableStudentActivity: true });
    await openCourses(page);
    await search(page, DISABLED);
    const card = cardOf(page, exactRe(DISABLED));
    await expect(card).toBeVisible();
    await card.locator("h6").click();
    await dismissGuides(page);
    await expect(
      page.getByText(/Student Activity:\s*Disabled/i).first(),
    ).toBeVisible();
    await saveEvidence(page, "CRS-15b-header");
  });

  test("CRS-16: closing the form (X) without saving creates nothing", async ({
    page,
  }) => {
    await openCourses(page);
    const before = await totals(page);

    // Nothing typed: the form just closes.
    let dialog = await openForm(page);
    await dialog.getByRole("button").filter({ hasText: /^$/ }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Something typed: the site asks "Discard Changes?".
    dialog = await openForm(page);
    await dialog.getByPlaceholder("Course title").fill("qa_crs_discard_check");
    await dialog.getByRole("button").filter({ hasText: /^$/ }).first().click();
    await expect(page.getByText("Discard Changes?")).toBeVisible();
    await saveEvidence(page, "CRS-16-discard-question");
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openCourses(page);
    await search(page, "qa_crs_discard_check");
    await expect(cardOf(page, /qa_crs_discard_check/)).toHaveCount(0);
    expect((await totals(page)).courses).toBe(before.courses);
  });

  test("CRS-17: a double-click on Save creates only one course", async ({
    page,
  }) => {
    // Note: a second course with the same title would also be refused by the duplicate rule (CRS-09),
    // so this test cannot tell the two protections apart.
    const dialog = await openForm(page);
    await dialog.getByPlaceholder("Course title").fill(DOUBLE);
    await saveButton(dialog).dblclick();
    await page.waitForTimeout(5000);
    if (
      await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false)
    )
      await closeForm(page);

    await openCourses(page);
    await search(page, DOUBLE);
    await expect(cardOf(page, exactRe(DOUBLE))).toHaveCount(1);
    await saveEvidence(page, "CRS-17");
  });

  test("CRS-18: after saving and refreshing, the course is still there with the right counts", async ({
    page,
  }) => {
    await ensureCourse(page, FULL_SPEC);
    for (const round of ["first look", "after refresh"]) {
      if (round === "after refresh") await page.reload();
      await dismissGuides(page, 1200);
      await expect(page.locator("h6").first()).toBeVisible();
      await search(page, FULL);
      const card = cardOf(page, exactRe(FULL));
      await expect(card).toBeVisible();
      expect([
        await cardNumber(card, "Faculty"),
        await cardNumber(card, "Questions"),
        await cardNumber(card, "Students"),
      ]).toEqual([2, 0, 2]);
    }
    await saveEvidence(page, "CRS-18");
  });

  test("CRS-99: clean up, then the numbers are back to the start", async ({
    page,
    browser,
  }) => {
    test.setTimeout(400_000);
    await cleanUp(browser);
    await openCourses(page);
    const after = await totals(page);
    await saveEvidence(page, "CRS-cleanup");
    console.log(`COURSES | after clean-up: ${JSON.stringify(after)}`);
    if (fs.existsSync(BASELINE_FILE)) {
      const start = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
      expect(after).toEqual(start);
    }
  });
});
