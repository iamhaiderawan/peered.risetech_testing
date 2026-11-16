# Sample files for Module 5 (Resources)

All files are tiny and harmless. Every file name starts with `qa_` (or `WRONG_`), so they are easy to find and delete on the site.

## Correct files (RES-06, RES-09, RES-10, RES-11, RES-12)
| File | Type |
| --- | --- |
| qa_doc_sample.pdf | PDF |
| qa_doc_sample.docx, qa_doc_sample.doc | Word |
| qa_slides_sample.pptx, qa_slides_sample.ppt | PowerPoint |
| qa_sheet_sample.xlsx, qa_sheet_sample.xls, qa_sheet_sample.csv | Excel and CSV |
| qa_image_sample.png, qa_image_sample.jpg | Image |
| qa_audio_sample.mp3, qa_audio_sample.wav | Audio (3 seconds) |
| qa_video_sample.mp4 | Video (3 seconds) |
| qa_archive_sample.zip | ZIP |
| qa_text_sample.txt | Plain text |

## Odd names (RES-03 and RES-06)
- `qa_name with spaces & (brackets) é.pdf` : spaces, symbols and an accent in the file name.
- `qa_long_name_long_name_..._.pdf` : a very long file name.

## Wrong files (RES-07 and RES-08)
- `WRONG_text_renamed_to_pdf.pdf` and `WRONG_text_renamed_to_png.png` : plain text with a wrong extension.
- `WRONG_empty_file.pdf` : 0 bytes.
- `WRONG_unsupported_type.xyz` and `WRONG_unsupported_type.exe` : unsupported types (plain text inside, not a program).

## Very large file (RES-08)
Not in the folder (too big). First read the limit on the Add File form, then make a file a little over it on your computer, for example for a 120 MB file:
`head -c 120M /dev/zero > WRONG_too_big.pdf`
Delete it afterwards. It is not added to Git (the sample folder ignores it).

## Checking a download (RES-10)
After you download a file from the site, compare it with the original:
`sha256sum qa_doc_sample.pdf ~/Downloads/qa_doc_sample.pdf`
Both lines must show the same long number.
