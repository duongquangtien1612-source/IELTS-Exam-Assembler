# zBon — IELTS Exam Assembler

zBon is a browser-based IELTS practice website. Turn uploaded papers into interactive Reading, Listening and Writing tests, review your answers, and track your practice.

## Install and run locally

### Requirements

- A modern browser such as Chrome or Edge.
- Python 3 to serve the website locally. Download Python from https://www.python.org/downloads/ if needed.

### Instructions

1. On the repository page, select **Code → Download ZIP**.
2. Extract the ZIP into a folder on your computer.
3. Open the extracted folder and locate **index.html**. If the repository includes a **dist** folder, open that folder.
4. Open a terminal in the folder containing **index.html**. On Windows, click the File Explorer address bar, type **powershell**, and press Enter.
5. Run the following command.

~~~powershell
python -m http.server 8771 --bind 127.0.0.1
~~~

If Windows cannot find Python, try the following command.

~~~powershell
py -m http.server 8771 --bind 127.0.0.1
~~~

6. Open http://127.0.0.1:8771/ in your browser.
7. Keep the terminal open while using zBon. Press **Ctrl+C** in the terminal to stop the server.

If **Start website.cmd** is included beside the **dist** folder, you can double-click it to start the local server instead.

Serve the website through localhost so document recognition and browser storage work correctly. Keep all supplied files and the **vendor** folder together.

## Create a test

1. Select **Reading**, **Listening** or **Writing**.
2. Give the test a name.
3. Choose **Free practice**, **IELTS preset** or **Custom time**.
4. Add the files or prompt text described below.
5. Click **Start exam**. Choose **Review test** to check the imported content or **Start immediately** to begin.

### Reading

- Upload an exam paper as **PDF, DOCX or HTML**.
- Upload its matching answer key as **PDF, DOCX, HTML or TXT**.
- Scanned PDFs are recognized on your device.
- Use Preview to correct question text, choices and answer keys before starting.

### Listening

- Upload an exam paper and matching answer key using the same formats as Reading.
- Add one full recording or four separate recordings in section order.
- With four recordings, Part 1 covers questions 1–10, Part 2 covers 11–20, Part 3 covers 21–30 and Part 4 covers 31–40.
- Supported audio formats include MP3, M4A, WAV, OGG, AAC, FLAC and WEBM, subject to browser support.

### Writing

- Add a separate prompt for **Task 1** and **Task 2**.
- Each task supports a **PDF, JPG/JPEG, PNG, pasted screenshot or pasted prompt text**.
- To paste a screenshot, click **Paste screenshot · Ctrl+V**, then press **Ctrl+V**.
- Pasted prompt text is sufficient without a file. If both text and a file are present, the text is used.
- The task appears on the left and your response area appears on the right.
- Word counts update while you type.
- After submission, use **Export Writing responses** or copy the AI grading prompt. Attach the original task prompts and visuals when asking an AI assistant for feedback.

### Prepare an answer key

Use one numbered answer per line.

~~~text
1. litter
2. dogs
3. 35 | thirty five
~~~

Use **|** for accepted alternatives. For answers accepted in either order, use a paired entry.

~~~text
15&16. A | D
~~~

The File format guide includes a prompt you can give an AI assistant to prepare your files.

### Build manually

For Reading or Listening, select **Build manually** under **Create from**. Add the passage or notes, configure the questions and answers, and attach Listening recordings as needed.

## During the exam

- Switch between passages, parts or Writing tasks.
- Use the question navigation to jump to an answer.
- Flag uncertain questions and revisit them from **Flagged questions**.
- Adjust passage text size, line spacing and warm paper.
- Highlight text and adjust the width of the passage panel on desktop.
- Zoom uploaded Writing images with **+**, **−** and **Reset**.
- Review the answered and flagged counts before submitting.

## Grading and results

- Reading and Listening tests with exactly **40 questions** receive automatic grading against the uploaded answer key.
- Other question counts are saved as ungraded practice.
- Writing responses are saved for review. The results include an AI feedback prompt for an estimated assessment.
- Band estimates depend on the uploaded key and the recognized content. Check imports carefully before relying on a result.

## Library, History and statistics

- **Library** stores reusable tests, organized by Writing, Listening and Reading. Search, start, resume, edit, rename or delete a test.
- **History** stores the last 30 submitted attempts, including responses, results and detailed question review.
- **Test stats** summarizes eligible practice attempts and progress.
- **Retry whole test** starts a fresh attempt from a saved result.

## Saved work and backups

Practice data is stored in the browser on the device you use. Use the same browser profile and website address to return to it.

- Writing and exam responses are saved during practice.
- Use **Resume saved attempt** or the Library to continue.
- Use **Library → Backup → Export tests and results** to download a backup.
- Use **Restore backup** to import a saved backup.
- Clearing browser site data can remove saved tests, scans, essays and attempts. Keep backups of important work.
- A hosted website and a localhost copy have separate browser storage.

## Troubleshooting

### The website will not open

Start the local server again and keep its terminal open. Confirm that you are visiting http://127.0.0.1:8771/.

### Scanning takes a long time

Recognition runs on your device. Long scanned papers take longer than selectable-text PDFs or text-based DOCX files. Previously scanned files can be reused from local storage.

### Imported questions look incorrect

Choose **Review test**, compare with the original, and correct the text or choices. A clearer scan can improve recognition. Re-import the original file to rebuild an older saved test with updated import behavior.

### Audio does not play

Check the recording in your browser and try a supported format such as MP3 or WAV.

## Third-party software

Document parsing and OCR dependencies are supplied in **vendor** with their license files.
