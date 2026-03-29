# Frontend User Quick Start

This guide is focused on the **user journey in the app UI**.

## Before you start

Open the app and sign in. After sign-in, you will see the backlog assistant home screen.

## 1) Choose process type

Select the process template your Azure DevOps project uses:

- **Agile with Enrichment** — for projects using the "Agile with Enrichment" process
- **Finance & Operations** — for projects using the "Finance and Operations" process

## 2) Save and validate connection

In **Step 1: Enter connection details**:

1. Enter URL, project, and PAT token for Azure DevOps.
2. Click **Save details**.
3. Click **Validate connection**.

What to expect:

- If a saved profile exists, you will see **Saved connection found** with options to confirm or edit.
- Inline spinner while save/validation runs.
- A **Successfully Validated** confirmation modal when validation succeeds.

## 2b) Process template check

After validation, the app automatically checks that your project uses the process template you selected in step 1.

- If process matches: you'll see "Process verified" and can proceed.
- If process doesn't match: the app shows step-by-step instructions to change your project's process in Azure DevOps Organization Settings.
- After changing the process, return to the app and click **Validate connection** again.

## 3) Upload file

In **Step 2: Upload + analysis**:

1. Upload one `.txt` file.
2. Confirm the file appears in the file list.

What to expect:

- Inline spinner while upload runs.
- Terminal logs showing upload progress and completion.

## 4) Create backlog

1. Select **Analysis mode** (`to-be process` or `transcript`).
2. Click **Create Backlog**.

What to expect:

- Inline spinner for backlog creation.
- Terminal progress logs.
- Rotating "fact" message during longer processing.
- Success status message when complete.

## 5) Manage uploaded files

Use:

- **Refresh files** to reload list
- **Delete all uploaded files** to clear uploaded content

Both actions show inline spinners while running.

## Quick troubleshooting (user view)

- **Create Backlog does nothing**: check that a `.txt` file is uploaded and visible.
- **Validation issues**: reopen configuration and validate again.
- **Old UI behavior** after updates: hard refresh (`Ctrl+F5`).
- **Unexpected error**: check the **Execution Terminal** first; it shows the action flow and failure reason.
