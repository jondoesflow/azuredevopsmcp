# Frontend SPA

React + Vite internal web application for the Azure DevOps Backlog Assistant.

## Quick start

Use the full setup guide here: [QUICKSTART.md](./QUICKSTART.md)

## Features

- **Entra ID sign-in** (MSAL) with organisational accounts
- **Process type selection** — Agile with Enrichment or Finance & Operations
- **Connection validation** with process template verification
- **File upload** — single or multiple files with role tagging (Process Doc, Transcript, Evidence)
- **Document analysis** — To-Be process mode or Transcript themes mode
- **Backlog creation** — hierarchical Epic > Feature > Story > Task generation with deduplication
- **Health Dashboard** — RAG donut, confidence histogram, effort breakdown, coverage gaps, dependency graph, missing pieces heatmap (powered by Recharts)
- **Export & Reporting** — CSV export with enrichment fields, stakeholder summary
- **Story Refinement** — AI-powered suggestions for low-confidence stories with before/after diff and one-click apply
- **RRAID Log** — Extract and track Risks, Requirements, Assumptions, Issues, Dependencies from documents and create as ADO Issue work items
- **Review Dashboard** — low-confidence story highlighting with quality insights
- **Enrichment fields reference** — 22 custom ADO field catalog
- **User guide** — comprehensive in-app help

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
