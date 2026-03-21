# Frontend SPA

React + Vite internal chat UI for the backlog assistant.

## Quick start

Use the full setup guide here: [QUICKSTART.md](./QUICKSTART.md)

## Features

- Entra ID sign-in (MSAL)
- File upload to BFF
- File list panel
- Chat actions for:
  - list files
  - analyse document
  - create backlog
  - delete file

## Run locally

```powershell
npm install
npm run dev
```

Default URL: `http://localhost:5173`

## Required env

See `.env.example` for:
- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`
- `VITE_BFF_SCOPE`
- `VITE_BFF_BASE_URL`
