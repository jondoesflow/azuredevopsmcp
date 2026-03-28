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
- If fields are missing: a migration form appears. Enter:
  - **Source Org URL**: Azure DevOps org that has the Enrichment process
  - **Source Project**: Project using the Enrichment process
  - **Source Process Name**: Name of the process (e.g. "Enrichment")
  - **Source PAT**: PAT token for the source org
- Click **Migrate Process** to copy the process template to your target org.

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
