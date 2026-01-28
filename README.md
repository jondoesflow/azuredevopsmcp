# React + TypeScript + Vite

Passenger Requests proof-of-concept (React) backed by Microsoft Dataverse.

## Run locally

1. Copy environment file:

```bash
cp .env.example .env
```

2. Fill in:

- `VITE_AAD_CLIENT_ID`
- `VITE_AAD_TENANT_ID`
- `VITE_DATAVERSE_URL` (defaulted)
- `VITE_DATAVERSE_ENTITY_SET` (defaulted)

3. Start:

```bash
npm install
npm run dev
```

## Azure AD / Entra ID app registration

- **Platform**: Single-page application (SPA)
- **Redirect URI**: `http://localhost:5173` (and your deployed URL later)
- **API permissions**: add the Dataverse / Dynamics permissions required for Web API access.

## Dataverse table (create this)

Create a Dataverse table named `jdf_paxdetails` with (at minimum) these columns (schema names):

- `jdf_surname` (Text)
- `jdf_forenames` (Text)
- `jdf_documenttype` (Text or Choice)
- `jdf_documentidnumber` (Text)
- `jdf_outbounddate` (Date only)
- `jdf_returndate` (Date only)

**Important:** the app posts to the entity set configured by `VITE_DATAVERSE_ENTITY_SET`. In many Dataverse environments the **entity set name is pluralized**. If POSTs fail with 404, confirm the correct entity set name via:

`GET https://{org}.crm.dynamics.com/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName`
