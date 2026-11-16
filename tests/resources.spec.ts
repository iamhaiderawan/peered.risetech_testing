import {
  test,
  expect,
  Page,
  Browser,
  Locator,
  Download,
} from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Resources module - test IDs match the testing plan (Module 5, RES).
// It runs on the DEVELOPMENT site (BASE_URL in .env). Screenshots go to evidence/resources/.
//
// Everything the tests make is named qa_res_... and is deleted at the end (RES-99).
// The folder qa_course_1 and its files (made by hand) are only ever LOOKED at, never changed.
// The faculty session comes from tests/auth.setup.ts (.auth/faculty.json). The student and the junior
// faculty use their own saved sessions (.auth/student.json, .auth/faculty3.json).
// The tests run one after another in file order. The files uploaded by RES-06 stay in the folder
// qa_res_files until RES-99, because RES-10 and RES-13 use them.

const AUTH_FILE = ".auth/faculty.json";
const STUDENT_AUTH = ".auth/student.json";
const JUNIOR_AUTH = ".auth/faculty3.json";
const EVIDENCE_DIR = "evidence/resources";
const BASELINE_FILE = `${EVIDENCE_DIR}/baseline.json`;

// the Resources tab of qa_course (the course was made by hand on the development site)
const RES_PATH =
  process.env.RES_PATH ??
  "/faculty/courses/6af55f1c1d34b3a65edffbee?tab=resources";
const COURSE_URL = RES_PATH.split("?")[0];
const COURSE = "qa_course";
const EMPTY_COURSE = "qa_res_empty"; // made and deleted by RES-01
const PREFIX = "qa_res_";
const FILES_FOLDER = "qa_res_files"; // the folder that holds the uploaded test files
const HAND_FOLDER = "qa_course_1"; // made by hand: read only
const JUNIOR_EMAIL = process.env.TEST_FACULTY3_EMAIL ?? "";

test.use({ storageState: AUTH_FILE });
// One after another, no retries (a retry would create things twice).
test.describe.configure({ retries: 0, timeout: 240_000 });

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Small helpers ----------

const say = (...a: unknown[]) => console.log("RES |", ...a);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function note(text: string) {
  console.log(`NOTE | ${text}`);
  test.info().annotations.push({ type: "note", description: text });
}

async function saveEvidence(page: Page, name: string) {
  await page.waitForTimeout(1200); // pages and pop-ups fade in and out
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

// Sample files can be anywhere under sample/ (ours are in sample/peered-res-samples/).
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

// A small file made on the spot (for types we have no real sample of). Not a real picture / video:
// only the name (the ending) matters for the "is this type accepted" check.
function makeFile(name: string, bytes: number): string {
  const p = test.info().outputPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(bytes, 65));
  return p;
}

const sha = (file: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// The Quick Tour ("Skip") and the Watch Guide video ("Close guide") cover the page: close them.
// They can appear a moment AFTER the page loads, so this looks a few times before it gives up.
async function dismissGuides(page: Page) {
  for (let i = 0; i < 6; i++) {
    let closed = false;
    for (const c of [
      page.getByRole("button", { name: /^skip$/i }),
      page.locator('[aria-label="Close guide"]'),
    ]) {
      const b = c.first();
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
        await page.waitForTimeout(800);
        closed = true;
      }
    }
    if (!closed && i >= 2) return; // nothing showed up in the last 2 seconds
    if (!closed) await page.waitForTimeout(1000);
  }
}

// A guard: whenever the guide video or the tour pops up while a test is clicking, it is closed first.
async function guardGuides(page: Page) {
  await page.addLocatorHandler(
    page.locator('[aria-label="Close guide"]').first(),
    async (el) => {
      await el.click().catch(() => {});
    },
  );
  await page.addLocatorHandler(
    page.getByRole("button", { name: /^skip$/i }).first(),
    async (el) => {
      await el.click().catch(() => {});
    },
  );
}

test.beforeEach(async ({ page }) => {
  await guardGuides(page);
});

const bodyText = (page: Page) => page.locator("body").innerText();

const lines = async (page: Page) =>
  new Set(
    (await bodyText(page))
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );

// Runs an action and returns the lines of text that appeared after it (the site's messages).
// Messages vanish quickly, so a picture is taken straight away.
async function act(page: Page, shot: string, action: () => Promise<unknown>) {
  const before = await lines(page);
  await action();
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(350);
    if (i === 1)
      await page.screenshot({ path: `${EVIDENCE_DIR}/${shot}-message.png` });
    for (const l of await lines(page)) if (!before.has(l)) seen.add(l);
  }
  const found = [...seen].slice(0, 10);
  say(`${shot} | message: ${JSON.stringify(found)}`);
  return found.join(" | ");
}

const dialog = (page: Page) => page.getByRole("dialog").last();

// The pop-ups have no Cancel button: the first button is a nameless X in the corner.
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

// ---------- The Resources tab and its folders ----------

// The development site is slow: wait until the Resources content is really there.
// The text is looked for FIRST: while the guide video is open, the page hides its buttons from a
// "role" search, but the plain text is still found. Then the guide is closed, then the button is checked.
async function waitForResources(page: Page) {
  await expect(
    page.getByText("Add Folder", { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await dismissGuides(page);
  await expect(page.getByRole("button", { name: "Add Folder" })).toBeVisible({
    timeout: 15_000,
  });
}

// Inside a folder: same idea as waitForResources (text first, then close the guide, then the button).
async function waitForFolder(page: Page) {
  await expect(page.getByText("Add File", { exact: true }).first()).toBeVisible(
    { timeout: 30_000 },
  );
  await dismissGuides(page);
  await expect(page.getByRole("button", { name: "Add File" })).toBeVisible({
    timeout: 15_000,
  });
}

async function openResources(page: Page) {
  await page.goto(RES_PATH);
  await waitForResources(page);
}

// Each folder is a "button" named "Open folder <name>"; the names of all folders on the page:
async function folderNames(page: Page): Promise<string[]> {
  const labels = await page
    .locator('[aria-label^="Open folder "]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.map((l) => l.replace(/^Open folder /, ""));
}

const folderBtn = (page: Page, name: string) =>
  page.getByLabel(`Open folder ${name}`, { exact: true });
const folderMenuBtn = (page: Page, name: string) =>
  page.getByLabel(`Folder options for ${name}`, { exact: true }).first();

// The number on the folder's chip (how many files it holds).
// A folder with no files shows no chip at all, so a missing chip means 0.
async function folderCount(page: Page, name: string) {
  const btn = folderBtn(page, name).first();
  await btn.waitFor({ timeout: 20_000 });
  const chip = btn.locator(".MuiChip-label");
  if ((await chip.count()) === 0) return 0;
  return Number((await chip.innerText()).trim());
}

// How many files a folder holds, read from a fresh Resources page.
async function filesIn(page: Page, name: string) {
  await openResources(page);
  return folderCount(page, name);
}

// Adds a folder and returns the message the site showed. It does not check that the folder appeared.
async function addFolder(page: Page, name: string, shot: string) {
  await page.getByRole("button", { name: "Add Folder" }).click();
  const d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800); // the pop-up fades in
  await d.getByPlaceholder("Enter name").fill(name);
  return act(page, shot, () =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
}

// Opens a folder's menu and presses one item (Rename Folder or Delete Folder).
async function folderMenu(page: Page, name: string, item: RegExp) {
  await folderMenuBtn(page, name).click();
  await page.getByRole("menuitem", { name: item }).click();
  await page.waitForTimeout(800); // the pop-up fades in
}

// Deletes a folder. If the site asks to confirm, the question is printed and the confirm button is pressed.
async function deleteFolder(page: Page, name: string) {
  await folderMenu(page, name, /Delete Folder/);
  const d = page.getByRole("dialog").last();
  let msg = "";
  if (await d.isVisible().catch(() => false)) {
    say(
      `delete question for "${name}":`,
      JSON.stringify(clean(await d.innerText()).slice(0, 300)),
    );
    const ok = d
      .getByRole("button", { name: /^(delete|confirm|yes|ok|remove)/i })
      .first();
    msg = await act(page, "folder-deleted", () => ok.click());
  }
  say(`CLEANUP | deleted folder "${name}"`);
  return msg;
}

// Deletes every folder whose name starts with qa_res_ (leftovers of an earlier run, or this run's own).
async function deleteTestFolders(page: Page) {
  await openResources(page);
  for (let round = 0; round < 40; round++) {
    const mine = (await folderNames(page)).filter((n) => n.startsWith(PREFIX));
    if (mine.length === 0) return;
    await deleteFolder(page, mine[0]);
    await page.reload();
    await waitForResources(page);
  }
}

// ---------- Inside a folder: files ----------

async function openFolder(page: Page, name: string) {
  await openResources(page);
  await folderBtn(page, name).first().click();
  await waitForFolder(page);
  await page.waitForTimeout(1500);
  await dismissGuides(page);
}

// Opens qa_res_files, creating it first if it is not there.
async function openFilesFolder(page: Page) {
  await openResources(page);
  if (!(await folderNames(page)).includes(FILES_FOLDER)) {
    await addFolder(page, FILES_FOLDER, "files-folder-add");
    await expect(folderBtn(page, FILES_FOLDER)).toBeVisible({
      timeout: 20_000,
    });
  }
  await folderBtn(page, FILES_FOLDER).first().click();
  await waitForFolder(page);
  await page.waitForTimeout(1500);
  await dismissGuides(page);
}

type Upload = {
  path: string;
  title: string;
  tags?: string[];
  description?: string;
  shot: string;
};

// Fills the Add File form and presses Save. Returns the message the site showed.
async function uploadFile(page: Page, o: Upload) {
  await page.getByRole("button", { name: "Add File" }).click();
  const d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800); // the pop-up fades in
  await d.locator("input[type=file]").setInputFiles(o.path);
  await d.getByPlaceholder("Enter name").fill(o.title);
  if (o.description)
    await d.getByPlaceholder("Add description").fill(o.description);
  for (const t of o.tags ?? []) {
    const tagInput = d.locator('input[id^="react-select"]').last();
    await tagInput.click();
    await tagInput.fill(t);
    await page.keyboard.press("Enter");
  }
  return act(page, o.shot, () =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
}

const expectSaved = (page: Page, ms = 60_000) =>
  expect(page.getByRole("dialog")).toHaveCount(0, { timeout: ms });

async function searchFiles(page: Page, text: string) {
  await page.getByPlaceholder(/Search by title/).fill(text);
  await page.waitForTimeout(1500); // the list filters while typing
}

// The row of a file: the nearest box around its title that holds a Download button.
const rowOf = (page: Page, title: string): Locator =>
  // the faculty's Download is an icon named "Download"; the student's is a button with the word "Download"
  page
    .getByText(title, { exact: true })
    .first()
    .locator(
      "xpath=ancestor::*[.//button[@aria-label='Download' or normalize-space(.)='Download']][1]",
    );

const titleFor = (file: string) =>
  `${PREFIX}${file.replace(/[^a-z0-9]/gi, "_")}`;

// Uploads a sample file into qa_res_files unless it is already there. Returns its title.
async function ensureUploaded(
  page: Page,
  file: string,
  extra: Partial<Upload> = {},
) {
  const title = extra.title ?? titleFor(file);
  await openFilesFolder(page);
  await searchFiles(page, title);
  if ((await page.getByText(title, { exact: true }).count()) === 0) {
    await uploadFile(page, {
      path: sample(file),
      title,
      shot: `ensure-${file}`,
      ...extra,
    });
    await expectSaved(page);
    await searchFiles(page, title);
  }
  await expect(rowOf(page, title)).toBeVisible({ timeout: 20_000 });
  return title;
}

// Presses a row's Download button and says what happened: a file arrived, or an error message and a failed request.
async function tryDownload(page: Page, row: Locator, shot: string) {
  const bad: string[] = [];
  const onResp = (r: {
    status(): number;
    request(): { method(): string };
    url(): string;
  }) => {
    if (r.status() >= 400)
      bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  };
  page.on("response", onResp);
  const got: { d: Download | null } = { d: null };
  const onDl = (d: Download) => (got.d = d);
  page.on("download", onDl);
  const before = await lines(page);
  await row.getByRole("button", { name: "Download", exact: true }).click();
  const seen = new Set<string>();
  for (let i = 0; i < 14 && !got.d; i++) {
    await page.waitForTimeout(500);
    if (i === 2)
      await page.screenshot({ path: `${EVIDENCE_DIR}/${shot}-message.png` });
    for (const l of await lines(page)) if (!before.has(l)) seen.add(l);
  }
  page.off("response", onResp);
  page.off("download", onDl);
  const messages = [...seen].slice(0, 6);
  let file: string | undefined;
  if (got.d) {
    file = test.info().outputPath(`dl-${got.d.suggestedFilename()}`);
    await got.d.saveAs(file);
  }
  say(
    `${shot} | download: ${got.d ? "a file arrived" : "NO file"} | messages: ${JSON.stringify(messages)} | failed requests: ${JSON.stringify(bad)}`,
  );
  return { ok: !!got.d, name: got.d?.suggestedFilename(), file, messages, bad };
}

// ---------- Courses (RES-01) ----------

async function openCourses(page: Page) {
  await page.goto("/faculty/courses");
  await dismissGuides(page);
  await expect(
    page
      .getByRole("button", { name: "Add Course" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function findEmptyCourseCard(page: Page) {
  await openCourses(page);
  await page.getByPlaceholder(/Search by title/).fill(EMPTY_COURSE);
  await page.waitForTimeout(1500); // the list filters while typing
  const card = page
    .locator(".MuiCard-root")
    .filter({
      has: page
        .locator("h6")
        .filter({ hasText: new RegExp(`^\\s*${EMPTY_COURSE}\\s*$`) }),
    });
  return (await card.count()) > 0 ? card.first() : null;
}

async function deleteEmptyCourse(page: Page) {
  for (let round = 0; round < 3; round++) {
    const card = await findEmptyCourseCard(page);
    if (!card) return;
    await card.scrollIntoViewIfNeeded();
    await card
      .locator("button[aria-haspopup='menu']")
      .first()
      .click({ force: true });
    await page.getByRole("menuitem", { name: /Delete Course/ }).click();
    await page.getByRole("textbox", { name: /Type/ }).fill(EMPTY_COURSE);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /Type/ })).toBeHidden({
      timeout: 20_000,
    });
    say(`CLEANUP | deleted course "${EMPTY_COURSE}"`);
  }
}

// ---------- Other accounts (RES-13) ----------

async function openAs(browser: Browser, authFile: string, home: string) {
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL,
    storageState: authFile,
  });
  const page = await context.newPage();
  await guardGuides(page);
  await page.goto(home);
  await page.waitForTimeout(3000);
  await dismissGuides(page);
  return { context, page };
}

// The student: course list -> qa_course -> Resources tab -> the folder.
async function studentOpenFolder(page: Page, folder: string) {
  await page.goto("/student/course-gate");
  await dismissGuides(page);
  await page.getByPlaceholder(/Search title, code/).fill(COURSE);
  await page.waitForTimeout(1500);
  await page.getByText(COURSE, { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await dismissGuides(page);
  // On the student's side the Resources folders are shown right on the dashboard (there is no Resources tab).
  say("student | address after opening the course:", page.url());
  const f = folderBtn(page, folder)
    .or(page.getByText(folder, { exact: true }))
    .first();
  await expect(f).toBeVisible({ timeout: 30_000 });
  await f.click();
  await page.waitForTimeout(2500);
  await dismissGuides(page);
}

// Prints what a page shows: address, text, and the name of every button and link. For screens we have not seen.
async function dumpPage(page: Page, label: string) {
  say(`----- ${label} -----`);
  say("address:", page.url());
  say("text:", JSON.stringify(clean(await bodyText(page)).slice(0, 1200)));
  const names = await page
    .locator("button, a, [role=tab], [role=button]")
    .evaluateAll((els) =>
      els.map((e) => {
        const t = (e.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);
        const a = e.getAttribute("aria-label") || "";
        return `${t}${a ? ` [${a}]` : ""}` || "(no name)";
      }),
    );
  say("buttons and links:", JSON.stringify(names));
}

// Adds (on) or removes (off) the junior faculty account in qa_course, through Manage Faculty.
async function setJunior(page: Page, on: boolean) {
  await page.goto(COURSE_URL);
  await dismissGuides(page);
  await page
    .locator("button, a, [role=tab]")
    .filter({ hasText: /^Overview$/ })
    .first()
    .click()
    .catch(() => {});
  await expect(page.getByText(/Student Activity:/).first()).toBeVisible({
    timeout: 30_000,
  });
  await dismissGuides(page);
  await page.getByRole("button", { name: "Manage faculty" }).click();
  const d = dialog(page);
  await expect(d.getByText("Manage Faculty")).toBeVisible();
  await page.waitForTimeout(1200); // the pop-up fades in; clicks during the fade are lost
  await d.getByPlaceholder(/Search by name/).fill(JUNIOR_EMAIL);
  await page.waitForTimeout(1200);
  await expect(d.getByRole("row")).toHaveCount(2);
  const tick = d
    .getByRole("row")
    .nth(1)
    .locator("input[type=checkbox]")
    .first();
  if (on) await tick.check({ force: true });
  else await tick.uncheck({ force: true });
  await act(page, `junior-${on ? "added" : "removed"}`, () =>
    d.getByRole("button", { name: "Update" }).click(),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
}

// Which of the faculty's tools a page shows (counts of each).
async function toolsShown(page: Page) {
  return {
    addFolder: await page.getByRole("button", { name: "Add Folder" }).count(),
    folderMenu: await page.getByLabel("Folder options for").count(),
    addFile: await page.getByRole("button", { name: "Add File" }).count(),
    edit: await page.getByLabel("Edit", { exact: true }).count(),
    delete: await page.getByLabel("Delete", { exact: true }).count(),
  };
}

// The sample files that RES-06 uploads (14 types). The odd-named ones are in RES-06 too.
const GOOD_FILES = [
  "qa_doc_sample.pdf",
  "qa_doc_sample.docx",
  "qa_doc_sample.doc",
  "qa_slides_sample.pptx",
  "qa_slides_sample.ppt",
  "qa_sheet_sample.xlsx",
  "qa_sheet_sample.xls",
  "qa_image_sample.png",
  "qa_image_sample.jpg",
  "qa_audio_sample.mp3",
  "qa_audio_sample.wav",
  "qa_video_sample.mp4",
  "qa_archive_sample.zip",
  "qa_text_sample.txt",
];

// ======================= Tests =======================

test("RES-00: clean start (delete any qa_res_ leftover, note the starting folders)", async ({
  page,
}) => {
  await deleteEmptyCourse(page);
  await deleteTestFolders(page);
  await openResources(page);
  const names = await folderNames(page);
  const counts: Record<string, number> = {};
  for (const n of names) counts[n] = await folderCount(page, n);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(counts));
  say("starting folders:", JSON.stringify(counts));
  await saveEvidence(page, "RES-00");
});

test("RES-01: a course with no folders shows the empty message", async ({
  page,
}) => {
  try {
    await openCourses(page);
    await page
      .getByRole("button", { name: "Add Course" })
      .filter({ visible: true })
      .first()
      .click();
    const d = page.getByRole("dialog").first();
    await d.getByPlaceholder("Course title").fill(EMPTY_COURSE);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    const card = await findEmptyCourseCard(page);
    expect(card, "the new course was not found").not.toBeNull();
    await card!.locator("h6").click();
    await expect(page.getByText(/Student Activity:/).first()).toBeVisible({
      timeout: 30_000,
    });
    await dismissGuides(page);
    await page
      .locator("button, a, [role=tab]")
      .filter({ hasText: /^Resources$/ })
      .first()
      .click();
    await waitForResources(page);

    const names = await folderNames(page);
    const text = await bodyText(page);
    say("RES-01 | folders:", JSON.stringify(names));
    say("RES-01 | page text:", JSON.stringify(clean(text).slice(0, 600)));
    await saveEvidence(page, "RES-01");
    expect(names).toHaveLength(0);
    expect(text).toMatch(/no resources? found/i);
  } finally {
    await deleteEmptyCourse(page);
  }
});

test("RES-02: Add Folder with a valid name; it is still there after a refresh", async ({
  page,
}) => {
  await openResources(page);
  const before = await folderNames(page);
  const msg = await addFolder(page, "qa_res_ok", "RES-02");
  say("RES-02 | message:", msg);
  await expect(folderBtn(page, "qa_res_ok")).toBeVisible({ timeout: 20_000 });
  expect(await folderCount(page, "qa_res_ok")).toBe(0);
  await saveEvidence(page, "RES-02-added");

  await page.reload();
  await waitForResources(page);
  await expect(folderBtn(page, "qa_res_ok")).toBeVisible();
  expect((await folderNames(page)).length).toBe(before.length + 1);
  await saveEvidence(page, "RES-02-after-refresh");
});

test.describe("RES-03: Add Folder, wrong and odd names", () => {
  test("RES-03a: empty name and a name of only spaces are blocked", async ({
    page,
  }) => {
    await openResources(page);
    const before = await folderNames(page);
    for (const [label, value] of [
      ["empty", ""],
      ["spaces", "     "],
    ] as const) {
      await page.getByRole("button", { name: "Add Folder" }).click();
      const d = dialog(page);
      await expect(d.getByPlaceholder("Enter name")).toBeVisible();
      await page.waitForTimeout(800);
      await d.getByPlaceholder("Enter name").fill(value);
      const msg = await act(page, `RES-03a-${label}`, () =>
        d.getByRole("button", { name: "Save", exact: true }).click(),
      );
      say(`RES-03a | ${label} | message: ${msg}`);
      await closeDialogs(page);
    }
    await page.reload();
    await waitForResources(page);
    expect(await folderNames(page)).toEqual(before); // nothing was created
  });

  test("RES-03b: a second folder with the same name is refused", async ({
    page,
  }) => {
    await openResources(page);
    await addFolder(page, "qa_res_dup", "RES-03b-first");
    await expect(folderBtn(page, "qa_res_dup")).toBeVisible({
      timeout: 20_000,
    });
    const msg = await addFolder(page, "qa_res_dup", "RES-03b-second");
    say("RES-03b | message for the second one:", msg);
    await closeDialogs(page);
    await page.reload();
    await waitForResources(page);
    const same = (await folderNames(page)).filter((n) => n === "qa_res_dup");
    await saveEvidence(page, "RES-03b");
    expect(same, "folders named qa_res_dup").toHaveLength(1);
  });

  test("RES-03c: a very long name is kept as typed and the page does not break", async ({
    page,
  }) => {
    const typedName = PREFIX + "x".repeat(143); // 150 characters
    await openResources(page);
    await page.getByRole("button", { name: "Add Folder" }).click();
    const d = dialog(page);
    await expect(d.getByPlaceholder("Enter name")).toBeVisible();
    await page.waitForTimeout(800);
    const maxlength = await d
      .getByPlaceholder("Enter name")
      .getAttribute("maxlength");
    await d.getByPlaceholder("Enter name").fill(typedName);
    const inBox = await d.getByPlaceholder("Enter name").inputValue();
    say(
      `RES-03c | typed ${typedName.length} characters; the box holds ${inBox.length}; maxlength: ${maxlength}`,
    );
    await act(page, "RES-03c", () =>
      d.getByRole("button", { name: "Save", exact: true }).click(),
    );
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForResources(page);
    const saved = (await folderNames(page)).filter((n) =>
      n.startsWith(PREFIX + "xxx"),
    );
    say(
      "RES-03c | saved as:",
      JSON.stringify(saved),
      "| length",
      saved[0]?.length,
    );
    await saveEvidence(page, "RES-03c");
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (inBox.length < typedName.length)
      note(
        `the name box keeps only ${inBox.length} of the ${typedName.length} characters typed (maxlength ${maxlength})`,
      );
    // nothing may be lost between the box and the saved folder
    expect(saved, "the folder saved with the text that was in the box").toEqual(
      [inBox.trim()],
    );
    expect(wide, "sideways scroll bar").toBe(false);
  });

  test("RES-03d: special characters are shown as typed, not as code", async ({
    page,
  }) => {
    const name = `${PREFIX}<b>&"'%$#@!`;
    await openResources(page);
    await addFolder(page, name, "RES-03d");
    await expect(folderBtn(page, name)).toBeVisible({ timeout: 20_000 });
    const text = clean(await folderBtn(page, name).innerText());
    say("RES-03d | the folder shows:", JSON.stringify(text));
    await saveEvidence(page, "RES-03d");
    expect(text).toContain(`<b>&"'%$#@!`);
  });

  test("RES-03e: spaces at the start of a name are removed", async ({
    page,
  }) => {
    await openResources(page);
    await addFolder(page, "   qa_res_lead", "RES-03e");
    await page.waitForTimeout(1500);
    const names = (await folderNames(page)).filter(
      (n) => n.trim() === "qa_res_lead",
    );
    say("RES-03e | saved as:", JSON.stringify(names));
    await saveEvidence(page, "RES-03e");
    expect(names).toEqual(["qa_res_lead"]);
  });
});

test("RES-04: folder menu has Rename and Delete; both work; Delete removes the files inside", async ({
  page,
}) => {
  await openResources(page);
  await addFolder(page, "qa_res_menu", "RES-04-add");
  await expect(folderBtn(page, "qa_res_menu")).toBeVisible({ timeout: 20_000 });

  // the menu
  await folderMenuBtn(page, "qa_res_menu").click();
  const items = (await page.getByRole("menuitem").allInnerTexts()).map(clean);
  say("RES-04 | menu items:", JSON.stringify(items));
  await saveEvidence(page, "RES-04-menu");
  expect(items).toEqual([
    "Rename Folder Change its name",
    "Delete Folder Removes all its items",
  ]);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Rename
  await folderMenu(page, "qa_res_menu", /Rename Folder/);
  const d = dialog(page);
  say(
    "RES-04 | rename pop-up:",
    JSON.stringify(clean(await d.innerText()).slice(0, 200)),
  );
  await saveEvidence(page, "RES-04-rename-popup");
  const box = d.getByRole("textbox").first();
  expect(await box.inputValue()).toBe("qa_res_menu"); // the old name is filled in
  await box.fill("qa_res_menu2");
  const renameMsg = await act(page, "RES-04-rename", () =>
    d.getByRole("button", { name: /^(save|update|rename)$/i }).click(),
  );
  say("RES-04 | rename message:", renameMsg);
  await expect(folderBtn(page, "qa_res_menu2")).toBeVisible({
    timeout: 20_000,
  });
  await expect(folderBtn(page, "qa_res_menu")).toHaveCount(0);
  await page.reload();
  await waitForResources(page);
  await expect(folderBtn(page, "qa_res_menu2")).toBeVisible(); // the new name was really saved

  // put one file in it, then delete the folder: the file must go with it
  await folderBtn(page, "qa_res_menu2").click();
  await waitForFolder(page);
  await page.waitForTimeout(1500);
  await dismissGuides(page);
  await uploadFile(page, {
    path: sample("qa_doc_sample.pdf"),
    title: "qa_res_gone",
    shot: "RES-04-file",
  });
  await expectSaved(page);
  expect(await filesIn(page, "qa_res_menu2")).toBe(1);

  const deleteMsg = await deleteFolder(page, "qa_res_menu2");
  say("RES-04 | delete message:", deleteMsg);
  await page.reload();
  await waitForResources(page);
  await expect(folderBtn(page, "qa_res_menu2")).toHaveCount(0);
  await saveEvidence(page, "RES-04-deleted");

  // a new folder with the same name must start empty
  await addFolder(page, "qa_res_menu2", "RES-04-again");
  await expect(folderBtn(page, "qa_res_menu2")).toBeVisible({
    timeout: 20_000,
  });
  expect(await folderCount(page, "qa_res_menu2")).toBe(0);
});

test("RES-04b (extra test): renaming a folder to a name that already exists is refused", async ({
  page,
}) => {
  await openResources(page);
  await addFolder(page, "qa_res_a", "RES-04b-add-a");
  await expect(folderBtn(page, "qa_res_a")).toBeVisible({ timeout: 20_000 });
  await addFolder(page, "qa_res_b", "RES-04b-add-b");
  await expect(folderBtn(page, "qa_res_b")).toBeVisible({ timeout: 20_000 });

  await folderMenu(page, "qa_res_b", /Rename Folder/);
  const d = dialog(page);
  await d.getByRole("textbox").first().fill("qa_res_a");
  const msg = await act(page, "RES-04b-rename", () =>
    d.getByRole("button", { name: /^(save|update|rename)$/i }).click(),
  );
  say("RES-04b | message:", msg);
  await closeDialogs(page);
  await page.reload();
  await waitForResources(page);
  const two = (await folderNames(page)).filter((n) => n === "qa_res_a").length;
  say("RES-04b | folders named qa_res_a after the rename:", two);
  await saveEvidence(page, "RES-04b-after-rename");
  expect
    .soft(two, "folders named qa_res_a (a duplicate rename is accepted)")
    .toBe(1);

  if (two > 1) {
    // when both exist: deleting one should remove only one
    await deleteFolder(page, "qa_res_a");
    await page.reload();
    await waitForResources(page);
    const left = (await folderNames(page)).filter(
      (n) => n === "qa_res_a",
    ).length;
    say("RES-04b | folders named qa_res_a left after deleting one:", left);
    await saveEvidence(page, "RES-04b-after-delete");
    expect.soft(left, "deleting one of two same-named folders left").toBe(1);
  }
});

test("RES-05: an empty folder shows an empty message", async ({ page }) => {
  await openResources(page);
  await addFolder(page, "qa_res_empty_folder", "RES-05-add");
  await expect(folderBtn(page, "qa_res_empty_folder")).toBeVisible({
    timeout: 20_000,
  });
  await folderBtn(page, "qa_res_empty_folder").click();
  await waitForFolder(page);
  await page.waitForTimeout(1500);
  await dismissGuides(page);
  const all = (await bodyText(page))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  say("RES-05 | everything on the page:", JSON.stringify(all));
  // the folder's own name (qa_res_empty_folder) is not a message
  const found = all.filter(
    (l) =>
      !l.startsWith(PREFIX) &&
      /(^no .*(found|yet|available))|empty|nothing/i.test(l),
  );
  say("RES-05 | empty message lines:", JSON.stringify(found));
  await saveEvidence(page, "RES-05");
  expect(
    await page.getByLabel("Download", { exact: true }).count(),
    "file rows in an empty folder",
  ).toBe(0);
  expect(
    found.length,
    "an empty-folder message (the page shows none)",
  ).toBeGreaterThan(0);
});

// ---------- RES-06: Add File, each type ----------

test.describe("RES-06: Add File, every kind of file uploads and shows its size", () => {
  for (const f of GOOD_FILES) {
    test(`RES-06: ${f}`, async ({ page }) => {
      const title = titleFor(f);
      await openFilesFolder(page);
      const msg = await uploadFile(page, {
        path: sample(f),
        title,
        shot: `RES-06-${f}`,
      });
      say(`RES-06 | ${f} | message: ${msg}`);
      await expectSaved(page);
      await searchFiles(page, title);
      const row = rowOf(page, title);
      await expect(row).toBeVisible({ timeout: 20_000 });
      const text = clean(await row.innerText());
      say(`RES-06 | ${f} | the row reads: ${JSON.stringify(text)}`);
      await saveEvidence(page, `RES-06-${f}`);
      expect(text).toMatch(/\d+(\.\d+)?\s?(B|KB|MB|GB)\b/);
    });
  }

  test("RES-06 odd names: spaces, brackets, an accent, a very long file name", async ({
    page,
  }) => {
    const odd = [
      ["qa_name with spaces & (brackets) é.pdf", "qa_res_odd_spaces"],
      [
        "qa_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_long_name_.pdf",
        "qa_res_odd_long",
      ],
    ];
    for (const [file, title] of odd) {
      await openFilesFolder(page);
      await uploadFile(page, {
        path: sample(file),
        title,
        shot: `RES-06-${title}`,
      });
      await expectSaved(page);
      await searchFiles(page, title);
      await expect(rowOf(page, title), file).toBeVisible({ timeout: 20_000 });
      await saveEvidence(page, `RES-06-${title}`);
    }
  });
});

test("RES-06b (extra test): the other types the form allows are accepted; .csv is not offered", async ({
  page,
}) => {
  await openFilesFolder(page);
  // what the form says it accepts
  await page.getByRole("button", { name: "Add File" }).click();
  const d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800);
  const accept =
    (await d.locator("input[type=file]").getAttribute("accept")) ?? "";
  say("RES-06b | the form accepts:", accept);
  say(
    "RES-06b | the form text says:",
    JSON.stringify(clean(await d.innerText()).slice(0, 200)),
  );
  await closeDialogs(page);
  note(
    `.csv is ${accept.includes(".csv") ? "" : "NOT "}in the accept list of the Add File form; the form text says "Supports PDF, DOC, PPT, Excel, Images, Audio, Video, ZIP, TXT"`,
  );

  // the types in the list that the plan does not mention: tiny files with that ending
  const extra = [
    ".webp",
    ".mov",
    ".avi",
    ".mkv",
    ".aac",
    ".ogg",
    ".rar",
    ".7z",
  ];
  for (const ext of extra) {
    const title = `${PREFIX}extra${ext.replace(".", "_")}`;
    await openFilesFolder(page);
    await uploadFile(page, {
      path: makeFile(`qa_extra_sample${ext}`, 2048),
      title,
      shot: `RES-06b-${ext}`,
    });
    const saved = await expect(page.getByRole("dialog"))
      .toHaveCount(0, { timeout: 30_000 })
      .then(
        () => true,
        () => false,
      );
    if (!saved) await closeDialogs(page);
    await searchFiles(page, title);
    const there = (await page.getByText(title, { exact: true }).count()) > 0;
    say(`RES-06b | ${ext} | accepted: ${there}`);
    expect
      .soft(there, `${ext} is in the accepted list but was not accepted`)
      .toBe(true);
  }

  // .csv: put it straight into the field (the file window would not offer it) and see what happens
  await openFilesFolder(page);
  const msg = await uploadFile(page, {
    path: sample("qa_sheet_sample.csv"),
    title: `${PREFIX}csv`,
    shot: "RES-06b-csv",
  });
  const savedCsv = await expect(page.getByRole("dialog"))
    .toHaveCount(0, { timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  if (!savedCsv) await closeDialogs(page);
  say(
    `RES-06b | csv put straight into the field | saved: ${savedCsv} | message: ${msg}`,
  );
  note(
    `.csv put straight into the field: ${savedCsv ? "accepted" : "rejected"}`,
  );
});

// ---------- RES-07 and RES-08: wrong input ----------

test.describe("RES-07: Add File with no name or no file is blocked", () => {
  test("RES-07a: a name but no file", async ({ page }) => {
    await openFilesFolder(page);
    const before = await filesIn(page, FILES_FOLDER);
    await openFilesFolder(page);
    await page.getByRole("button", { name: "Add File" }).click();
    const d = dialog(page);
    await expect(d.getByPlaceholder("Enter name")).toBeVisible();
    await page.waitForTimeout(800);
    await d.getByPlaceholder("Enter name").fill("qa_res_nofile");
    const msg = await act(page, "RES-07a", () =>
      d.getByRole("button", { name: "Save", exact: true }).click(),
    );
    say("RES-07a | message:", msg);
    await closeDialogs(page);
    expect(await filesIn(page, FILES_FOLDER), "files in the folder").toBe(
      before,
    );
  });

  test("RES-07b: a file but no name", async ({ page }) => {
    await openFilesFolder(page);
    const before = await filesIn(page, FILES_FOLDER);
    await openFilesFolder(page);
    await page.getByRole("button", { name: "Add File" }).click();
    const d = dialog(page);
    await expect(d.getByPlaceholder("Enter name")).toBeVisible();
    await page.waitForTimeout(800);
    await d
      .locator("input[type=file]")
      .setInputFiles(sample("qa_doc_sample.pdf"));
    await page.waitForTimeout(800);
    say(
      "RES-07b | the name box after choosing a file holds:",
      JSON.stringify(await d.getByPlaceholder("Enter name").inputValue()),
    );
    await d.getByPlaceholder("Enter name").fill(""); // make sure it is empty
    const msg = await act(page, "RES-07b", () =>
      d.getByRole("button", { name: "Save", exact: true }).click(),
    );
    say("RES-07b | message:", msg);
    await closeDialogs(page);
    expect(await filesIn(page, FILES_FOLDER), "files in the folder").toBe(
      before,
    );
  });

  test("RES-07c: nothing filled in", async ({ page }) => {
    await openFilesFolder(page);
    const before = await filesIn(page, FILES_FOLDER);
    await openFilesFolder(page);
    await page.getByRole("button", { name: "Add File" }).click();
    const d = dialog(page);
    await expect(d.getByPlaceholder("Enter name")).toBeVisible();
    await page.waitForTimeout(800);
    const msg = await act(page, "RES-07c", () =>
      d.getByRole("button", { name: "Save", exact: true }).click(),
    );
    say("RES-07c | message:", msg);
    await closeDialogs(page);
    expect(await filesIn(page, FILES_FOLDER), "files in the folder").toBe(
      before,
    );
  });
});

test.describe("RES-08: wrong files are rejected with a message", () => {
  const wrong = [
    ["08a", "WRONG_text_renamed_to_pdf.pdf"],
    ["08b", "WRONG_text_renamed_to_png.png"],
    ["08c", "WRONG_unsupported_type.xyz"],
    ["08d", "WRONG_unsupported_type.exe"],
    ["08e", "WRONG_empty_file.pdf"],
  ];
  for (const [id, file] of wrong) {
    test(`RES-${id}: ${file}`, async ({ page }) => {
      const title = `${PREFIX}wrong_${id}`;
      await openFilesFolder(page);
      const before = await filesIn(page, FILES_FOLDER);
      await openFilesFolder(page);
      const msg = await uploadFile(page, {
        path: sample(file),
        title,
        shot: `RES-${id}`,
      });
      const saved = await expect(page.getByRole("dialog"))
        .toHaveCount(0, { timeout: 15_000 })
        .then(
          () => true,
          () => false,
        );
      say(`RES-${id} | ${file} | saved: ${saved} | message: ${msg}`);
      if (!saved) await closeDialogs(page);
      const after = await filesIn(page, FILES_FOLDER);
      await saveEvidence(page, `RES-${id}-after`);
      expect(
        after,
        `files in the folder (the file was ${saved ? "ACCEPTED" : "refused"}; message: ${msg})`,
      ).toBe(before);
    });
  }

  test("RES-08f: a very large file", async ({ page }) => {
    test.setTimeout(600_000);
    const mb = Number(process.env.RES_BIG_MB ?? 120);
    const big = test.info().outputPath("WRONG_too_big.pdf");
    fs.mkdirSync(path.dirname(big), { recursive: true });
    fs.writeFileSync(big, "");
    fs.truncateSync(big, mb * 1024 * 1024);
    note(`the screen states no size limit; a ${mb} MB file was tried`);
    const r = await bigUpload(page, big, `${PREFIX}wrong_08f`, "RES-08f");
    fs.rmSync(big, { force: true });
    expect(
      r.accepted,
      `the ${mb} MB file was ACCEPTED. Messages: ${r.messages}`,
    ).toBe(false);
    expect
      .soft(
        /size|large|limit|exceed|MB/i.test(r.messages),
        `the message does not say why (size). Messages: ${r.messages}`,
      )
      .toBe(true);
  });
});

// Uploads a big file and WATCHES what the site does for up to 2 minutes: every new message, and whether
// the form stays open. Then it reloads and counts the files, so "accepted" is read from the folder itself.
async function bigUpload(
  page: Page,
  file: string,
  title: string,
  shot: string,
) {
  await openFilesFolder(page);
  const before = await filesIn(page, FILES_FOLDER);
  await openFilesFolder(page);
  await page.getByRole("button", { name: "Add File" }).click();
  const d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800);
  await d.locator("input[type=file]").setInputFiles(file);
  await d.getByPlaceholder("Enter name").fill(title);
  const seen: string[] = [];
  const known = await lines(page);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  const t0 = Date.now();
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await page.waitForTimeout(2000);
    const now = await lines(page);
    for (const l of now) if (!known.has(l) && !seen.includes(l)) seen.push(l);
    const open = await page.getByRole("dialog").count();
    if (i === 3 || i === 10)
      await page.screenshot({ path: `${EVIDENCE_DIR}/${shot}-${i}.png` });
    if (
      seen.some((l) => /File Added Successfully/i.test(l)) ||
      seen.some((l) => /fail|error|large|limit|exceed/i.test(l))
    ) {
      await page.waitForTimeout(2500);
      done = true;
    }
    say(
      `${shot} | after ${Math.round((Date.now() - t0) / 1000)} s | form open: ${open > 0} | new lines: ${JSON.stringify(seen)}`,
    );
  }
  await closeDialogs(page);
  const after = await filesIn(page, FILES_FOLDER);
  const accepted = after > before;
  say(
    `${shot} | files before ${before}, after ${after} | accepted: ${accepted}`,
  );
  await saveEvidence(page, `${shot}-end`);
  return { accepted, messages: seen.join(" | ") };
}

// Finds where the upload limit is: tries growing sizes and writes the table. It does not fail because
// of the limit itself (the screen states none, so we cannot say what is right); it fails only if even
// 1 MB is refused. The sizes can be changed: RES_SIZES="1,5,10"
test("RES-08h (extra test): find the largest file the site accepts", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const sizes = (process.env.RES_SIZES ?? "1,5,10,15").split(",").map(Number);
  const table: string[] = [];
  let largestOk = 0;
  let firstRefused = 0;
  for (const mb of sizes) {
    const f = test.info().outputPath(`qa_res_size_${mb}.pdf`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, "");
    fs.truncateSync(f, Math.round(mb * 1024 * 1024));
    const r = await bigUpload(
      page,
      f,
      `${PREFIX}size_${mb}mb`,
      `RES-08h-${mb}mb`,
    );
    fs.rmSync(f, { force: true });
    table.push(
      `${mb} MB: ${r.accepted ? "accepted" : "REFUSED"} (${r.messages})`,
    );
    if (r.accepted) largestOk = Math.max(largestOk, mb);
    else if (!firstRefused) firstRefused = mb;
  }
  say("RES-08h | table:\n" + table.join("\n"));
  note(
    `largest size accepted: ${largestOk} MB; first size refused: ${firstRefused || "none"} MB (the screen states no limit; the refusal message is "File Save Failed")`,
  );
  expect(largestOk, "even the smallest size was refused").toBeGreaterThan(0);
});

// RES-08a to 08e put the wrong files straight into the upload field. This one does what a person can do:
// DRAG a wrong file onto the upload area (the form says "Click to upload or drag & drop").
test("RES-08g (extra test): a .exe file dragged onto the upload area is rejected", async ({
  page,
}) => {
  await openFilesFolder(page);
  const before = await filesIn(page, FILES_FOLDER);
  await openFilesFolder(page);
  await page.getByRole("button", { name: "Add File" }).click();
  const d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800);

  const zone = d.getByText("Click to upload or drag & drop");
  const dt = await page.evaluateHandle(() => {
    const t = new DataTransfer();
    t.items.add(
      new File(["not a program, plain text"], "WRONG_dragged.exe", {
        type: "application/x-msdownload",
      }),
    );
    return t;
  });
  for (const ev of ["dragenter", "dragover", "drop"])
    await zone.dispatchEvent(ev, { dataTransfer: dt });
  await page.waitForTimeout(1500);
  const afterDrop = clean(await d.innerText());
  say(
    "RES-08g | the form after the drop:",
    JSON.stringify(afterDrop.slice(0, 300)),
  );
  await saveEvidence(page, "RES-08g-dropped");
  const registered = afterDrop.includes("WRONG_dragged");
  const refused =
    /unsupported|invalid|not allowed|not supported|wrong|type/i.test(
      afterDrop.replace("Supports PDF", ""),
    );
  expect(
    registered || refused,
    "the page did not react to the drop at all (a problem of the test, not of the site)",
  ).toBe(true);

  let saved = false;
  if (registered) {
    await d.getByPlaceholder("Enter name").fill("qa_res_wrong_08g");
    const msg = await act(page, "RES-08g", () =>
      d.getByRole("button", { name: "Save", exact: true }).click(),
    );
    saved = await expect(page.getByRole("dialog"))
      .toHaveCount(0, { timeout: 15_000 })
      .then(
        () => true,
        () => false,
      );
    say(`RES-08g | saved: ${saved} | message: ${msg}`);
    if (!saved) await closeDialogs(page);
  } else {
    say("RES-08g | the drop was refused with a message");
    await closeDialogs(page);
  }
  const after = await filesIn(page, FILES_FOLDER);
  expect(
    after,
    `files in the folder (the dragged .exe was ${saved ? "ACCEPTED" : "refused"})`,
  ).toBe(before);
});

// ---------- RES-09: tags, category, description ----------

test("RES-09: tags, category and description are saved and still there after a refresh", async ({
  page,
}) => {
  const title = "qa_res_meta";
  await openFilesFolder(page);
  await uploadFile(page, {
    path: sample("qa_doc_sample.pdf"),
    title,
    tags: ["qa1"],
    description: "qa_res_description_text",
    shot: "RES-09",
  });
  await expectSaved(page);

  await page.reload();
  await waitForResources(page);
  await folderBtn(page, FILES_FOLDER).first().click();
  await waitForFolder(page);
  await page.waitForTimeout(1500);
  await searchFiles(page, title);
  const row = rowOf(page, title);
  await expect(row).toBeVisible({ timeout: 20_000 });
  const rowText = clean(await row.innerText());
  say("RES-09 | the row reads:", JSON.stringify(rowText));
  note(
    `the description ${rowText.includes("qa_res_description_text") ? "IS" : "is NOT"} shown in the file list`,
  );
  await saveEvidence(page, "RES-09-row");

  await row.getByLabel("Edit", { exact: true }).click();
  const d = dialog(page);
  await expect(d.getByText("Edit File")).toBeVisible();
  await page.waitForTimeout(1000);
  const dText = clean(await d.innerText());
  say("RES-09 | edit form text:", JSON.stringify(dText.slice(0, 500)));
  await saveEvidence(page, "RES-09-edit");
  expect(await d.getByPlaceholder("Enter name").inputValue()).toBe(title);
  expect(await d.getByPlaceholder("Add description").inputValue()).toBe(
    "qa_res_description_text",
  );
  expect(dText, "the tag in the edit form").toContain("qa1");
  expect(dText, "the category in the edit form").toContain(FILES_FOLDER);
  await closeDialogs(page);
});

// ---------- RES-10: download ----------

test("RES-10: a downloaded file is identical to the original", async ({
  page,
}) => {
  const f = "qa_doc_sample.pdf";
  const title = await ensureUploaded(page, f);
  const r = await tryDownload(page, rowOf(page, title), "RES-10");
  await saveEvidence(page, "RES-10");
  expect(
    r.ok,
    `the file did not download. Messages: ${r.messages.join(" | ")}. Failed requests: ${r.bad.join(" | ")}`,
  ).toBe(true);
  expect(sha(r.file!)).toBe(sha(sample(f)));
});

test("RES-10b (extra test): download one file of each type", async ({
  page,
}) => {
  test.setTimeout(900_000);
  const results: string[] = [];
  for (const f of GOOD_FILES) {
    const title = await ensureUploaded(page, f);
    const r = await tryDownload(page, rowOf(page, title), `RES-10b-${f}`);
    const same = r.ok && r.file ? sha(r.file) === sha(sample(f)) : false;
    results.push(
      `${f}: ${r.ok ? (same ? "downloaded, identical" : "downloaded, DIFFERENT") : "FAILED " + r.bad.join(" ")}`,
    );
    expect
      .soft(r.ok && same, `${f} did not download as an identical file`)
      .toBe(true);
  }
  say("RES-10b | table:\n" + results.join("\n"));
});

// ---------- RES-11: edit and delete a file ----------

test("RES-11a: Edit changes the name and the description", async ({ page }) => {
  const f = "qa_doc_sample.pdf";
  const title = await ensureUploaded(page, f, {
    title: "qa_res_edit",
    description: "before",
  });
  const row = rowOf(page, title);
  await row.getByLabel("Edit", { exact: true }).click();
  const d = dialog(page);
  await expect(d.getByText("Edit File")).toBeVisible();
  await page.waitForTimeout(1000);
  await d.getByPlaceholder("Enter name").fill("qa_res_edit2");
  await d.getByPlaceholder("Add description").fill("after");
  const msg = await act(page, "RES-11a", () =>
    d.getByRole("button", { name: "Update" }).click(),
  );
  say("RES-11a | message:", msg);
  await expectSaved(page);

  await page.reload();
  await waitForResources(page);
  await folderBtn(page, FILES_FOLDER).first().click();
  await waitForFolder(page);
  await searchFiles(page, "qa_res_edit2");
  await expect(rowOf(page, "qa_res_edit2")).toBeVisible({ timeout: 20_000 });
  await rowOf(page, "qa_res_edit2").getByLabel("Edit", { exact: true }).click();
  await page.waitForTimeout(1000);
  expect(
    await dialog(page).getByPlaceholder("Add description").inputValue(),
  ).toBe("after");
  await saveEvidence(page, "RES-11a");
  await closeDialogs(page);
  await searchFiles(page, "qa_res_edit");
  await expect(page.getByText("qa_res_edit", { exact: true })).toHaveCount(0); // the old name is gone
});

test("RES-11b (extra test): the Edit form shows the file name, not a web link; tag chips have a proper name", async ({
  page,
}) => {
  const title = await ensureUploaded(page, "qa_doc_sample.pdf", {
    title: "qa_res_edit_b",
    tags: ["qa1"],
  });
  await rowOf(page, title).getByLabel("Edit", { exact: true }).click();
  const d = dialog(page);
  await expect(d.getByText("Edit File")).toBeVisible();
  await page.waitForTimeout(1000);
  const text = clean(await d.innerText());
  say("RES-11b | edit form text:", JSON.stringify(text.slice(0, 600)));
  const chipLabels = await d
    .locator("[aria-label^='Remove']")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  say("RES-11b | tag remove buttons are named:", JSON.stringify(chipLabels));
  await saveEvidence(page, "RES-11b");
  await closeDialogs(page);
  expect
    .soft(
      /GoogleAccessId|Signature=|https?:\/\//.test(text),
      "the Edit form shows a storage web link instead of the file name",
    )
    .toBe(false);
  expect
    .soft(
      chipLabels.some((l) => l.includes("[object Object]")),
      `a tag button is named ${JSON.stringify(chipLabels)}`,
    )
    .toBe(false);
});

test("RES-11c: Delete asks for confirmation, then removes the file", async ({
  page,
}) => {
  const title = await ensureUploaded(page, "qa_doc_sample.pdf", {
    title: "qa_res_del",
  });
  const before = await filesIn(page, FILES_FOLDER);
  await openFilesFolder(page);
  await searchFiles(page, title);
  await rowOf(page, title).getByLabel("Delete", { exact: true }).click();
  await page.waitForTimeout(800);
  const d = page.getByRole("dialog").last();
  const asked = await d.isVisible().catch(() => false);
  say(
    "RES-11c | confirmation shown:",
    asked,
    "| it says:",
    JSON.stringify(asked ? clean(await d.innerText()).slice(0, 300) : ""),
  );
  await saveEvidence(page, "RES-11c-question");
  expect(asked, "a confirmation before the file is deleted").toBe(true);
  const msg = await act(page, "RES-11c", () =>
    d
      .getByRole("button", { name: /^(delete|confirm|yes|ok|remove)/i })
      .first()
      .click(),
  );
  say("RES-11c | message:", msg);
  await expect(page.getByText(title, { exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
  expect(await filesIn(page, FILES_FOLDER), "files in the folder").toBe(
    before - 1,
  );
});

// ---------- RES-12: search and tag filter ----------

test("RES-12: search by title, by description, no match; folder search", async ({
  page,
}) => {
  await openFilesFolder(page);
  await uploadFile(page, {
    path: sample("qa_doc_sample.pdf"),
    title: "qa_res_alpha",
    description: "needle_one",
    shot: "RES-12-alpha",
  });
  await expectSaved(page);
  await uploadFile(page, {
    path: sample("qa_doc_sample.pdf"),
    title: "qa_res_beta",
    description: "needle_two",
    tags: ["qa1"],
    shot: "RES-12-beta",
  });
  await expectSaved(page);

  await searchFiles(page, "qa_res_alpha");
  await expect(page.getByText("qa_res_alpha", { exact: true })).toBeVisible();
  await expect(page.getByText("qa_res_beta", { exact: true })).toHaveCount(0);
  await saveEvidence(page, "RES-12-title");

  await searchFiles(page, "needle_two"); // a word that is only in a description
  await expect(page.getByText("qa_res_beta", { exact: true })).toBeVisible();
  await expect(page.getByText("qa_res_alpha", { exact: true })).toHaveCount(0);
  await saveEvidence(page, "RES-12-description");

  await searchFiles(page, "zzz_no_match_zzz");
  await expect(page.getByText(/No Resource Found/i)).toBeVisible();
  await saveEvidence(page, "RES-12-nomatch");

  // the folder search on the Resources page
  await openResources(page);
  const folderSearch = page.getByPlaceholder(/Search by category name/);
  await folderSearch.fill(FILES_FOLDER);
  await page.waitForTimeout(1500);
  const names = await folderNames(page);
  say("RES-12 | folder search for qa_res_files shows:", JSON.stringify(names));
  await saveEvidence(page, "RES-12-folder-search");
  expect(names).toContain(FILES_FOLDER);
  expect(names).not.toContain(HAND_FOLDER);
  await folderSearch.fill("zzz_no_match_zzz");
  await page.waitForTimeout(1500);
  say(
    "RES-12 | folder search with no match shows:",
    JSON.stringify(clean(await bodyText(page)).slice(0, 400)),
  );
  await saveEvidence(page, "RES-12-folder-nomatch");
  expect(await folderNames(page)).toHaveLength(0);
});

test("RES-12b (extra test): search ignores capital letters; the tag filter shows only tagged files", async ({
  page,
}) => {
  await openFilesFolder(page);
  await searchFiles(page, "QA_RES_ALPHA");
  const capsFound = await page
    .getByText("qa_res_alpha", { exact: true })
    .count();
  say("RES-12b | search in capital letters finds:", capsFound);
  expect
    .soft(capsFound, "a search in capital letters finds the file")
    .toBeGreaterThan(0);

  await searchFiles(page, "");
  await page.getByRole("button", { name: "qa1", exact: true }).click();
  await page.waitForTimeout(1500);
  await saveEvidence(page, "RES-12b-tag");
  const betaShown = await page
    .getByText("qa_res_beta", { exact: true })
    .count();
  const alphaShown = await page
    .getByText("qa_res_alpha", { exact: true })
    .count();
  say(
    `RES-12b | with the qa1 filter: beta (tagged) shown ${betaShown}, alpha (not tagged) shown ${alphaShown}`,
  );
  expect.soft(betaShown, "a file with the tag is shown").toBeGreaterThan(0);
  expect.soft(alphaShown, "a file without the tag is hidden").toBe(0);

  // what the tag bar looks like now (the "Select all" button may change once a tag is picked)
  say(
    "RES-12b | page after picking qa1:",
    JSON.stringify(clean(await bodyText(page)).slice(0, 500)),
  );
  const selectAll = page.getByText("Select all", { exact: true }).first();
  if (await selectAll.isVisible().catch(() => false)) {
    await selectAll.click();
    await page.waitForTimeout(1500);
    say(
      "RES-12b | after Select all, the page shows:",
      JSON.stringify(clean(await bodyText(page)).slice(0, 500)),
    );
    await saveEvidence(page, "RES-12b-select-all");
  } else {
    note(
      "after a tag is picked, the text 'Select all' is no longer on the screen (see the page text printed above)",
    );
  }
  // pressing the tag again must show every file again
  const tagAgain = page.getByText("qa1", { exact: true }).first();
  if (await tagAgain.isVisible().catch(() => false)) {
    await tagAgain.click().catch(() => {});
    await page.waitForTimeout(1500);
    say(
      "RES-12b | alpha shown after the tag is pressed again:",
      await page.getByText("qa_res_alpha", { exact: true }).count(),
    );
  }
});

// ---------- RES-14 and RES-15 (extra tests) ----------

test("RES-14 (extra test): the file count on a folder matches the files inside and changes with add and delete", async ({
  page,
}) => {
  // read only: the folder made by hand
  const badge = await filesIn(page, HAND_FOLDER);
  await openFolder(page, HAND_FOLDER);
  const first = await page.getByLabel("Download", { exact: true }).count();
  await page.getByRole("button", { name: "Go to next page" }).click();
  await page.waitForTimeout(2000);
  const second = await page.getByLabel("Download", { exact: true }).count();
  say(
    `RES-14 | ${HAND_FOLDER}: badge ${badge}, page 1 has ${first}, page 2 has ${second}`,
  );
  await saveEvidence(page, "RES-14-pages");
  expect(
    first + second,
    "files on all pages against the number on the folder",
  ).toBe(badge);

  // our own folder: +1 after an upload, -1 after a delete
  const start = await filesIn(page, FILES_FOLDER);
  await openFilesFolder(page);
  await uploadFile(page, {
    path: sample("qa_doc_sample.pdf"),
    title: "qa_res_count",
    shot: "RES-14-add",
  });
  await expectSaved(page);
  expect(await filesIn(page, FILES_FOLDER), "count after upload").toBe(
    start + 1,
  );
  await openFilesFolder(page);
  await searchFiles(page, "qa_res_count");
  await rowOf(page, "qa_res_count")
    .getByLabel("Delete", { exact: true })
    .click();
  await page.waitForTimeout(800);
  await dialog(page)
    .getByRole("button", { name: /^(delete|confirm|yes|ok|remove)/i })
    .first()
    .click();
  await page.waitForTimeout(2500);
  expect(await filesIn(page, FILES_FOLDER), "count after delete").toBe(start);
});

test("RES-15 (extra test): a double-click on Save makes only one folder and one file", async ({
  page,
}) => {
  await openResources(page);
  await page.getByRole("button", { name: "Add Folder" }).click();
  let d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800);
  await d.getByPlaceholder("Enter name").fill("qa_res_dbl");
  await d.getByRole("button", { name: "Save", exact: true }).dblclick();
  await page.waitForTimeout(3000);
  await closeDialogs(page);
  await page.reload();
  await waitForResources(page);
  const folders = (await folderNames(page)).filter(
    (n) => n === "qa_res_dbl",
  ).length;
  say("RES-15 | folders named qa_res_dbl:", folders);
  expect.soft(folders, "folders after a double-click on Save").toBe(1);

  await openFilesFolder(page);
  await page.getByRole("button", { name: "Add File" }).click();
  d = dialog(page);
  await expect(d.getByPlaceholder("Enter name")).toBeVisible();
  await page.waitForTimeout(800);
  await d
    .locator("input[type=file]")
    .setInputFiles(sample("qa_doc_sample.pdf"));
  await d.getByPlaceholder("Enter name").fill("qa_res_dblf");
  await d.getByRole("button", { name: "Save", exact: true }).dblclick();
  await page.waitForTimeout(4000);
  await closeDialogs(page);
  await searchFiles(page, "qa_res_dblf");
  const files = await page.getByText("qa_res_dblf", { exact: true }).count();
  say("RES-15 | files named qa_res_dblf:", files);
  await saveEvidence(page, "RES-15");
  expect.soft(files, "files after a double-click on Save").toBe(1);
});

// ---------- RES-13: the student and the junior faculty ----------

test("RES-13: a student can see and download a resource", async ({
  page,
  browser,
}) => {
  const title = await ensureUploaded(page, "qa_doc_sample.pdf", {
    title: "qa_res_student",
    description: "qa_res_student_description",
  });
  const { context, page: s } = await openAs(
    browser,
    STUDENT_AUTH,
    "/student/course-gate",
  );
  try {
    await studentOpenFolder(s, FILES_FOLDER);
    await saveEvidence(s, "RES-13-student-folder");
    const text = await bodyText(s);
    say(
      "RES-13 | the student sees:",
      JSON.stringify(clean(text).slice(0, 700)),
    );
    note(
      `the description ${text.includes("qa_res_student_description") ? "IS" : "is NOT"} shown to the student`,
    );
    await searchFiles(s, title).catch(() => {});
    await expect(
      s.getByText(title, { exact: true }).first(),
      "the file is visible to the student",
    ).toBeVisible({ timeout: 20_000 });
    const r = await tryDownload(s, rowOf(s, title), "RES-13-download");
    expect(
      r.ok,
      `the student's download failed. Messages: ${r.messages.join(" | ")}. Failed requests: ${r.bad.join(" | ")}`,
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test("RES-13b (extra test): a student has no Add, Edit or Delete tools", async ({
  page,
  browser,
}) => {
  await ensureUploaded(page, "qa_doc_sample.pdf", { title: "qa_res_student" });
  const { context, page: s } = await openAs(
    browser,
    STUDENT_AUTH,
    "/student/course-gate",
  );
  try {
    await studentOpenFolder(s, FILES_FOLDER);
    const inFolder = await toolsShown(s);
    say(
      "RES-13b | tools the student sees inside the folder:",
      JSON.stringify(inFolder),
    );
    await saveEvidence(s, "RES-13b-folder");
    expect
      .soft(
        inFolder.addFile + inFolder.edit + inFolder.delete,
        "the student sees Add File / Edit / Delete",
      )
      .toBe(0);

    // the faculty address of the Resources tab must not work for a student
    await s.goto(RES_PATH);
    await s.waitForTimeout(5000);
    say(
      "RES-13b | the student asked for the faculty address and ended on:",
      s.url(),
    );
    const viaAddress = await toolsShown(s);
    await saveEvidence(s, "RES-13b-faculty-address");
    expect
      .soft(s.url(), "the student is on a faculty page")
      .not.toMatch(/\/faculty\//);
    expect
      .soft(
        viaAddress.addFolder + viaAddress.addFile,
        "the student sees Add Folder / Add File on the faculty address",
      )
      .toBe(0);
  } finally {
    await context.close();
  }
});

test("RES-13c (extra test): a junior faculty can see the folders and files but has no Add, Edit or Delete", async ({
  page,
  browser,
}) => {
  test.skip(
    !JUNIOR_EMAIL || !fs.existsSync(JUNIOR_AUTH),
    "TEST_FACULTY3_EMAIL or .auth/faculty3.json is missing (run the setup first)",
  );
  await ensureUploaded(page, "qa_doc_sample.pdf", { title: "qa_res_student" });
  await setJunior(page, true);
  const { context, page: j } = await openAs(browser, JUNIOR_AUTH, RES_PATH);
  try {
    await expect(j.getByText("Resources").first()).toBeVisible({
      timeout: 30_000,
    });
    await j.waitForTimeout(4000);
    await dismissGuides(j);
    say("RES-13c | the junior's address:", j.url());
    say(
      "RES-13c | the junior sees:",
      JSON.stringify(clean(await bodyText(j)).slice(0, 600)),
    );
    await saveEvidence(j, "RES-13c-list");
    const names = await folderNames(j);
    say("RES-13c | folders the junior sees:", JSON.stringify(names));
    const list = await toolsShown(j);
    say("RES-13c | tools on the folder list:", JSON.stringify(list));
    expect.soft(names, "the junior sees the folders").toContain(FILES_FOLDER);
    expect
      .soft(
        list.addFolder + list.folderMenu,
        "the junior sees Add Folder or the folder menu",
      )
      .toBe(0);

    await folderBtn(j, FILES_FOLDER).first().click();
    await j.waitForTimeout(3000);
    await saveEvidence(j, "RES-13c-folder");
    const inFolder = await toolsShown(j);
    say("RES-13c | tools inside the folder:", JSON.stringify(inFolder));
    expect
      .soft(
        await j.getByText("qa_res_student", { exact: true }).count(),
        "the junior sees the file",
      )
      .toBeGreaterThan(0);
    expect
      .soft(
        inFolder.addFile + inFolder.edit + inFolder.delete,
        "the junior sees Add File / Edit / Delete",
      )
      .toBe(0);
    note(
      "the junior's download is not tested here: download is broken for everyone (RES-10)",
    );
  } finally {
    await context.close();
    await setJunior(page, false);
  }
});

// ---------- Clean-up ----------

test("RES-99: delete everything the tests made; the folders are back to the start", async ({
  page,
}) => {
  test.setTimeout(900_000);
  await deleteTestFolders(page);
  await deleteEmptyCourse(page);
  await openResources(page);
  const names = await folderNames(page);
  const counts: Record<string, number> = {};
  for (const n of names) counts[n] = await folderCount(page, n);
  say("RES-99 | folders left:", JSON.stringify(counts));
  await saveEvidence(page, "RES-99");
  const start = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  expect(counts).toEqual(start);
  note("only qa_res_ things were deleted; qa_course_1 stays");
});
