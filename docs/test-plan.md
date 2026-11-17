# PeerEd test plan (all modules)

Copied from the test plan (PeerEd Testing Workflow): 165 cases in 14 modules. One test per Test ID. The expected result is what the site should do.

Modules 1 to 5 are already automated (`tests/login.spec.ts`, `dashboard.spec.ts`, `courses.spec.ts`, `overview.spec.ts`, `resources.spec.ts`). Work on the next module in order.

Extra tests that were added during testing are listed under "Added during testing" below the table of their module. They are not counted in the 165. Modules 1 to 4 were tested on the staging site; Module 5 onward on the development site.

## Checks to repeat in every module

These found real bugs in Modules 1 to 5:

- Rename an item to a name that already exists; delete one of two items with the same name.
- Wrong files: an unsupported type (for example .exe), a text file renamed to .pdf or .png, an empty file, a very large file; both by choosing the file and by dragging it onto the upload area.
- Double-click on Save: only one item is created.
- What a student and a Junior Faculty see: no Add, Edit or Delete tools where they should not have them.

## Module 1: Login (done)

| Test ID | Scenario                                   | Expected result                                 | Priority |
| ------- | ------------------------------------------ | ----------------------------------------------- | -------- |
| LOG-01  | Valid faculty login                        | Goes to Faculty Dashboard                       | P1       |
| LOG-02  | Valid student login                        | Goes to student home, not the faculty dashboard | P1       |
| LOG-03  | Wrong password                             | Clear error, stays on login                     | P1       |
| LOG-04  | Unknown email                              | Clear error, no hint whether the email exists   | P2       |
| LOG-05  | Empty email and/or password                | Required-field messages                         | P1       |
| LOG-06  | Invalid email format                       | Format message                                  | P2       |
| LOG-07  | Show/hide password (eye icon)              | Toggles visibility                              | P3       |
| LOG-08  | Open a protected page URL while logged out | Redirected to login                             | P1       |
| LOG-09  | Logout, then press browser Back            | Cannot see protected pages                      | P1       |
| LOG-10  | Refresh while logged in                    | Session stays                                   | P2       |
| LOG-11  | Sign Up link                               | Opens sign-up page                              | P3       |
| LOG-12  | Dark/light toggle on login page            | Theme changes, page stays readable              | P3       |

## Module 2: Dashboard and header (done)

| Test ID | Scenario                                                                                        | Expected result                                              | Priority |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| DSH-01  | Dashboard loads with four cards: My Courses, Total MCQs, Pending Help Requests, Active Contests | All visible, no errors                                       | P1       |
| DSH-02  | My Courses card is clickable                                                                    | Opens Courses                                                | P1       |
| DSH-03  | Other three cards                                                                               | Remain non-clickable (as observed)                           | P3       |
| DSH-04  | My Courses number vs Courses page                                                               | Same count (also the Owned / Managed / Shared labels add up) | P1       |
| DSH-05  | Total MCQs vs question banks                                                                    | Number matches                                               | P2       |
| DSH-06  | Create a course, return to dashboard                                                            | My Courses count goes up by 1                                | P1       |
| DSH-07  | Create an active contest, return to dashboard                                                   | Active Contests count updates                                | P2       |
| DSH-08  | Header links: Dashboard, Courses, My Banks, Review Questions, OSCE                              | Each opens the right page; current page highlighted          | P1       |
| DSH-09  | My Banks hover                                                                                  | Shows Private Bank and Departmental Bank                     | P2       |
| DSH-10  | Quick Tour button                                                                               | Tour starts and can be closed                                | P3       |
| DSH-11  | Profile menu and theme toggle                                                                   | Work and persist after refresh                               | P3       |

## Module 3: Courses list and Add Course (done)

| Test ID | Scenario                                                              | Expected result                                | Priority |
| ------- | --------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| CRS-01  | Courses page loads, cards show role badge and counts                  | Correct data                                   | P1       |
| CRS-02  | Grid / list view toggle                                               | Same courses in both views                     | P3       |
| CRS-03  | Filter by role                                                        | Only matching courses shown                    | P2       |
| CRS-04  | Search by title; search by description                                | Matching results; no results message when none | P2       |
| CRS-05  | Add Course with title only                                            | Course created                                 | P1       |
| CRS-06  | Add Course with every field filled                                    | All values saved and visible in overview       | P1       |
| CRS-07  | Title empty                                                           | Blocked with message                           | P1       |
| CRS-08  | Very long title, special characters, emoji, leading spaces            | Handled; no layout break                       | P2       |
| CRS-09  | Duplicate title                                                       | Allowed or rejected consistently               | P2       |
| CRS-10  | Select faculty: search, tick, Select All, owner always included       | Count shown matches ticks                      | P2       |
| CRS-11  | Select students: search, tick, Select All                             | Count shown matches ticks                      | P2       |
| CRS-12  | Upload course image (png, jpg)                                        | Image saved and shown on the card              | P1       |
| CRS-13  | Upload wrong type or oversized image                                  | Rejected with message                          | P2       |
| CRS-14  | Tags: type and press space or Enter; remove a tag                     | Tags added and removed                         | P3       |
| CRS-15  | Status Active / Archived at creation; Disable Student Activity toggle | Saved as chosen                                | P2       |
| CRS-16  | Close (X) without saving                                              | Nothing created                                | P2       |
| CRS-17  | Double-click Save                                                     | Only one course created                        | P2       |
| CRS-18  | After save, refresh                                                   | Course still there with correct counts         | P1       |

## Module 4: Course overview and members (done)

| Test ID | Scenario                                                                                                                    | Expected result                                               | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| OVW-01  | Overview tiles: Students, Faculty, Student Questions, Bank Questions, Total Questions, Tags, Teams, Contests, Help Requests | Numbers correct; View / edit icons work                       | P1       |
| OVW-02  | Header badges (students, questions)                                                                                         | Match overview numbers and update after changes               | P2       |
| OVW-03  | Manage Students: tabs All / Selected / Not Selected                                                                         | Lists filter correctly                                        | P1       |
| OVW-04  | Manage Students: search by name, username, email; rows per page; paging                                                     | Works                                                         | P2       |
| OVW-05  | Tick or untick students, press Update                                                                                       | Enrolment changes and count updates                           | P1       |
| OVW-06  | Export Students                                                                                                             | File downloads with correct rows                              | P2       |
| OVW-07  | Bulk Enroll: valid XLSX with the email column                                                                               | Students enrolled                                             | P1       |
| OVW-08  | Bulk Enroll: wrong columns, empty file, unknown emails, over 10 MB, wrong type (.xlsx, .xls, .csv allowed)                  | Clear errors, nothing partly saved                            | P2       |
| OVW-09  | Download Template                                                                                                           | Template opens and matches required columns                   | P3       |
| OVW-10  | Manage Faculty: list, roles (HoD, Senior, Junior), Access toggle, Update                                                    | Changes saved                                                 | P1       |
| OVW-11  | Faculty export and bulk enrol                                                                                               | Same behaviour as students                                    | P2       |
| OVW-12  | Manage Members menu in header                                                                                               | Opens the same Students / Faculty screens                     | P3       |
| OVW-13  | Edit Course Tags                                                                                                            | Saved, Tags count updates                                     | P3       |
| OVW-14  | Edit Description                                                                                                            | Saved and visible after refresh                               | P2       |
| OVW-15  | Post Hoc Analysis: valid Excel (row 1 headers, row 2 answer key, row 3+ student answers)                                    | Analysis shown                                                | P2       |
| OVW-16  | Post Hoc Analysis: wrong format, missing key row, empty file                                                                | Helpful error                                                 | P2       |
| OVW-17  | Status Active to Archived                                                                                                   | Course hidden from students (verify from the student account) | P1       |
| OVW-18  | Student Activity Enabled to Disabled                                                                                        | Student view becomes read-only (verify)                       | P1       |
| OVW-19  | Join code: copy; student enrols with it                                                                                     | Student appears in course                                     | P1       |
| OVW-20  | Watch Guide                                                                                                                 | Video opens                                                   | P3       |

Added during testing (not counted in the 20 cases):

| Test ID | Scenario                                 | Expected result                     | Why it was added           |
| ------- | ---------------------------------------- | ----------------------------------- | -------------------------- |
| OVW-10b | A Senior Faculty switches his own Access | He cannot switch off his own Access | Found while testing OVW-10 |

## Module 5: Resources (done)

| Test ID | Scenario                                                              | Expected result                        | Priority |
| ------- | --------------------------------------------------------------------- | -------------------------------------- | -------- |
| RES-01  | Empty state                                                           | "No Resources Found" message           | P3       |
| RES-02  | Add Folder with a valid name                                          | Folder appears                         | P1       |
| RES-03  | Add Folder: empty name, duplicate name, long name, special characters | Validation                             | P2       |
| RES-04  | Folder menu (⋮) options                                               | Work as labelled                       | P2       |
| RES-05  | Open folder, empty state inside                                       | Shown                                  | P3       |
| RES-06  | Add File: PDF, DOC, PPT, Excel, image, audio, video, ZIP              | Each uploads and appears with size     | P1       |
| RES-07  | Add File: no name, no file                                            | Blocked                                | P1       |
| RES-08  | Add File: unsupported or renamed wrong type, very large file          | Rejected with message                  | P2       |
| RES-09  | Tags, category, description saved                                     | Visible after refresh                  | P3       |
| RES-10  | Download file                                                         | Opens and is identical to the original | P1       |
| RES-11  | Edit and delete file (with delete confirmation)                       | Works                                  | P1       |
| RES-12  | Search by title or description; folder search                         | Correct results                        | P2       |
| RES-13  | Student opens the resource                                            | Can view and download                  | P1       |

Added during testing (extra tests, not counted in the 13 cases):

| Test ID | Scenario                                                                                      | Expected result                                             | Why it was added                        |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| RES-04b | Rename a folder to a name that already exists; delete one of two folders with the same name   | Refused, like Add Folder; only the chosen folder is deleted | Found while exploring by hand           |
| RES-06b | The other types the form allows (.7z, .aac, .avi, .mkv, .mov, .ogg, .rar, .webp); a .csv file | Accepted; .csv is not offered in the list                   | RES-06 names only eight kinds of file   |
| RES-08g | Drag an .exe file onto the upload area                                                        | Rejected                                                    | A second way to add a file              |
| RES-08h | Find the largest file the site accepts (1, 5, 10, 15 MB)                                      | Information only: the limit is known                        | RES-08 says "very large" with no number |
| RES-10b | Download one file of each of 14 types                                                         | Each is identical to the original                           | RES-10 checks only one file             |
| RES-11b | The Edit File form: file name shown, tag chips named properly                                 | File name, not a web link; tag chips have a proper name     | Seen in the Edit File form              |
| RES-12b | Search with capital letters; tag filter                                                       | Works; only tagged files shown                              | Extra search checks                     |
| RES-13b | Student inside a folder                                                                       | No Add, Edit or Delete tools                                | Roles and permissions                   |
| RES-13c | Junior Faculty inside a folder                                                                | Sees folders and files; no Add, Edit or Delete tools        | Junior Faculty account became available |
| RES-14  | File count on a folder; 10 files per page                                                     | Matches the files; changes with add and delete              | Persistence and counts                  |
| RES-15  | Double-click on Save                                                                          | One folder and one file                                     | Same check as CRS-17                    |

## Module 6: Question Bank

| Test ID | Scenario                                                                           | Expected result                                  | Priority |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| QB-01   | Empty state; Export Questions greyed out                                           | As designed                                      | P3       |
| QB-02   | Add Question with all fields: vignette, lead-in, options, correct answer           | Saved; shows in list with author and time        | P1       |
| QB-03   | Lead-in empty                                                                      | Blocked (it is required)                         | P1       |
| QB-04   | Vignette left empty                                                                | Allowed (it is optional)                         | P2       |
| QB-05   | No correct answer chosen; fewer than two options; blank options; duplicate options | Validation message                               | P1       |
| QB-06   | Add and remove options                                                             | Letters A, B, C... re-order correctly            | P2       |
| QB-07   | Upload media: up to 2 files, 20 MB each; wrong type                                | Limits enforced                                  | P2       |
| QB-08   | AI Feedback button                                                                 | Returns feedback, no crash if AI is slow or down | P2       |
| QB-09   | Edit question, then delete question (with confirmation)                            | Updated list and counts                          | P1       |
| QB-10   | Bulk Add Questions with valid Excel                                                | All rows imported                                | P1       |
| QB-11   | Bulk Add with bad rows, missing columns, empty file                                | Clear error; report of which rows failed         | P2       |
| QB-12   | Export Questions                                                                   | File matches the bank                            | P2       |
| QB-13   | Search, select all, paging                                                         | Works                                            | P2       |
| QB-14   | Counts: header badge, overview tile, dashboard Total MCQs                          | All agree                                        | P2       |

## Module 7: Student Questions

| Test ID | Scenario                                            | Expected result                    | Priority |
| ------- | --------------------------------------------------- | ---------------------------------- | -------- |
| SQ-01   | Empty state; Export greyed out                      | As designed                        | P3       |
| SQ-02   | Student submits a question; faculty opens this page | Question appears with student name | P1       |
| SQ-03   | Search and Export once data exists                  | Works                              | P2       |

## Module 8: Contests

| Test ID | Scenario                                                                                                                                                 | Expected result                               | Priority |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| CON-01  | Empty state; Status and Availability filters; search                                                                                                     | Work                                          | P2       |
| CON-02  | New Contest with valid details, one question, Save                                                                                                       | Contest card appears                          | P1       |
| CON-03  | Title empty; start or end date missing                                                                                                                   | Blocked                                       | P1       |
| CON-04  | End date before start date; start date in the past                                                                                                       | Blocked or warned                             | P1       |
| CON-05  | Status Draft / Upcoming / Active behave differently (and match the dates)                                                                                | Per the contest rules                         | P1       |
| CON-06  | Game settings: Answering Mode, Time/Question (0, negative, huge), Negative Marking (negative, decimals), Live Leaderboard, Hide Absolute Scores, Shuffle | Valid values saved; invalid rejected          | P2       |
| CON-07  | Questions tab: search, select, Save Selection, and save with zero questions                                                                              | Selected questions counted; zero case handled | P1       |
| CON-08  | Gamification: Score Multiplier and Clinical Interventions toggles                                                                                        | Saved                                         | P3       |
| CON-09  | Switching between tabs keeps typed data                                                                                                                  | Nothing lost                                  | P2       |
| CON-10  | Edit and delete contest                                                                                                                                  | Works, with confirmation                      | P1       |
| CON-11  | Student sees the contest only when allowed (course, status, dates)                                                                                       | Correct visibility                            | P1       |
| CON-12  | Student plays the contest, then faculty checks leaderboard and results                                                                                   | Scores correct                                | P1       |

## Module 9: Teams

| Test ID | Scenario                                                 | Expected result                                    | Priority |
| ------- | -------------------------------------------------------- | -------------------------------------------------- | -------- |
| TM-01   | Empty state; Export Teams greyed out                     | As designed                                        | P3       |
| TM-02   | Add Team with name, status, 2 students, description      | Appears with ID (e.g. team1), member count, status | P1       |
| TM-03   | Team name empty                                          | Blocked                                            | P1       |
| TM-04   | Team with no students                                    | Allowed (optional)                                 | P2       |
| TM-05   | Maximum 10 students: exactly 10, then try 11             | 10 accepted, 11 blocked                            | P1       |
| TM-06   | Student list only shows students enrolled in this course | Correct                                            | P1       |
| TM-07   | Same student in two teams; duplicate team name           | Rule confirmed and enforced                        | P2       |
| TM-08   | Change status from the list (inline dropdown)            | Saved                                              | P2       |
| TM-09   | Edit team, delete team (with confirmation)               | Updated list and counts                            | P1       |
| TM-10   | Import Teams with valid and invalid Excel                | Valid creates teams; invalid shows errors          | P2       |
| TM-11   | Search by team name and by member name                   | Works                                              | P2       |
| TM-12   | Overview Teams tile updates                              | Count correct                                      | P2       |

## Module 10: Leaderboard and Help Requests

| Test ID | Scenario                                      | Expected result                                                    | Priority |
| ------- | --------------------------------------------- | ------------------------------------------------------------------ | -------- |
| LB-01   | Enrolled students listed with rank, level, XP | Initial values 0 / Level 1                                         | P2       |
| LB-02   | Student earns points (contest, activity)      | XP and ranking update                                              | P1       |
| LB-03   | Ties and search by name or username           | Sensible ordering and results                                      | P3       |
| HLP-01  | Empty state                                   | Message shown                                                      | P3       |
| HLP-02  | Student raises a help request                 | Appears for faculty; dashboard Pending Help Requests count goes up | P1       |
| HLP-03  | Faculty responds or closes it                 | Student sees the response; count goes down                         | P1       |
| HLP-04  | Search question, subject or user              | Works                                                              | P3       |

## Module 11: My Banks

| Test ID | Scenario                                                                          | Expected result            | Priority |
| ------- | --------------------------------------------------------------------------------- | -------------------------- | -------- |
| PB-01   | Private Bank lists the faculty member's questions with "Published In" course tags | Correct                    | P1       |
| PB-02   | Filter by course; tag chips; Select all; search                                   | Works                      | P2       |
| PB-03   | Row actions: review, edit, delete                                                 | Work with confirmation     | P1       |
| PB-04   | Actions menu: Add Question, Bulk Add, Export (enabled here)                       | Work as in the course bank | P2       |
| PB-05   | Question added in a course appears in Private Bank                                | Yes, with the right course | P1       |
| DB-01   | Departmental Bank loads with Batch, Block, Course, Topic, Author, Approved On     | Correct                    | P1       |
| DB-02   | Filters: batch, block, course, topic; search                                      | Combine correctly          | P2       |
| DB-03   | HoD can edit and delete                                                           | Works                      | P1       |
| DB-04   | Non-HoD faculty tries to edit or delete                                           | Blocked or buttons hidden  | P1       |
| DB-05   | HoD adds a question directly                                                      | Appears in the list        | P2       |
| DB-06   | Approved review question appears here                                             | Yes                        | P1       |

## Module 12: Review Questions

| Test ID | Scenario                                                              | Expected result                                          | Priority |
| ------- | --------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| REV-01  | List shows batch, block, course, submitted by, date, question, status | Correct                                                  | P1       |
| REV-02  | Filters: batch, block, course, status                                 | Work together                                            | P2       |
| REV-03  | Approve a pending question                                            | Status Approved; moves to Departmental Bank              | P1       |
| REV-04  | Return for revision                                                   | Status Revision Requested; author notified or can see it | P1       |
| REV-05  | Reject                                                                | Status Rejected; not in the bank                         | P1       |
| REV-06  | Action buttons on already approved items                              | Disabled as shown                                        | P2       |
| REV-07  | Non-HoD user opens the page                                           | Only allowed actions shown                               | P1       |
| REV-08  | Paging and rows per page                                              | Works                                                    | P3       |

## Module 13: OSCE

| Test ID | Scenario                                                                                                                       | Expected result                                              | Priority |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------- |
| OSC-01  | Cases listed by system with age, name, presentation, level                                                                     | Correct                                                      | P2       |
| OSC-02  | Filters: System, Rotation, Presentation, Level; Reset Filters; search                                                          | Work                                                         | P2       |
| OSC-03  | Open a case: chat area, timer, score (0/32), question box, mic, Submit                                                         | Page loads; timer runs                                       | P2       |
| OSC-04  | Type a question and submit                                                                                                     | Patient replies; score changes                               | P2       |
| OSC-05  | Microphone permission denied                                                                                                   | Friendly message; typing still works                         | P3       |
| OSC-06  | Add Case, Step 1 Intro: all required fields (name, age, gender, level, system, presentation, rotation, brief intro)            | Next blocked until filled                                    | P1       |
| OSC-07  | Age: 0, negative, text, very large                                                                                             | Validation                                                   | P2       |
| OSC-08  | Step 2 Script: setting, persona, HOPC and other fields                                                                         | Required ones enforced                                       | P1       |
| OSC-09  | Step 3 Rubric: tabs HOPC, Assoc., PMHx, FMHx, Social, Basics; must add a root first; root name and score; add and delete items | Cannot move on without a root                                | P1       |
| OSC-10  | Rubric score: negative, text, empty                                                                                            | Validation                                                   | P2       |
| OSC-11  | Step 4 Follow-up: question, explanation, four options, mark correct, add or delete question                                    | Saved correctly                                              | P1       |
| OSC-12  | Back and Next keep entered data                                                                                                | Nothing lost                                                 | P2       |
| OSC-13  | Save Case                                                                                                                      | Case saved and listed (known bug: "request failed with 404") | P1       |
| OSC-14  | Close the wizard halfway                                                                                                       | Asks to confirm or discards cleanly                          | P3       |

## Module 14: Cross-cutting checks

| Test ID | Scenario                                                  | Expected result                                        | Priority |
| ------- | --------------------------------------------------------- | ------------------------------------------------------ | -------- |
| XC-01   | Student pastes a faculty page URL                         | Access denied                                          | P1       |
| XC-02   | Faculty opens another faculty's course by URL             | Allowed only if member                                 | P1       |
| XC-03   | Refresh in the middle of a form                           | No crash; behaviour defined                            | P2       |
| XC-04   | Browser Back and Forward                                  | Sensible navigation                                    | P2       |
| XC-05   | Network or server error (e.g. 404, 500)                   | Friendly message, not a raw technical error            | P2       |
| XC-06   | Dark and light theme on each page                         | Readable, nothing hidden                               | P3       |
| XC-07   | Different screen sizes (laptop, tablet, phone)            | No broken layout                                       | P3       |
| XC-08   | Keyboard: Tab order, Enter to submit, Esc to close modals | Works                                                  | P3       |
| XC-09   | Page load speed on lists with many rows                   | Acceptable                                             | P3       |
| XC-10   | Session timeout                                           | Redirects to login with no data loss message confusion | P2       |

Added during testing (not counted in the 10 cases):

| Test ID | Scenario                                                   | Expected result                                                                                                          | Why it was added                                                                                 |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| XC-11   | Junior Faculty rights in each module of the faculty portal | A Junior Faculty can see what is assigned to him but has no Add, Edit or Delete tools (checked for Resources in RES-13c) | A Junior Faculty account became available in Module 5; the role is not covered by XC-01 to XC-10 |
