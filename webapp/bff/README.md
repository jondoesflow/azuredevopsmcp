# BFF (Backend-for-Frontend)

Express + TypeScript API that secures and proxies requests from the SPA to the MCP server.

## Endpoints

- `GET /api/health`
- `GET /api/files`
- `POST /api/files/upload`
- `POST /api/chat/message`

## Auth model

- `AUTH_MODE=enforced`: validates Entra bearer tokens via JWKS.
- `AUTH_MODE=off`: disables auth for local development only.

Optional group restriction is supported with `ENTRA_ALLOWED_GROUP_IDS`.

## Chat command behavior

The `/api/chat/message` endpoint interprets user text into these actions:

- list files
- analyse document
- create backlog
- delete file

For `create backlog`, the BFF runs:
1. `analyse_document`
2. `create_backlog`

## Run locally

```powershell
npm install
npm run build
npm start
```

Default URL: `http://localhost:8080`
