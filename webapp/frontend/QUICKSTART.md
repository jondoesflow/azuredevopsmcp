# Frontend User Quick Start

This guide is focused on the **user journey in the app UI**.

## Before you start

Open the app and sign in. After sign-in, you will see the backlog assistant home screen.

## 1) Choose your platform

In **Step 2: Choose platform**, click one:

- **Azure DevOps**
- **Jira**

What to expect:

- If a saved profile exists, you will see **Saved connection found** with options to confirm or edit.
- If not, continue to Step 3 and enter details.

## 2) Save and validate connection

In **Step 3: Enter connection details**:

1. Enter URL, project, and token for your selected platform.
2. Click **Save details**.
3. Click **Validate connection**.

What to expect:

- Inline spinner while save/validation runs.
- A **Successfully Validated** confirmation modal when validation succeeds.

## 3) Upload file

In **Step 5: Upload + analysis**:

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
- Rotating “fact” message during longer processing.
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
