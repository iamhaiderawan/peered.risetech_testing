# Session notes

## 2026-11-02

- Modules 1 to 3 (Login, Dashboard, Courses) are done and pushed. Results: Login 12/12 pass, Dashboard 10 pass 1 fail (bug F9), Courses 14 pass 4 fail (bugs F7, F11, F12, F13).
- Questions for the developer are on the Kanban card "Questions for the Developer" (Q1 to Q14).
- Next: Module 4 (Course overview and members) and Module 5 (Resources), inside a new course `qa_course`.

## 2026-11-04 to 2026-11-10: Module 4 (Course overview and members)

- Tests are in `tests/overview.spec.ts`: OVW-00 (clean start), the plan cases OVW-01 to OVW-20, the extra test OVW-10b, and OVW-99 (clean-up). OVW-08 and OVW-16 are split into several tests, one per wrong file. 37 tests in total, plus 2 setup steps in `tests/auth.setup.ts` (faculty login and student login, saved in `.auth/`).
- OVW-00 must run first (it creates `qa_course` and records the course numbers); OVW-99 deletes it and compares the numbers. To run one test: `-g "OVW-00|OVW-05"`.
- Final full run on 2026-11-10 (`evidence/overview-run-output.txt`): 39 tests, 34 passed, 5 failed (28.7 minutes). All 5 failures are real bugs of the site, not test problems.
- Plan cases: 17 pass, 3 fail (OVW-08, OVW-16, OVW-18). The extra test OVW-10b also fails.
- Clean-up check: after the run the Courses page is back at 25 courses (11 archived).
- Samples: one set of sample files in `sample/peered-samples/`, built from real staging student and faculty emails. The 12.8 MB file `enroll_WRONG_over_10MB.xlsx` is not in the repository (too big, in `.gitignore`); it stays on the tester's computer.
- Second faculty account in `.env` (`TEST_FACULTY2_*`): Dr. Asad (Senior Faculty). He is not the owner Dr. Asad Mansoor Khan (HoD).

Bugs (F15 to F19):

- F15 (Medium) OVW-08: Bulk Enroll accepts a 12.8 MB file although the screen says the limit is 10 MB.
- F16 (Medium) OVW-10b: a Senior Faculty can switch off his own Access and then loses Manage Members.
- F17 (Medium) OVW-16: Post Hoc Analysis accepts a file with no answer-key row (the first student row becomes the key).
- F18 (Low) OVW-16: Post Hoc Analysis accepts a .csv file although the pop-up says .xlsx / .xls.
- F19 (High) OVW-18: a student who clicks an enrolled course is sent back to the student dashboard; the course never opens (so the read-only check of Student Activity could not be done).

Findings (F20 to F24, all Low):

- F20 OVW-14: an empty description is saved with a success message.
- F21 OVW-02: which number the header "Questions" badge should match (Total, Bank or Student Questions).
- F22 OVW-16: a .txt file gets the generic message "No Question Data Found In The Uploaded File." instead of a wrong-file-type message.
- F23 OVW-08: Bulk Enroll saves the valid rows of a partly wrong file and reports the others (accepted as intended).
- F24 OVW-19: every student sees every course under "Available to Join" without an invitation.

Decided as intended (not reported):

- Export Faculty shows the owner's role as "admin": it means course owner (confirmed by the developer). OVW-11 expects "admin".
- The Access switch is greyed out for faculty who are not in the course and becomes usable after they are added (it depends on the role).

Other notes:

- The tests share one course, so what an earlier test leaves in it can show in a later one (for example the tag from OVW-13 stays until OVW-99).
- Not tested yet: the rights of a Junior Faculty. To do in another module, after exploring with the Junior Faculty account.
- When F19 is fixed, OVW-18 must be run again from the student account.
- Added dev dependency `exceljs` (reads downloaded Excel files).
- Reports: `PeerEd_Module4_Overview_Test_Report.docx` written and attached to the Kanban card. The workbook `PeerEd_UI_Test_Execution_Report.xlsx` is updated (Test Results, Findings F15 to F24, Bugs for Developer, Developer Q&A, Test Runs, Daily Log). Word reports and the workbook are not in this repository.
- Kanban: Module 4 card has the description and the comment. The Questions card gets 8 new questions, Q15 to Q22 (the workbook numbers them differently; match them by F-number).

## 2026-11-12 to 2026-11-16: Module 5 (Resources)

- From this module on the tests run on the **development site** (the developer asked for it and it is more up to date than staging). Set `BASE_URL` in `.env` to its address. Modules 1 to 4 are staging results. The development site has its own data, so the course `qa_course` there is one the tester made himself.
- Tests are in `tests/resources.spec.ts`: RES-00 (clean start, records the folders in `evidence/resources/baseline.json`), the plan cases RES-01 to RES-13, 11 extra tests, and RES-99 (clean-up). 52 tests in total, plus 3 setup steps in `tests/auth.setup.ts` (faculty, student and Junior Faculty logins, saved in `.auth/`).
- The Junior Faculty login needs `TEST_FACULTY3_EMAIL` and `TEST_FACULTY3_PASSWORD` in `.env` (see `.env.example`). Without them the setup step and the Junior Faculty test (RES-13c) skip themselves. RES-13c adds him to `qa_course` through Manage Faculty and removes him again at the end.
- Everything the tests create starts with `qa_res_`. RES-99 deletes it and the folders are back at `qa_course_1` (16 files) and `f2` (0 files). `qa_course_1` and `f2` were there before and are never touched.
- Run it all: `npx playwright test tests/resources.spec.ts --headed`. One test: `-g "RES-00|RES-02"` (RES-00 first). Settings you can put before the command: `RES_BIG_MB=120` sets the size of the very large file in RES-08f (default 120), `RES_SIZES="1,5,10,15"` sets the sizes tried in RES-08h, `RES_PATH` sets the Resources page address if the course changes.
- Final full run on 2026-11-16 (`evidence/resources-run-final.txt`): 55 tests, 43 passed, 12 failed (39.7 minutes). The 43 include the 3 setup steps. 11 of the 12 failures come from bugs of the site; 1 (RES-08f) from a finding. Several tests hit the same bug.
- Plan cases: 10 pass, 3 fail (RES-08, RES-10, RES-13). Extra tests: RES-04b, RES-08g, RES-10b and RES-11b fail; RES-06b, RES-12b, RES-13b, RES-13c, RES-14 and RES-15 pass; RES-08h only measures (1, 5, 10 and 15 MB are accepted; 20 MB and 120 MB were refused in earlier runs).
- Samples: `sample/peered-res-samples/` has 24 small files. The ones starting with `WRONG_` are the files the site should refuse (an empty file, a text file renamed to .pdf or .png, an .exe, a .xyz). The 120 MB file of RES-08f is made by the test itself and is not stored.

Bugs (F25 to F30):

- F25 (High) RES-10, RES-10b, RES-13: Download fails with a server error (500) for every file type, for the faculty and for the student.
- F26 (Medium) RES-04b: a folder can be renamed to a name that already exists (Add Folder refuses it).
- F27 (Medium) RES-04b: deleting one of two folders with the same name deletes both, with the files inside.
- F28 (Medium) RES-08c, RES-08d, RES-08g: unsupported file types (.exe, .xyz) are accepted, also when dragged onto the upload area.
- F29 (Low) RES-08a, RES-08b, RES-08e: a text file renamed to .pdf or .png and an empty file are accepted.
- F30 (Low) RES-11b: the tag chips in the Edit File form are named "Remove [object Object]".

Findings (F31 to F37, all Low):

- F31 RES-11b: the Edit File form shows a long storage link instead of the file name.
- F32 RES-08f, RES-08h: files over about 15 to 20 MB fail with only "File Save Failed", and no limit is shown.
- F33 RES-03c: the folder name box stops at 30 characters without a message.
- F34 RES-06b: .csv is not in the form's list of types but is accepted when put straight into the field.
- F35 RES-09, RES-13: the file description is not shown in the file list or to the student.
- F36 RES-06: every file row shows the words "Unknown" and a dash in two places; what they should show is not clear.
- F37 RES-07a: Save with a name but no file gives no message.

Other notes:

- The Watch Guide video and the Quick Tour can cover the page on the development site and hide the buttons from role queries. The tests wait for the text first, close the pop-up, and then look for the button (`guardGuides` and `dismissGuides` in `resources.spec.ts`).
- A folder with 0 files shows no file-count chip, so a missing chip counts as 0.
- The folder name box has `maxlength` 30. The Add File form accepts the types in its `accept` list; `setInputFiles` ignores that list, so the tests can try other types.
- The student sees the Resources folders on the student dashboard (no Resources tab). Download is a text button for the student and an icon button with the label "Download" for the faculty.
- When the download is fixed (F25), RES-10, RES-10b and RES-13 must be run again, and the Junior Faculty download must be checked.
- Test plan: the 165 cases are unchanged. The extra tests are listed under "Added during testing" in `docs/test-plan.md`, with one new cross-cutting row, XC-11 (Junior Faculty rights in every module; checked for Resources only).
- Reports: `PeerEd_Module5_Resources_Test_Report.docx` written; the workbook `PeerEd_UI_Test_Execution_Report.xlsx` and the Word plan are updated. They are not in this repository.
- Kanban: Module 5 card has the description and the comment. The Questions card gets 7 new questions, Q23 to Q29 (Q29 to Q35 in the workbook; match them by F-number).

Next: Module 6 (Question Bank). Later: the Junior Faculty check in the other modules (XC-11), and OVW-18 again when F19 is fixed.
