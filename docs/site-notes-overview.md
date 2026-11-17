# Site notes: Module 4, Course overview and members (OVW)

What the staging site does on the course Overview page, as seen between 2026-11-03 and 2026-11-10 in `qa_course`. Test file: `tests/overview.spec.ts`. Results and bugs are in `NOTES.md`.

## Page layout

- **Header:**
  - Status menu: Active ("Visible to members") / Archived ("Hidden from members").
  - Student Activity menu: Enabled ("Students can participate") / Disabled ("Read-only for students").
  - JOIN CODE (10 letters/digits) with a copy button.
  - Watch Guide.
  - Badges "N Students" and "N Questions". They are not clickable.
  - Manage Members menu (Students / Faculty).
- **Tiles:** Students ✎, Faculty ✎, Student Questions (View), Bank Questions (View), Total Questions, Tags ✎, Teams (View), Contests (View), Help Requests (View).
- **New course:** Faculty 1 (the owner) and everything else 0.
- **Buttons:** Edit Description and Post Hoc Analysis.
- **Screen readers:** Watch Guide, the Status and Student Activity menus and Manage Members are not real buttons.
- **Escape key:** it does not close the Manage Students / Faculty pop-ups. Use the X button.
- **Archived courses:** search on the Courses page hides them. Open the Archived section to find them.

## Manage Students / Manage Faculty

- **Tabs:** All / Selected / Not Selected.
- **Search:** students by name, username or email; faculty by name or email.
- **Table:** shows "No rows" when nothing matches. Rows per page: 10, 25, 50. Paging reads like "11–20 of 24".
- **Accounts:** the institution has 24 students and 12 faculty.
- **Update:** saves the ticks and shows "Users Updated Successfully", even when nothing changed.
- **Faculty list:**
  - The owner, Dr. Asad Mansoor Khan (HoD), is ticked and cannot be unticked.
  - Role labels are HoD, Senior Faculty and Junior Faculty. They cannot be changed here.
  - The Access switch is greyed out for faculty who are not in the course. It becomes usable after the person is added. This depends on the role and is intended.
  - Switching Access off drops a Senior Faculty to Junior level in that course.
  - Known bug F16: a Senior Faculty can switch off his own Access, and then loses Manage Members.
- **Second faculty account (`TEST_FACULTY2_*`):** this is Dr. Asad, Senior Faculty (a different person from the owner). Find him by email. After being added, he sees the course in his Courses list with the Manager badge.
- **Export Students:**
  - Greyed out when no students are enrolled.
  - The file is `<course>_Students.xlsx` with columns Name, Username, Email.
- **Export Faculty:**
  - The file is `<course>_Faculty.xlsx` with columns Name, Email, Role.
  - The owner's role is written as "admin" (it means course owner, intended), while the screen shows "HoD".
- **Templates:** `BulkEnrollStudentTemplate.xlsx` and `BulkEnrollFacultyTemplate.xlsx` each have one column, `email`, with no rows.

## Bulk Enroll (students and faculty behave the same)

- **Accepted files:** .xlsx, .xls and .csv, up to 10 MB (the limit is not enforced: bug F15).
- **How it works:**
  1. After a file is chosen, the site checks it first and shows "Fetched Student (Faculty) Eligibility Data!".
  2. It shows counts: Enrollable (n), Not Applicable (n) and Invalid (n), plus "Download All" and "Enroll Students / Enroll Faculty".
  3. Nothing is saved until **Enroll Students / Faculty** is pressed. That button is greyed out when Enrollable is 0 ("No Enrollable Students Found").
  4. After pressing it: "Enrollment Successful!".
- **Partly wrong files:** the valid emails are saved and the wrong ones are reported (accepted as intended).

| File                                              | Message                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.txt`                                            | Invalid File Type.                                                                                                 |
| No `email` column                                 | Missing Required Column: Email Or Emails                                                                           |
| Headers only, or empty file                       | No Data Found In The File.                                                                                         |
| Over 10 MB                                        | Accepted (bug F15). A 12.8 MB test file gave "Ignored 330000 Invalid Email(S)." and enrolled the 5 valid students. |
| Unknown emails                                    | Invalid (n), No Enrollable Students Found                                                                          |
| Duplicates and bad emails                         | Some Duplicate Emails Were Removed. / Ignored 1 Invalid Email(S).                                                  |
| Site's own empty template (seen during discovery) | File Contains Only Headers With No Data Rows.                                                                      |

- **Sample files:** one set in `sample/peered-samples/`, built from real staging student and faculty emails. The CORRECT files enrol 5 students / 4 faculty. The "mixed" file has 2 real emails and 1 unknown email. The 12.8 MB file is not in the repository (too big, in `.gitignore`).

## Other pop-ups and messages

| Action                                       | Message                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| Edit Course Tags (type, then Enter or Space) | Course Tags Updated                                                            |
| Edit Description                             | Description Updated Successfully (an empty description is accepted too, F20)   |
| Status                                       | Course Archived Successfully / Course Activated Successfully                   |
| Student Activity                             | Student Activity Disabled Successfully / Student Activity Enabled Successfully |

- **Copy join code:** shows a "Copied" tip, and the clipboard holds the code.
- **Post Hoc Analysis** (item analysis of an exam):
  - File layout: row 1 headers (S.No., Identifier, Q.No. 1, 2, ...), row 2 the answer key, row 3 onwards one row per student.
  - The pop-up says .xlsx / .xls, but .csv is accepted too (bug F18).
  - A correct file shows "5 Questions Detected", "6 Participants", "Analysis ready. Click Download Analysis to export the Excel report." and a Download Analysis button.
  - A file with no answer-key row is accepted: the first student row becomes the key (bug F17).
  - A `.txt` file, an empty file, a file with no question columns and a file with no student rows give "No Question Data Found In The Uploaded File." (no wrong-file-type message, F22).
- **Watch Guide:** opens a "Course Workspace" video, STEP 1 OF 6, with Pause, Playback speed, Full screen and Close guide.
- **View links:** each opens its tab. The Teams tab opens a "Managing Teams" tour first. The Student Questions tab says "No questions found!" in lower case.

## Student side

- **Course list:** the student's page `/student/course-gate` has "My Enrolled Courses" and "Available to Join". Every student sees `qa_course` under Available to Join without being invited (F24).
- **Joining:** click the course, type the code, then press "Join Course".
  - The button stays greyed out for a short code.
  - A wrong code gives "Invalid enrollment code." and "Attempts used … 4 left", so there are 5 attempts per course.
  - The right code gives "Joined Course Successfully", and the course moves to My Enrolled Courses.
- **Archived:** the course disappears from the student's enrolled list completely. Active brings it back.
- **Opening a course:** clicking any enrolled course reloads the page and returns to `/student/dashboard`; the course never opens (bug F19), with Student Activity Enabled or Disabled. So the read-only behaviour could not be checked.
- **Quick Tour:** a pop-up can appear on the student pages; the saved student session (`.auth/student.json`) skips it.
