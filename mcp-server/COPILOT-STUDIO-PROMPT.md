# Copilot Studio Agent Prompt: Requirement Gathering Agent

## Agent Instructions

Paste the following into your Copilot Studio agent's **Instructions** field:

---

This agent manages Azure DevOps work items. It reads documents and creates epics, features, user stories, and tasks.

Confirm the project name with the user before creating work items.

Use process_transcript to store file content. Then call get_file_content to see the file size and total chunks. Call get_file_chunk for each chunk index starting from 0 to read the document. The server handles all chunking.

After reading all chunks, organise the content into epics, features, user stories, and tasks.

Call create_epic for each epic. Use the returned ID as epicId when calling create_feature. Use the returned feature ID as featureId when calling create_user_story. Add acceptance criteria to each user story. Use the returned user story ID as userStoryId when calling create_task.

After all work items are created, list what was created with IDs and titles.

---

## Tool Call Sequence Reference

```
1. Store the file
   --> process_transcript(fileName, fileContent)

2. Read file metadata
   --> get_file_content(fileName)
   --> returns: totalChunks, size, preview

3. Read each chunk (server does the splitting)
   --> get_file_chunk(fileName, chunkIndex=0)
   --> get_file_chunk(fileName, chunkIndex=1)
   --> ... repeat until chunkIndex = totalChunks - 1

4. Create backlog (top-down)
   --> create_epic(project, title, description)                                     --> returns epicId
   --> create_feature(project, title, description, epicId)                          --> returns featureId
   --> create_user_story(project, title, description, featureId, acceptanceCriteria) --> returns userStoryId
   --> create_task(project, title, description, userStoryId)                        --> returns taskId

5. Summary
   --> list what was created
```

## Copilot Studio Topic Setup (for file upload)

1. Create a new Topic called "Process Requirements Document"
2. Add trigger phrases:
   - "process this document"
   - "upload requirements"
   - "create backlog from file"
   - "I have a requirements document"
3. Add a **Question** node:
   - Identify: **File**
   - Question properties > Entity recognition > check **Include file metadata**
   - Save to variable: `Topic.uploadedFile`
4. Add a **Message** node: "Processing your file..."
5. The Generative AI orchestrator will then follow the agent instructions above to call the appropriate tools.

## For large files (over 20K characters)

The server chunks files automatically at 15,000 characters per chunk. The agent calls get_file_content to learn how many chunks exist, then calls get_file_chunk for each one. No client-side splitting is needed.

For very large files, you can also upload directly via the REST endpoint (bypasses MCP parameter limits):

```powershell
Invoke-WebRequest -Uri "http://mcp-cgsparc.uksouth.azurecontainer.io/upload" `
  -Method POST `
  -Headers @{ "apikey" = "<your-api-key>"; "Content-Type" = "application/json" } `
  -Body '{"fileName": "requirements.txt", "fileContent": "full-file-content-here"}'
```

Then the agent can read it with get_file_content and get_file_chunk as normal.

## Notes

- The server handles all file chunking. The agent only needs to iterate through chunk indices.
- Files are stored in server memory and persist until the container restarts.
- The agent should create work items top-down (Epics, then Features, then User Stories, then Tasks) so parent IDs are available.
