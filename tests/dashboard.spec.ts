import { test, expect, Page, Browser, Locator } from "@playwright/test";
import fs from "fs";

// Dashboard module - test IDs match the testing plan (section 4.2).
// Screenshots are saved to evidence/dashboard/ for the results report.
// The session comes from tests/auth.setup.ts (.auth/faculty.json).

const AUTH_FILE = ".auth/faculty.json";
const EVIDENCE_DIR = "evidence/dashboard";
const EMAIL = process.env.TEST_EMAIL!;
const FACULTY_MENU = /Dr\. Asad/;

// Everything the data tests create starts with qa_dash_ and is deleted at the end.
const COURSE = "qa_dash_course_01";
const QUESTION = "qa_dash_question_01";
const CONTEST = "qa_dash_contest_01";

test.use({ storageState: AUTH_FILE });

test.beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
});

// ---------- Small helpers ----------

async function saveEvidence(page: Page, name: string) {
  // Pages and pop-ups fade in and out. Wait a moment so the picture is not taken half-faded.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

// Guides (video pop-ups and tours) open by themselves on some pages and block clicks.
// This closes them: the "Skip" button of a tour, or a "Close ..." button.
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

async function openDashboard(page: Page) {
  await page.goto("/faculty/dashboard");
  await expect(page.getByText("Faculty Dashboard")).toBeVisible();
  await dismissGuides(page, 2500);
  await expect
    .poll(async () =>
      /Active Contests\s+\d+/.test(await page.locator("body").innerText()),
    )
    .toBe(true);
}

// Reads the numbers on the four cards.
async function readDashboard(page: Page) {
  const text = await page.locator("body").innerText();
  const num = (re: RegExp) => {
    const m = text.match(re);
    if (!m) throw new Error(`Could not find ${re} on the dashboard`);
    return Number(m[1]);
  };
  return {
    courses: num(/My Courses\s+(\d+)/),
    owned: num(/Owned:\s*(\d+)/),
    managed: num(/Managed:\s*(\d+)/),
    shared: num(/Shared:\s*(\d+)/),
    mcqs: num(/Total MCQs\s+(\d+)/),
    helpRequests: num(/Pending Help Requests\s+(\d+)/),
    activeContests: num(/Active Contests\s+(\d+)/),
  };
}

async function dashboardNow(page: Page) {
  await openDashboard(page);
  return readDashboard(page);
}

function localDateTime(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function bgOf(page: Page, name: string) {
  return page
    .getByRole("link", { name, exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

// ---------- Read-only tests ----------

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test("DSH-01: the dashboard loads with the four cards and their numbers", async ({
    page,
  }) => {
    for (const label of [
      "My Courses",
      "Total MCQs",
      "Pending Help Requests",
      "Active Contests",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    const numbers = await readDashboard(page);
    expect(numbers.courses).toBeGreaterThanOrEqual(0);
    await expect(page.getByText("Owned:")).toBeVisible();
    await saveEvidence(page, "DSH-01");
  });

  test("DSH-02: the My Courses card opens the Courses page", async ({
    page,
  }) => {
    await page.getByText("My Courses", { exact: true }).click();
    await expect(page).toHaveURL(/\/faculty\/courses/);
    await expect(
      page.getByRole("button", { name: "Add Course" }),
    ).toBeVisible();
    await expect(page.locator("h6").first()).toBeVisible(); // the course cards have loaded
    await saveEvidence(page, "DSH-02");
  });

  test("DSH-03: the other three cards are not clickable", async ({ page }) => {
    const cursorOf = (label: string) =>
      page
        .getByText(label, { exact: true })
        .evaluate((el) => getComputedStyle(el).cursor);

    expect(await cursorOf("My Courses")).toBe("pointer");
    for (const label of [
      "Total MCQs",
      "Pending Help Requests",
      "Active Contests",
    ]) {
      expect(await cursorOf(label)).toBe("not-allowed");
      await page.getByText(label, { exact: true }).click();
      await expect(page).toHaveURL(/\/faculty\/dashboard/);
    }
    await saveEvidence(page, "DSH-03");
  });

  test("DSH-04: the My Courses number matches the Courses page", async ({
    page,
  }) => {
    const numbers = await readDashboard(page);
    expect(numbers.owned + numbers.managed + numbers.shared).toBe(
      numbers.courses,
    );

    await page.getByText("My Courses", { exact: true }).click();
    await expect(page).toHaveURL(/\/faculty\/courses/);
    await expect(
      page.getByRole("button", { name: "Add Course" }),
    ).toBeVisible();
    // The number next to the "Courses" heading appears a moment after the page opens,
    // so we wait for it instead of reading it once.
    await expect
      .poll(async () => {
        const text = await page.locator("body").innerText();
        const m = text.match(/Courses\s+(\d+)/);
        return m ? Number(m[1]) : -1;
      })
      .toBe(numbers.courses);
    await expect(page.locator("h6").first()).toBeVisible(); // the course cards have loaded
    await saveEvidence(page, "DSH-04");
  });

  for (const [id, name, url, shown] of [
    [
      "DSH-08a",
      "Courses",
      /\/faculty\/courses/,
      (p: Page) => p.getByRole("button", { name: "Add Course" }),
    ],
    [
      "DSH-08b",
      "Review Questions",
      /\/faculty\/review-questions/,
      (p: Page) => p.getByText("Filter by Batch").first(),
    ],
    [
      "DSH-08c",
      "OSCE",
      /\/faculty\/osce/,
      (p: Page) => p.getByText("Patient Cases").first(),
    ],
  ] as const) {
    test(`${id}: the '${name}' header link opens its page and is highlighted`, async ({
      page,
    }) => {
      await page.getByRole("link", { name, exact: true }).click();
      await dismissGuides(page);
      await expect(page).toHaveURL(url);
      await expect(shown(page)).toBeVisible();

      // The link of the current page looks different from another link.
      const other = name === "Courses" ? "OSCE" : "Courses";
      expect(await bgOf(page, name)).not.toBe(await bgOf(page, other));
      await saveEvidence(page, id);
    });
  }

  test("DSH-08d: the 'Dashboard' header link returns to the dashboard from another page", async ({
    page,
  }) => {
    await page.getByRole("link", { name: "Courses", exact: true }).click();
    await expect(page).toHaveURL(/\/faculty\/courses/);
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/faculty\/dashboard/);
    await expect(page.getByText("Faculty Dashboard")).toBeVisible();
    await saveEvidence(page, "DSH-08d");
  });

  test("DSH-09: My Banks shows Private Bank and Departmental Bank and both open", async ({
    page,
  }) => {
    // My Banks is a HOVER menu: it shows while the mouse is over it and closes as soon as
    // the mouse goes anywhere else. So the test hovers, then walks the mouse down to the item.
    const myBanks = page.getByText("My Banks", { exact: true });
    const privateItem = page.getByText("Private Bank", { exact: true });
    const departmentalItem = page.getByText("Departmental Bank", {
      exact: true,
    });

    const openBanks = async () => {
      await myBanks.hover();
      await expect(departmentalItem).toBeVisible();
      await page.waitForTimeout(500); // let the menu finish sliding in
    };
    // Move the mouse away from the header and wait until the menu has closed.
    const closeBanks = async () => {
      await page.mouse.move(640, 500);
      await expect(departmentalItem).toBeHidden();
    };
    // Walk the mouse to the item in small steps, so it never leaves the menu on the way.
    const pickItem = async (item: Locator) => {
      const box = await item.boundingBox();
      if (!box) throw new Error("The menu item has no position on the screen");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 15,
      });
      await item.click();
    };

    await openBanks();
    await expect(privateItem).toBeVisible();
    await expect(departmentalItem).toBeVisible();
    await saveEvidence(page, "DSH-09-menu-open");

    // The menu closes when the mouse leaves it.
    await closeBanks();
    await saveEvidence(page, "DSH-09-menu-closed");

    await openBanks();
    await pickItem(privateItem);
    await expect(page).toHaveURL(/\/faculty\/private-bank/);
    await closeBanks(); // the menu is gone, so only the page itself is in the picture
    await expect(
      page.getByText("Private Bank", { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await saveEvidence(page, "DSH-09-private-bank");

    await openBanks();
    await pickItem(departmentalItem);
    await expect(page).toHaveURL(/\/faculty\/departmental-bank/);
    // On this page the heading is also "Departmental Bank", so wait for the menu's
    // description text to disappear instead, then check the heading is the one visible.
    await page.mouse.move(640, 500);
    await expect(page.getByText("Access departmental bank")).toBeHidden();
    await expect(
      page
        .getByText("Departmental Bank", { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await saveEvidence(page, "DSH-09-departmental-bank");
  });

  test("DSH-10: the Quick Tour walks through four steps and can be closed", async ({
    page,
  }) => {
    const steps = [
      "Open your courses.",
      "The total number of questions across your courses.",
      "Help requests from students that are waiting for your answer.",
      "Contests that are live right now.",
    ];
    await page.getByRole("button", { name: "Quick Tour" }).click();
    for (const [i, text] of steps.entries()) {
      await expect(
        page.getByText(new RegExp(`Step ${i + 1} of 4`)),
      ).toBeVisible();
      await expect(page.getByText(text)).toBeVisible();
      if (i === 0) await saveEvidence(page, "DSH-10-step-1");
      if (i < steps.length - 1) {
        await page.getByRole("button", { name: "Next" }).click();
      }
    }
    await saveEvidence(page, "DSH-10-step-4");

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(/Your Dashboard/)).toHaveCount(0);

    // It can also be closed with Skip.
    await page.getByRole("button", { name: "Quick Tour" }).click();
    await expect(page.getByText(/Step 1 of 4/)).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByText(/Step 1 of 4/)).toHaveCount(0);
  });

  test("DSH-11: the profile menu opens and closes, and the theme is kept after a refresh", async ({
    page,
  }) => {
    // Profile menu
    await page.getByRole("button", { name: FACULTY_MENU }).click();
    for (const item of ["Edit Profile", "Bookmarks", "Logout"]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
    await expect(page.getByText(EMAIL)).toBeVisible();
    await saveEvidence(page, "DSH-11-profile-menu");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem")).toHaveCount(0);

    // Theme
    const body = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const toggle = page.getByRole("button", {
      name: /Switch to (dark|light) mode/,
    });
    // The colour fades slowly, so wait until two readings in a row are the same
    // (reading it in the middle of the fade gave a wrong value before).
    const settled = async () => {
      let last = await body();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(400);
        const now = await body();
        if (now === last) return now;
        last = now;
      }
      return last;
    };
    const before = await settled();

    await toggle.click();
    await expect.poll(body).not.toBe(before);
    const changed = await settled();
    await saveEvidence(page, "DSH-11-theme-changed");

    await page.reload();
    await expect(page.getByText("Faculty Dashboard")).toBeVisible();
    await expect.poll(body).toBe(changed);

    await toggle.click();
    await expect.poll(body).toBe(before);
  });
});

// ---------- Data tests: create, check the dashboard, delete ----------
// Run one after the other. Everything created here starts with qa_dash_ and
// is removed at the end, even when a test fails. Nothing else is ever deleted.

async function cleanUp(browser: Browser) {
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    baseURL: process.env.BASE_URL,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000); // a missing item must fail fast, not wait for a minute
  page.setDefaultNavigationTimeout(30_000);
  const short = { timeout: 4000 };

  const step = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
      console.log(`CLEANUP | ${name}: done`);
    } catch (e) {
      console.log(
        `CLEANUP | ${name}: skipped (${String((e as Error).message).split("\n")[0]})`,
      );
    }
  };

  const findCourse = async () => {
    await page.goto("/faculty/courses");
    await dismissGuides(page, 800);
    await page.getByPlaceholder(/Search by title/).fill(COURSE);
    await expect(page.getByText(COURSE, { exact: true })).toBeVisible(short);
  };
  // The smallest block that holds both the title and an unnamed (three-dots) button.
  const cardOf = (text: string) =>
    page
      .locator("div")
      .filter({ has: page.getByText(text, { exact: true }) })
      .filter({ has: page.getByRole("button").filter({ hasText: /^$/ }) })
      .last();
  // The three-dots button of a card. On the course cards it has aria-haspopup="menu"
  // (found in the DOM discovery). If a card has no such button, take its first unnamed button.
  const dotsOf = (text: string) => {
    const card = cardOf(text);
    return card
      .locator("button[aria-haspopup='menu']")
      .or(card.getByRole("button").filter({ hasText: /^$/ }))
      .first();
  };

  await step("remove the contest", async () => {
    await findCourse();
    await page.getByText(COURSE, { exact: true }).click();
    await dismissGuides(page, 800);
    await page.getByRole("tab", { name: "Contests" }).click();
    await dismissGuides(page, 2500); // a video guide opens on this tab
    const title = page.getByText(CONTEST, { exact: true });
    await expect(title).toBeVisible(short);

    await dotsOf(CONTEST).click();
    await page.getByRole("menuitem").first().waitFor(short);
    // A LIVE contest cannot be deleted: it has to be ended first.
    const end = page.getByRole("menuitem", { name: /End Contest/ });
    if (await end.isVisible()) {
      await end.click();
      await page.getByRole("button", { name: "End Contest" }).click();
      await expect(cardOf(CONTEST)).toContainText("ENDED", short);
      await dotsOf(CONTEST).click();
    }
    await page.getByRole("menuitem", { name: /^Delete/ }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(title).toHaveCount(0, short);
  });

  await step("delete the question in the course", async () => {
    await findCourse();
    await page.getByText(COURSE, { exact: true }).click();
    await dismissGuides(page, 800);
    await page.getByRole("tab", { name: "Question Bank" }).click();
    const row = page.getByRole("row").filter({ hasText: QUESTION });
    await expect(row).toBeVisible(short);
    await row.getByRole("button", { name: "Delete Question" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, short);
  });

  await step("delete the course", async () => {
    await findCourse();
    await dotsOf(COURSE).click();
    await page.getByRole("menuitem", { name: /Delete Course/ }).click();
    await page.getByRole("textbox", { name: /Type/ }).fill(COURSE);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(COURSE, { exact: true })).toHaveCount(0, short);
  });

  await step("delete the question from the Private Bank", async () => {
    await page.goto("/faculty/private-bank");
    await dismissGuides(page, 800);
    // The newest question is at the top of the list, so no search is needed.
    const row = page.getByRole("row").filter({ hasText: QUESTION });
    await expect(row).toBeVisible(short);
    await row.getByRole("button").last().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, short);
  });

  await context.close();
}

test.describe.serial("Dashboard - data tests (create, check, delete)", () => {
  test.setTimeout(150_000);
  // No automatic retry here: a retry would repeat the 3-minute contest wait.
  test.describe.configure({ retries: 0 });

  let baseline: Awaited<ReturnType<typeof readDashboard>>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // Remove anything left over from an earlier run that stopped halfway.
    await cleanUp(browser);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await cleanUp(browser);

    // Housekeeping check: after the clean-up the numbers must be back where they started.
    // It is here, and not a test, so that a failed DSH-07 cannot skip it.
    if (!baseline) return;
    const context = await browser.newContext({
      storageState: AUTH_FILE,
      baseURL: process.env.BASE_URL,
    });
    const page = await context.newPage();
    const after = await dashboardNow(page);
    await saveEvidence(page, "DSH-cleanup");
    await context.close();
    console.log(`DASHBOARD | after clean-up: ${JSON.stringify(after)}`);
    expect({
      courses: after.courses,
      mcqs: after.mcqs,
      activeContests: after.activeContests,
    }).toEqual({
      courses: baseline.courses,
      mcqs: baseline.mcqs,
      activeContests: baseline.activeContests,
    });
  });

  async function openOurCourse(page: Page) {
    await page.goto("/faculty/courses");
    await page.getByPlaceholder(/Search by title/).fill(COURSE);
    await page.getByText(COURSE, { exact: true }).click();
    await dismissGuides(page);
    await expect(
      page.getByRole("tab", { name: "Question Bank" }),
    ).toBeVisible();
  }

  test("DSH-06: adding a course raises the My Courses number by 1", async ({
    page,
  }) => {
    baseline = await dashboardNow(page);
    console.log(`DASHBOARD | baseline: ${JSON.stringify(baseline)}`);

    await page.goto("/faculty/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByPlaceholder("Course title").fill(COURSE);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByPlaceholder(/Search by title/).fill(COURSE);
    await expect(page.getByText(COURSE, { exact: true })).toBeVisible();

    await openDashboard(page);
    await expect
      .poll(async () => (await readDashboard(page)).courses)
      .toBe(baseline.courses + 1);
    const after = await readDashboard(page);
    expect(after.owned).toBe(baseline.owned + 1);
    await saveEvidence(page, "DSH-06");
  });

  test("DSH-05: adding a question raises the Total MCQs number by 1", async ({
    page,
  }) => {
    const before = await dashboardNow(page);

    await openOurCourse(page);
    await page.getByRole("tab", { name: "Question Bank" }).click();
    await page.getByRole("button", { name: "Actions" }).click();
    // "Bulk Add Questions" also contains these words, so match the start only.
    await page.getByRole("menuitem", { name: /^Add Question/ }).click();
    await dismissGuides(page);

    await page
      .getByRole("textbox", { name: /clinical scenario/ })
      .fill(QUESTION);
    await page.getByRole("textbox", { name: /actual question/ }).fill(QUESTION);
    for (const [i, text] of ["1", "2", "3", "4"].entries()) {
      await page
        .locator(`textarea[name="mcqs.0.options.${i}.text"]`)
        .fill(text);
    }
    // Clicking the letter C marks option C as the correct answer.
    await page.locator("div").filter({ hasText: /^C$/ }).first().click();
    await page
      .getByRole("textbox", { name: /clear explanation/ })
      .fill("qa_dash_explanation");
    await saveEvidence(page, "DSH-05-form-filled");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Saving takes 5-8 seconds (the site asks the AI for feedback). Then a
    // "Question Feedback" pop-up appears; closing it opens a new, empty question form.
    const feedback = page.getByRole("heading", { name: "Question Feedback" });
    await feedback.waitFor({ state: "visible", timeout: 45_000 });
    await saveEvidence(page, "DSH-05-saved");
    await feedback.getByRole("button").click();

    // The site does not go back to the Question Bank by itself, so go back to the course.
    await openOurCourse(page);
    // The page text reads "Bank Questions1" (no space), so the space is optional here.
    await expect(page.locator("body")).toContainText(
      /Bank Questions\s*1(?!\d)/,
    );

    await openDashboard(page);
    await expect
      .poll(async () => (await readDashboard(page)).mcqs)
      .toBe(before.mcqs + 1);
    await saveEvidence(page, "DSH-05");
  });

  test("DSH-07: a LIVE contest raises the Active Contests number by 1", async ({
    page,
  }) => {
    // The contest starts in 3 minutes, so this test waits for it to go LIVE.
    test.setTimeout(600_000);
    const before = await dashboardNow(page);

    await openOurCourse(page);
    const courseUrl = page.url();
    const openContests = async () => {
      await page.goto(courseUrl);
      await page.getByRole("tab", { name: "Contests" }).click();
      await dismissGuides(page, 2500); // a video guide opens on this tab
    };
    await page.getByRole("tab", { name: "Contests" }).click();
    await dismissGuides(page, 2500);
    await page.getByRole("button", { name: "New Contest" }).click();
    const dialog = page.getByRole("dialog", { name: "New Contest" });
    await dialog.getByRole("textbox").first().fill(CONTEST);

    // A start date in the past can only be saved as Draft, so the contest starts
    // 3 minutes from now, ends tomorrow, and is set to Upcoming.
    const dates = dialog.locator('input[type="datetime-local"]');
    await dates.nth(0).fill(localDateTime(3));
    await dates.nth(1).fill(localDateTime(24 * 60));

    // The Status list only offers Draft and Upcoming.
    // The text "Draft" sits under an invisible layer of the drop-down, so a click on it is
    // blocked. Click the drop-down itself (the first one in the form is Status).
    await dialog.getByRole("combobox").first().click();
    await page.getByText("Upcoming", { exact: true }).click();
    await expect(dialog.getByText("Upcoming", { exact: true })).toBeVisible();

    // Pick the question DSH-05 added to this course.
    await dialog.getByRole("tab", { name: /Questions/ }).click();
    await dialog
      .getByRole("row", { name: new RegExp(QUESTION) })
      .getByRole("checkbox")
      .check();
    await dialog.getByRole("button", { name: "Save Selection" }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(CONTEST, { exact: true })).toBeVisible();
    await expect(page.getByText("UPCOMING").first()).toBeVisible();
    await saveEvidence(page, "DSH-07-contest-upcoming");

    // While the contest is only Upcoming, the Dashboard must not count it.
    const whileUpcoming = await dashboardNow(page);
    expect(whileUpcoming.activeContests).toBe(before.activeContests);

    // Wait until the site itself changes the badge to LIVE (about 3 minutes).
    await expect
      .poll(
        async () => {
          await openContests();
          return (await page.locator("body").innerText()).includes("LIVE");
        },
        { timeout: 6 * 60_000, intervals: [15_000] },
      )
      .toBe(true);
    await saveEvidence(page, "DSH-07-contest-live");

    // Known problem F9: the Dashboard still shows the old number although the contest is LIVE.
    await openDashboard(page);
    try {
      await expect
        .poll(async () => (await readDashboard(page)).activeContests, {
          timeout: 30_000,
        })
        .toBe(before.activeContests + 1);
    } finally {
      await saveEvidence(page, "DSH-07-dashboard-after-live");
    }
  });
});
