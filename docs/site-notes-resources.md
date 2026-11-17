# Site notes: Module 5, Resources (RES)

What the PeerEd development site does on the Resources tab of a course, as seen between 2026-11-12 and 2026-11-16 in `qa_course`. Test file: `tests/resources.spec.ts`. Results and bugs are in `NOTES.md`.

## Page layout

- **Faculty:** the Resources tab of a course (`/faculty/courses/<course id>?tab=resources`) shows the folders, with an Add Folder button and a search box. Each folder has a three-dot menu (`Folder options for <name>`) and a file-count chip. A folder with 0 files shows no chip.
- **Empty states:** a course with no folders shows "No Resources Found!". A folder with no files shows "No Resource Found!" (singular).
- **Inside a folder:** an Add File button, a search box, tag filters and the file list. 10 files per page. Each row shows the name, a type chip (PDF, DOCX ...), the words "Unknown" and a dash "—" in two places (what they should show is not clear, F36) and the size.
- **Student:** the folders are on the student dashboard (`/student/dashboard`), there is no Resources tab. Opening a folder shows the files with a text button "Download". A student has no Add, Edit or Delete. The faculty page address sends a student back to the dashboard.
- **Junior Faculty:** sees the same folders and files as a faculty member but has no Add Folder, folder menu, Add File, Edit or Delete.
- **Pop-ups:** they have no Cancel button; the first button, without a name, is the X. The Watch Guide video ("Close guide") and the Quick Tour ("Skip") can cover the page and must be closed first.

## Folders

- **Add Folder:** "Folder Added Successfully". An empty name or only spaces gives "Folder Name is required". A name that exists gives "Folder With This Name Already Exists". The name box stops at 30 characters (`maxlength` 30) without a message (F33). Leading spaces are removed, special characters are shown as typed.
- **Folder menu:** "Rename Folder" opens a pop-up titled "Edit Folder" (button Update): "Folder Renamed Successfully". Rename accepts a name that already exists (F26). "Delete Folder" asks "This action cannot be undone." and gives "Folder And All Its Files Deleted Successfully"; with two folders of the same name both are deleted (F27).

## Files

- **Add File form:** Name, file (upload area or drag and drop), Category, Tags (a tag box with suggestions), Description. The `accept` list is .pdf, .doc, .docx, .ppt, .pptx, .xls, .xlsx, .jpg, .jpeg, .png, .webp, .mp4, .mov, .avi, .mkv, .mp3, .wav, .aac, .ogg, .zip, .rar, .7z, .txt. There is no .csv (F34), but the site does not check the type: an .exe, a .xyz, a text file renamed to .pdf and an empty file are accepted (F28, F29).
- **Messages:** "File Added Successfully", "Resource Name is required", "File Updated Successfully", "File Deleted Successfully" (Delete asks "This action cannot be undone." first). Save with a name but no file shows nothing (F37).
- **Size:** 1, 5, 10 and 15 MB are accepted. 20 MB and 120 MB gave "File Save Failed" after about 15 seconds, with no reason and no limit on the screen (F32).
- **Edit File form:** the upload area shows a long storage link instead of the file name (F31). The tag chips have the accessible name "Remove [object Object]" (F30).
- **Search:** by title and by description, not case sensitive; no match shows "No Resource Found!". The folder search shows "No Resources Found!" when nothing matches. Tags filter the files; after a tag is picked, "Select all" changes to "Clear all".
- **Download:** the faculty button is an icon with the label "Download", the student's is a text button. Both end with "Failed To Download File" and a 500 error from `/api/v1/resources/download/...` (F25).
- **Description:** saved, but shown only in the Edit form, not in the list or to the student (F35).
