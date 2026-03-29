# Frontend User Quick Start

This guide is focused on the **user journey in the app UI**.

## Before you start

Open the app and sign in. After sign-in, you will see the backlog assistant home screen.

## 1) Save and validate connection

In **Step 1: Enter connection details**:

1. Enter URL, project, and PAT token for Azure DevOps.
2. Click **Save details**.
3. Click **Validate connection**.

What to expect:

- If a saved profile exists, you will see **Saved connection found** with options to confirm or edit.
- Inline spinner while save/validation runs.
- A **Successfully Validated** confirmation modal when validation succeeds.

## 1b) Enrichment field check

After validation, the app automatically checks if your project's process template has the 22 enrichment custom fields.

- If fields are present: you'll see "Enrichment fields verified" and can proceed.
- If fields are missing: the app shows step-by-step instructions to change your project's process in Azure DevOps:
  1. Go to **Organization Settings** > **Process**
  2. Find your current process and open it
  3. Select the **Projects** tab
  4. Click the **...** menu next to your project and select **Change process**
  5. Choose a process that includes enrichment fields (e.g. "Agile with MoSCoW", "Power Platform Agile")
- After changing the process, return to the app and click **Validate connection** again.

## 2) Upload file

In **Step 2: Upload + analysis**:

1. Upload one `.txt` file.
2. Confirm the file appears in the file list.

What to expect:

- Inline spinner while upload runs.
- Terminal logs showing upload progress and completion.

## 3) Create backlog

1. Select **Analysis mode** (`to-be process` or `transcript`).
2. Click **Create Backlog**.

What to expect:

- Inline spinner for backlog creation.
- Terminal progress logs.
- Rotating "fact" message during longer processing.
- Success status message when complete.

## 4) Manage uploaded files

Use:

- **Refresh files** to reload list
- **Delete all uploaded files** to clear uploaded content

Both actions show inline spinners while running.

## Quick troubleshooting (user view)

- **Create Backlog does nothing**: check that a `.txt` file is uploaded and visible.
- **Validation issues**: reopen configuration and validate again.
- **Old UI behavior** after updates: hard refresh (`Ctrl+F5`).
- **Unexpected error**: check the **Execution Terminal** first; it shows the action flow and failure reason.
