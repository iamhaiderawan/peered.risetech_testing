# PeerEd faculty portal: UI tests (Playwright)

UI test automation for the PeerEd faculty portal (staging site), written while learning software quality assurance.
Every module has its own test file and its own written report.

> The target is a **staging** site. Use your own test account and never commit passwords.

## Results so far

| Module                         | File                      | Cases | Result                                   |
| ------------------------------ | ------------------------- | ----- | ---------------------------------------- |
| 1. Login                       | `tests/login.spec.ts`     | 12    | 12 pass                                  |
| 2. Dashboard                   | `tests/dashboard.spec.ts` | 11    | 10 pass, 1 fail (bug F9)                 |
| 3. Courses list and Add Course | `tests/courses.spec.ts`   | 18    | 14 pass, 4 fail (bugs F7, F11, F12, F13) |

A failing test here means a real problem found on the site, not a broken test. Each one is written up in the reports with a screenshot.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env      # then edit .env with your own test account
node -e "require('fs').writeFileSync('test-data/test-large.png', Buffer.alloc(12*1024*1024))"
```

The last line creates the 12 MB file that case CRS-13 uses to test the 5 MB picture limit.

## Run

```bash
npx playwright test tests/login.spec.ts
npx playwright test tests/dashboard.spec.ts
npx playwright test tests/courses.spec.ts
npx playwright test -g "CRS-13"        # one case by its ID
npx playwright test --headed           # watch the browser
```

A `setup` project logs in once and saves the session to `.auth/faculty.json`, so the other files do not log in again.

## Layout

```
tests/
  auth.setup.ts      logs in once, saves the session
  login.spec.ts      Module 1
  dashboard.spec.ts  Module 2
  courses.spec.ts    Module 3
test-data/           small files used to test picture upload
playwright.config.ts
.env.example
```

## Notes

- Test IDs (LOG, DSH, CRS ...) come from the test plan; screenshots are saved to `evidence/<module>/`.
- Courses created by the tests start with `qa_crs_` and are removed at the end (CRS-99 checks the course counts return to the start).
- Bugs and open questions for the developer are tracked in a separate workbook and on the team board.
