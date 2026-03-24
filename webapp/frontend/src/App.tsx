import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import {
  clearHistory,
  createPersonas,
  deleteAllFiles,
  getFiles,
  getHistory,
  getRandomFact,
  getSetupConfig,
  processDocument,
  saveSetupConfig,
  uploadFile,
  validateSetupConfig,
} from "./api";
import { BacklogReviewResult, DocumentType, HistoryEntry, SetupConfigPayload, SetupConfigState, UploadedFile } from "./types";

const bffScope = import.meta.env.VITE_BFF_SCOPE as string;
type LoadingAction =
  | "sign-in"
  | "sign-out"
  | "save-connection"
  | "validate-connection"
  | "upload"
  | "refresh"
  | "delete-all"
  | "create-backlog"
  | "create-personas";

interface EnrichmentFieldDoc {
  displayName: string;
  referenceName: string;
  type: string;
  description: string;
}

const ENRICHMENT_FIELD_DOCS: EnrichmentFieldDoc[] = [
  {
    displayName: "Enrichment Confidence Overall",
    referenceName: "Custom.EnrichmentConfidenceOverall",
    type: "integer",
    description: "Overall confidence score (0-100) for generated story quality and completeness.",
  },
  {
    displayName: "Enrichment Confidence Title",
    referenceName: "Custom.EnrichmentConfidenceTitle",
    type: "string",
    description: "Confidence sub-score for story title quality.",
  },
  {
    displayName: "Enrichment Confidence Description",
    referenceName: "Custom.EnrichmentConfidenceDescription",
    type: "html",
    description: "Confidence sub-score for story description quality.",
  },
  {
    displayName: "Enrichment Confidence Acceptance Criteria",
    referenceName: "Custom.EnrichmentConfidenceAcceptanceCriteria",
    type: "integer",
    description: "Confidence sub-score for acceptance criteria quality and completeness.",
  },
  {
    displayName: "Enrichment Confidence Rationale",
    referenceName: "Custom.EnrichmentConfidenceRationale",
    type: "html",
    description: "Bullet-list explanation behind confidence scoring.",
  },
  {
    displayName: "Enrichment Definition of Done",
    referenceName: "Custom.EnrichmentDefinitionofDone",
    type: "string",
    description: "Definition of Done checklist for the story.",
  },
  {
    displayName: "Enrichment Dependencies Depends On",
    referenceName: "Custom.EnrichmentDependenciesDependsOn",
    type: "html",
    description: "Stories that must be completed before this story.",
  },
  {
    displayName: "Enrichment Dependencies Blocks",
    referenceName: "Custom.EnrichmentDependenciesBlocks",
    type: "html",
    description: "Stories potentially blocked by this story.",
  },
  {
    displayName: "Enrichment Dependencies Confidence",
    referenceName: "Custom.EnrichmentDependenciesConfidence",
    type: "integer",
    description: "Confidence score (0-100) for inferred dependency links.",
  },
  {
    displayName: "Enrichment Dependencies Rationale",
    referenceName: "Custom.EnrichmentDependenciesRationale",
    type: "html",
    description: "Explanation of why dependency relationships were inferred.",
  },
  {
    displayName: "Enrichment Missing Pieces Issues",
    referenceName: "Custom.EnrichmentMissingPiecesIssues",
    type: "html",
    description: "Detected requirement gaps or unanswered questions.",
  },
  {
    displayName: "Enrichment Consistency Issues",
    referenceName: "Custom.EnrichmentConsistencyIssues",
    type: "html",
    description: "Cross-story consistency issues including severity and conflicts.",
  },
  {
    displayName: "Enrichment Effort T Shirt Size",
    referenceName: "Custom.EnrichmentEffortTShirtSize",
    type: "string",
    description: "Estimated effort bucket (XS, S, M, L, XL).",
  },
  {
    displayName: "Enrichment Effort Confidence",
    referenceName: "Custom.EnrichmentEffortConfidence",
    type: "integer",
    description: "Confidence score (0-100) for effort estimate.",
  },
  {
    displayName: "Enrichment Effort Reasoning",
    referenceName: "Custom.EnrichmentEffortReasoning",
    type: "html",
    description: "Reasoning that justifies the effort estimate.",
  },
  {
    displayName: "Enrichment Quality Score",
    referenceName: "Custom.EnrichmentQualityScore",
    type: "integer",
    description: "Overall story quality score (0-100).",
  },
  {
    displayName: "Enrichment Quality Clarity",
    referenceName: "Custom.EnrichmentQualityClarity",
    type: "integer",
    description: "Quality sub-score for clarity.",
  },
  {
    displayName: "Enrichment Quality Completeness",
    referenceName: "Custom.EnrichmentQualityCompleteness",
    type: "integer",
    description: "Quality sub-score for completeness.",
  },
  {
    displayName: "Enrichment Quality Testability",
    referenceName: "Custom.EnrichmentQualityTestability",
    type: "integer",
    description: "Quality sub-score for testability.",
  },
  {
    displayName: "Enrichment Quality Consistency",
    referenceName: "Custom.EnrichmentQualityConsistency",
    type: "integer",
    description: "Quality sub-score for consistency with related stories.",
  },
  {
    displayName: "Enrichment Quality Issues",
    referenceName: "Custom.EnrichmentQualityIssues",
    type: "html",
    description: "Quality risks or issues detected during enrichment.",
  },
  {
    displayName: "Enrichment Quality Recommendations",
    referenceName: "Custom.EnrichmentQualityRecommendations",
    type: "html",
    description: "Recommendations for improving story quality.",
  },
];

export function App() {
  const { instance, accounts } = useMsal();

  const [setupState, setSetupState] = useState<SetupConfigState | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<"azure-devops" | "jira" | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showValidationSuccess, setShowValidationSuccess] = useState(false);
  const [validatingConnection, setValidatingConnection] = useState(false);
  const [connectionChoiceAcknowledged, setConnectionChoiceAcknowledged] = useState(false);

  const [azureDevOpsUrl, setAzureDevOpsUrl] = useState("");
  const [azureDevOpsProject, setAzureDevOpsProject] = useState("");
  const [azureDevOpsPat, setAzureDevOpsPat] = useState("");

  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraProject, setJiraProject] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");

  const [sourceAdoOrgUrl, setSourceAdoOrgUrl] = useState("");
  const [sourceAdoProject, setSourceAdoProject] = useState("");
  const [sourceAdoProcessName, setSourceAdoProcessName] = useState("CustomAgile");
  const [sourceAdoPat, setSourceAdoPat] = useState("");
  const [showSourceAdoFields, setShowSourceAdoFields] = useState(false);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pendingDocType, setPendingDocType] = useState<DocumentType>("to-be-process");
  const [busy, setBusy] = useState(false);
  const [actionLoading, setActionLoading] = useState<LoadingAction | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [activeFact, setActiveFact] = useState<string | null>(null);
  const [boardUrl, setBoardUrl] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<Record<string, number> | null>(null);
  const [review, setReview] = useState<BacklogReviewResult | null>(null);
  const [showEnrichmentFieldsPage, setShowEnrichmentFieldsPage] = useState(false);
  const [showHistoryPage, setShowHistoryPage] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "$ Ready. Sign in to begin.",
  ]);
  const spinnerRef = useRef<number | null>(null);
  const factsRef = useRef<number | null>(null);

  const account = accounts[0];
  const isAuthenticated = Boolean(account);
  const activePlatform = useMemo(() => {
    if (selectedPlatform) return selectedPlatform;
    if (setupState?.platform) return setupState.platform;

    const jiraHint = Boolean((setupState?.jiraProject ?? jiraProject).trim() || (setupState?.jiraBaseUrl ?? jiraBaseUrl).trim());
    const adoHint = Boolean((setupState?.azureDevOpsProject ?? azureDevOpsProject).trim() || (setupState?.azureDevOpsUrl ?? azureDevOpsUrl).trim());

    if (jiraHint && !adoHint) return "jira";
    if (adoHint && !jiraHint) return "azure-devops";
    return null;
  }, [
    azureDevOpsProject,
    azureDevOpsUrl,
    jiraBaseUrl,
    jiraProject,
    selectedPlatform,
    setupState?.azureDevOpsProject,
    setupState?.azureDevOpsUrl,
    setupState?.jiraBaseUrl,
    setupState?.jiraProject,
    setupState?.platform,
  ]);
  const configuredProject = useMemo(
    () => {
      if (activePlatform === "jira") {
        return (jiraProject || setupState?.jiraProject || "").trim();
      }
      return (azureDevOpsProject || setupState?.azureDevOpsProject || "").trim();
    },
    [activePlatform, azureDevOpsProject, jiraProject, setupState?.azureDevOpsProject, setupState?.jiraProject]
  );
  const spinnerGlyph = ["|", "/", "-", "\\"][spinnerFrame % 4];
  const lowConfidenceWorkItems = useMemo(() => {
    const items = review?.items ?? [];
    return items
      .filter((item) => (item.enrichment?.confidence?.overall ?? 100) < 60)
      .sort((left, right) => (left.enrichment?.confidence?.overall ?? 100) - (right.enrichment?.confidence?.overall ?? 100));
  }, [review]);

  const connectionReady = Boolean(setupState?.isValidated);

  function logLine(message: string): void {
    setTerminalLines((existing) => [...existing, `$ ${message}`]);
  }

  function renderLowConfidenceDashboard(): JSX.Element | null {
    if (!review) return null;

    return (
      <section className="review-dashboard" aria-live="polite">
        <h3>Review-first dashboard</h3>
        <p>
          {lowConfidenceWorkItems.length === 0
            ? "No work items are currently below the 60 confidence threshold."
            : `Top ${Math.min(lowConfidenceWorkItems.length, 8)} work items below confidence 60 (lowest first).`}
        </p>

        {lowConfidenceWorkItems.length > 0 ? (
          <ul className="review-dashboard-list">
            {lowConfidenceWorkItems.slice(0, 8).map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.enrichment?.missingPieces?.issues?.[0] ?? "Needs refinement before implementation."}</p>
                </div>
                <span className="confidence-pill">{item.enrichment?.confidence?.overall ?? 0}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  function renderEnrichmentFieldsPage(): JSX.Element {
    return (
      <main className="fields-layout">
        <section className="panel fields-panel">
          <h2>Enrichment Field Reference</h2>
          <p className="fields-warning">
            These fields are <strong>Azure DevOps only</strong>. They are populated into ADO custom User Story fields during backlog creation/update.
          </p>
          <p className="fields-note">
            For <strong>Jira</strong>, these values are not mapped to custom fields. Instead, enrichment details are appended at the end of the User Story description.
          </p>

          <div className="fields-table-wrap" role="region" aria-label="ADO enrichment field catalog">
            <table className="fields-table">
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>ADO Custom Field</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {ENRICHMENT_FIELD_DOCS.map((field) => (
                  <tr key={field.referenceName}>
                    <td>{field.displayName}</td>
                    <td><code>{field.referenceName}</code></td>
                    <td>{field.type}</td>
                    <td>{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }

  function renderInlineSpinner(action: LoadingAction, text: string): JSX.Element | null {
    if (actionLoading !== action) return null;
    return (
      <span className="inline-spinner" role="status" aria-live="polite">
        <span className="spinner-dot" aria-hidden="true" />
        {text}
      </span>
    );
  }

  function hydrateSetup(state: SetupConfigState): void {
    setSetupState(state);
    setSelectedPlatform(state.platform ?? null);
    setAzureDevOpsUrl(state.azureDevOpsUrl ?? "");
    setAzureDevOpsProject(state.azureDevOpsProject ?? "");
    setJiraBaseUrl(state.jiraBaseUrl ?? "");
    setJiraProject(state.jiraProject ?? "");
    setSourceAdoOrgUrl(state.sourceAdoOrgUrl ?? "");
    setSourceAdoProject(state.sourceAdoProject ?? "");
    setSourceAdoProcessName(state.sourceAdoProcessName ?? "CustomAgile");
    if (state.sourceAdoOrgUrl) setShowSourceAdoFields(true);
    setConnectionChoiceAcknowledged(false);
  }

  async function getAccessToken(): Promise<string> {
    if (!account) {
      throw new Error("Sign in is required.");
    }

    const request = {
      account,
      scopes: [bffScope],
    };

    try {
      const result = await instance.acquireTokenSilent(request);
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const result = await instance.acquireTokenPopup(request);
        return result.accessToken;
      }
      throw error;
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setSetupState(null);
      setSelectedPlatform(null);
      setFiles([]);
      setBoardUrl(null);
      setResultSummary(null);
      setReview(null);
      return;
    }

    void (async () => {
      try {
        const token = await getAccessToken();
        const state = await getSetupConfig(token);
        hydrateSetup(state);
        if (state.isValidated) {
          await refreshFiles(token);
          logLine("Connection profile loaded.");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load configuration");
      }
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (spinnerRef.current) {
        window.clearInterval(spinnerRef.current);
      }
      if (factsRef.current) {
        window.clearInterval(factsRef.current);
      }
    };
  }, []);

  async function signIn(): Promise<void> {
    setError(null);
    setActionLoading("sign-in");
    logLine("Authenticating with Entra ID...");
    try {
      await instance.loginPopup({ scopes: [bffScope] });
      logLine("Authentication succeeded.");
    } catch (error) {
      logLine("Authentication failed.");
      setError(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setActionLoading((current) => (current === "sign-in" ? null : current));
    }
  }

  async function signOut(): Promise<void> {
    if (!account) return;
    setActionLoading("sign-out");
    logLine("Signing out...");
    try {
      await instance.logoutPopup({ account });
    } finally {
      setActionLoading((current) => (current === "sign-out" ? null : current));
    }
  }

  async function refreshFiles(tokenParam?: string, showInlineSpinner = true): Promise<void> {
    setError(null);
    setStatus(null);
    if (showInlineSpinner) {
      setActionLoading("refresh");
    }
    setBusy(true);
    logLine("Fetching uploaded files from MCP server...");
    try {
      const token = tokenParam ?? (await getAccessToken());
      const result = await getFiles(token);
      setFiles(result.files);
      logLine(`Fetched ${result.count} uploaded file(s).`);
    } catch (error) {
      logLine("Failed to fetch uploaded files.");
      setError(error instanceof Error ? error.message : "Failed to load files");
    } finally {
      setBusy(false);
      if (showInlineSpinner) {
        setActionLoading((current) => (current === "refresh" ? null : current));
      }
    }
  }

  async function onUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const ALLOWED_EXTENSIONS = new Set(["txt", "docx", "pdf", "png", "jpg", "jpeg", "svg", "vsdx"]);

    setError(null);
    setActionLoading("upload");
    setBusy(true);

    try {
      const token = await getAccessToken();

      for (const file of Array.from(selectedFiles)) {
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          logLine(`Skipped '${file.name}' (unsupported file type).`);
          continue;
        }

        // Image/diagram files default to "reference"
        const isImage = ["png", "jpg", "jpeg", "svg", "vsdx"].includes(ext);
        const docType: DocumentType = isImage ? "reference" : pendingDocType;

        logLine(`Uploading '${file.name}' as ${docType}...`);
        await uploadFile(token, file, docType);
        logLine(`Upload completed for '${file.name}'.`);
      }

      await refreshFiles(token, false);
      setStatus(`Uploaded ${selectedFiles.length} file(s).`);
    } catch (error) {
      logLine("Upload failed.");
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      setActionLoading((current) => (current === "upload" ? null : current));
      event.target.value = "";
    }
  }

  async function deleteAllUploadedFiles(): Promise<void> {
    setError(null);
    setStatus(null);
    setActionLoading("delete-all");
    setBusy(true);
    logLine("Deleting all uploaded files from MCP server...");
    try {
      const token = await getAccessToken();
      const result = await deleteAllFiles(token);
      await refreshFiles(token, false);
      setStatus(`Deleted ${result.deleted} file(s).`);
      logLine(`Deleted ${result.deleted} file(s).`);
    } catch (error) {
      logLine("Delete-all request failed.");
      setError(error instanceof Error ? error.message : "Delete all failed");
    } finally {
      setBusy(false);
      setActionLoading((current) => (current === "delete-all" ? null : current));
    }
  }

  function currentSetupPayload(includeSecrets: boolean): SetupConfigPayload {
    return {
      platform: selectedPlatform ?? undefined,
      azureDevOpsUrl: azureDevOpsUrl.trim() || undefined,
      azureDevOpsProject: azureDevOpsProject.trim() || undefined,
      azureDevOpsPat: includeSecrets ? azureDevOpsPat.trim() || undefined : undefined,
      jiraBaseUrl: jiraBaseUrl.trim() || undefined,
      jiraProject: jiraProject.trim() || undefined,
      jiraApiToken: includeSecrets ? jiraApiToken.trim() || undefined : undefined,
      sourceAdoOrgUrl: sourceAdoOrgUrl.trim() || undefined,
      sourceAdoProject: sourceAdoProject.trim() || undefined,
      sourceAdoProcessName: sourceAdoProcessName.trim() || undefined,
      sourceAdoPat: includeSecrets ? sourceAdoPat.trim() || undefined : undefined,
    };
  }

  function hasSavedConnectionFor(platform: "azure-devops" | "jira"): boolean {
    if (!setupState) return false;
    if (platform === "azure-devops") {
      return Boolean(setupState.azureDevOpsUrl && setupState.azureDevOpsProject && setupState.hasAzureDevOpsPat);
    }
    return Boolean(setupState.jiraBaseUrl && setupState.jiraProject && setupState.hasJiraApiToken);
  }

  async function choosePlatform(platform: "azure-devops" | "jira"): Promise<void> {
    setSelectedPlatform(platform);
    setError(null);
    setStatus(null);
    if (hasSavedConnectionFor(platform)) {
      setConnectionChoiceAcknowledged(false);
      logLine(`Existing ${platform === "jira" ? "Jira" : "Azure DevOps"} profile found. Confirm or edit details.`);
      return;
    }
    setConnectionChoiceAcknowledged(true);
  }

  async function saveConnectionDetails(): Promise<void> {
    setError(null);
    setActionLoading("save-connection");
    try {
      const token = await getAccessToken();
      const next = await saveSetupConfig(token, currentSetupPayload(true));
      hydrateSetup(next);
      setStatus("Configuration saved.");
      logLine("Configuration saved against your profile.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save configuration");
    } finally {
      setActionLoading((current) => (current === "save-connection" ? null : current));
    }
  }

  async function validateConnection(useExistingSecrets: boolean): Promise<void> {
    setError(null);
    setStatus(null);
    setActionLoading("validate-connection");
    setValidatingConnection(true);
    logLine("Validating connection...");

    try {
      const token = await getAccessToken();
      const response = await validateSetupConfig(token, currentSetupPayload(!useExistingSecrets));
      hydrateSetup(response.state);
      setShowValidationSuccess(true);
      if (response.enrichmentProcess) {
        const ep = response.enrichmentProcess;
        logLine(`Enrichment: ${ep.message ?? ep.status}`);
      }
      setStatus("Successfully validated.");
      logLine("Connection validated successfully.");
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "Validation failed";
      setError(message);
      logLine(`Validation failed: ${message}`);
      setConnectionChoiceAcknowledged(true);
    } finally {
      setValidatingConnection(false);
      setActionLoading((current) => (current === "validate-connection" ? null : current));
    }
  }

  async function startProgressVisuals(token: string): Promise<void> {
    setActiveFact(null);
    setSpinnerFrame(0);

    spinnerRef.current = window.setInterval(() => {
      setSpinnerFrame((index) => index + 1);
    }, 250);

    const updateFact = async (): Promise<void> => {
      try {
        const fact = await getRandomFact(token);
        setActiveFact(fact.fact);
      } catch {
        setActiveFact("Backlog builds often run faster when requirements are concise.");
      }
    };

    await updateFact();
    factsRef.current = window.setInterval(() => {
      void updateFact();
    }, 7000);
  }

  function stopProgressVisuals(): void {
    if (spinnerRef.current) {
      window.clearInterval(spinnerRef.current);
      spinnerRef.current = null;
    }
    if (factsRef.current) {
      window.clearInterval(factsRef.current);
      factsRef.current = null;
    }
  }

  async function processUploadedDocument(): Promise<void> {
    if (files.length === 0) {
      setError("Upload at least one document first.");
      logLine("Process blocked: no uploaded files.");
      return;
    }
    if (!configuredProject) {
      setError("Project is required from your validated configuration.");
      logLine("Process blocked: missing configured project.");
      return;
    }

    setError(null);
    setStatus(null);
    setActionLoading("create-backlog");
    setBusy(true);
    setBoardUrl(null);
    setResultSummary(null);
    setReview(null);
    logLine(`Processing ${files.length} document(s)...`);
    logLine("Executing MCP tools: analyse_document -> preview_backlog -> create_backlog...");

    try {
      const token = await getAccessToken();
      logLine("Re-validating saved connection...");
      const validation = await validateSetupConfig(token, currentSetupPayload(false));
      hydrateSetup(validation.state);
      if (!validation.validated) {
        throw new Error("Connection validation did not complete. Please validate and try again.");
      }

      await startProgressVisuals(token);
      const response = await processDocument(token, {
        project: configuredProject,
        analysisMode: "process",
      });

      setStatus(response.reply);
      setBoardUrl(response.data?.boardUrl ?? null);
      setReview(response.data?.review ?? null);

      const backlogData = response.data?.backlog;
      const summary = backlogData && typeof backlogData === "object"
        ? Object.fromEntries(Object.entries(backlogData).filter(([, value]) => typeof value === "number"))
        : {};
      setResultSummary(Object.keys(summary).length > 0 ? (summary as Record<string, number>) : null);

      const toolList = response.data?.executedTools?.join(", ") ?? "analyse_document, preview_backlog, create_backlog";
      logLine(`MCP tools executed: ${toolList}`);
      logLine("Document processing completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document processing failed";
      logLine(`Document processing failed: ${message}`);
      logLine("Please retry from Step 3.");
      setError(message);
    } finally {
      stopProgressVisuals();
      setActiveFact(null);
      setBusy(false);
      setActionLoading((current) => (current === "create-backlog" ? null : current));
    }
  }

  async function processPersonas(): Promise<void> {
    if (files.length === 0) {
      setError("Upload at least one document first.");
      return;
    }
    if (!configuredProject) {
      setError("Project is required from your validated configuration.");
      return;
    }

    setError(null);
    setStatus(null);
    setActionLoading("create-personas");
    setBusy(true);
    logLine("Identifying personas from uploaded documents...");

    try {
      const token = await getAccessToken();
      const response = await createPersonas(token);
      setStatus(response.reply);
      logLine("Persona creation completed.");

      const personaData = response.data as { result?: { personas?: Array<{ name: string }> } } | undefined;
      const personaNames = personaData?.result?.personas?.map((p) => p.name) ?? [];
      if (personaNames.length > 0) {
        logLine(`Personas identified: ${personaNames.join(", ")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Persona creation failed";
      logLine(`Persona creation failed: ${message}`);
      setError(message);
    } finally {
      setBusy(false);
      setActionLoading((current) => (current === "create-personas" ? null : current));
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const token = await getAccessToken();
      const result = await getHistory(token);
      setHistoryEntries(result.entries);
    } catch {
      setHistoryEntries([]);
    }
  }

  async function handleClearHistory(): Promise<void> {
    try {
      const token = await getAccessToken();
      await clearHistory(token);
      setHistoryEntries([]);
      logLine("History cleared.");
    } catch {
      setError("Failed to clear history.");
    }
  }

  function renderHistoryPage(): JSX.Element {
    const actionLabels: Record<string, string> = {
      upload: "Upload",
      analyse_document: "Analyse Document",
      preview_backlog: "Preview Backlog",
      create_backlog: "Create Backlog",
      create_personas: "Create Personas",
    };

    return (
      <main className="fields-layout">
        <section className="panel fields-panel">
          <h2>History</h2>
          <p>Your recent uploads, tool calls, and results.</p>
          <button onClick={handleClearHistory}>Clear History</button>

          {historyEntries.length === 0 ? (
            <p>No history yet.</p>
          ) : (
            <div className="fields-table-wrap" role="region" aria-label="User history">
              <table className="fields-table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Action</th>
                    <th>Document(s)</th>
                    <th>Project</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td>{actionLabels[entry.action] ?? entry.action}</td>
                      <td>{entry.inputs.fileName ?? entry.inputs.fileNames?.join(", ") ?? "-"}</td>
                      <td>{entry.inputs.project ?? "-"}</td>
                      <td>{entry.outputs.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    );
  }

  function renderConnectionFields(): JSX.Element {
    if (selectedPlatform === "jira") {
      return (
        <>
          <label>
            Jira organization URL
            <input
              placeholder="https://your-domain.atlassian.net"
              value={jiraBaseUrl}
              onChange={(event) => setJiraBaseUrl(event.target.value)}
            />
          </label>
          <label>
            Jira project name / key
            <input value={jiraProject} onChange={(event) => setJiraProject(event.target.value)} />
          </label>
          <label>
            Jira PAT token
            <input
              type="password"
              placeholder={setupState?.hasJiraApiToken ? "Leave blank to keep saved token" : "Enter Jira PAT token"}
              value={jiraApiToken}
              onChange={(event) => setJiraApiToken(event.target.value)}
            />
          </label>
        </>
      );
    }

    return (
      <>
        <label>
          Azure DevOps organization URL
          <input
            placeholder="https://dev.azure.com/your-org"
            value={azureDevOpsUrl}
            onChange={(event) => setAzureDevOpsUrl(event.target.value)}
          />
        </label>
        <label>
          Target project name
          <input
            placeholder="New or existing project name"
            value={azureDevOpsProject}
            onChange={(event) => setAzureDevOpsProject(event.target.value)}
          />
          <p className="field-help">Enter a new project name to create, or an existing project that already uses the Enrichment process.</p>
        </label>
        <label>
          Azure DevOps PAT token
          <input
            type="password"
            placeholder={setupState?.hasAzureDevOpsPat ? "Leave blank to keep saved token" : "Enter Azure DevOps PAT token"}
            value={azureDevOpsPat}
            onChange={(event) => setAzureDevOpsPat(event.target.value)}
          />
        </label>

        <div className="source-ado-toggle">
          <button type="button" className="link-button" onClick={() => setShowSourceAdoFields((v) => !v)}>
            {showSourceAdoFields ? "Hide" : "Show"} enrichment process source config
          </button>
          {setupState?.enrichmentProcessStatus === "found" ? (
            <span className="enrichment-status success">Enrichment process active</span>
          ) : setupState?.enrichmentProcessStatus === "project_created" ? (
            <span className="enrichment-status success">Project created with Enrichment</span>
          ) : setupState?.enrichmentProcessStatus === "migrated" || setupState?.enrichmentProcessStatus === "migrated_and_assigned" ? (
            <span className="enrichment-status success">Process migrated</span>
          ) : setupState?.enrichmentProcessStatus === "assigned" ? (
            <span className="enrichment-status success">Process assigned to project</span>
          ) : setupState?.enrichmentProcessStatus === "migration_failed" ? (
            <span className="enrichment-status error">Migration failed</span>
          ) : setupState?.enrichmentProcessStatus === "not_checked" ? (
            <span className="enrichment-status warning">Process not found — provide source config</span>
          ) : null}
        </div>

        {showSourceAdoFields ? (
          <fieldset className="source-ado-fieldset">
            <legend>Enrichment process source (optional)</legend>
            <p className="field-help">
              If your target org does not have the Enrichment process, provide the source org details below.
              The process will be automatically migrated during validation.
            </p>
            <label>
              Source ADO organization URL
              <input
                placeholder="https://dev.azure.com/source-org"
                value={sourceAdoOrgUrl}
                onChange={(event) => setSourceAdoOrgUrl(event.target.value)}
              />
            </label>
            <label>
              Source ADO project name
              <input
                placeholder="Source project name"
                value={sourceAdoProject}
                onChange={(event) => setSourceAdoProject(event.target.value)}
              />
            </label>
            <label>
              Source ADO process name
              <input
                placeholder="CustomAgile"
                value={sourceAdoProcessName}
                onChange={(event) => setSourceAdoProcessName(event.target.value)}
              />
            </label>
            <label>
              Source ADO PAT token
              <input
                type="password"
                placeholder={setupState?.hasSourceAdoPat ? "Leave blank to keep saved token" : "PAT with Process: Read scope"}
                value={sourceAdoPat}
                onChange={(event) => setSourceAdoPat(event.target.value)}
              />
            </label>
          </fieldset>
        ) : null}
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="signin-shell">
        <section className="signin-card">
          <img src="/capgemini-logo-blue.svg" alt="Capgemini" style={{ width: 200, margin: "0 auto" }} />
          <h1>Backlog Assistant</h1>
          <p>Sign in to continue.</p>
          <div className="inline-action-row">
            <button onClick={signIn}>Sign in with Entra ID</button>
            {renderInlineSpinner("sign-in", "Signing in...")}
          </div>
          {error ? <div className="error">{error}</div> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <img src="/capgemini-logo-white.svg" alt="Capgemini" style={{ height: 54, marginBottom: 8, display: "block" }} />
        <h1>Backlog Assistant</h1>
        <p>Secure web interface for Azure DevOps and Jira backlog creation.</p>
        <div className="auth-row">
          <span>Signed in as {account?.username}</span>
          <button onClick={() => setShowEnrichmentFieldsPage((current) => !current)}>
            {showEnrichmentFieldsPage ? "Back to assistant" : "Enrichment fields"}
          </button>
          <button onClick={async () => {
            const next = !showHistoryPage;
            setShowHistoryPage(next);
            setShowEnrichmentFieldsPage(false);
            if (next) await loadHistory();
          }}>
            {showHistoryPage ? "Back to assistant" : "History"}
          </button>
          <button onClick={() => setShowConfigModal(true)}>Configuration</button>
          <button onClick={signOut}>Sign out</button>
          {renderInlineSpinner("sign-out", "Signing out...")}
        </div>
      </header>

      {showHistoryPage ? renderHistoryPage() : showEnrichmentFieldsPage ? renderEnrichmentFieldsPage() : !connectionReady ? (
        <main className="wizard-layout">
          <section className="panel control-panel">
            <h2>Step 1: Choose platform</h2>
            <p>Are you importing into Azure DevOps or Jira?</p>
            <div className="platform-choice">
              <button className={selectedPlatform === "azure-devops" ? "selected" : ""} onClick={() => void choosePlatform("azure-devops")}>Azure DevOps</button>
              <button className={selectedPlatform === "jira" ? "selected" : ""} onClick={() => void choosePlatform("jira")}>Jira</button>
            </div>

            {selectedPlatform && hasSavedConnectionFor(selectedPlatform) && !connectionChoiceAcknowledged ? (
              <div className="setup-card">
                <h3>Saved connection found</h3>
                <p>Confirm existing details or make changes before validation.</p>
                <div className="setup-actions">
                  <button disabled={validatingConnection} onClick={() => void validateConnection(true)}>Confirm & validate</button>
                  <button disabled={validatingConnection} onClick={() => setConnectionChoiceAcknowledged(true)}>Make changes</button>
                </div>
                {renderInlineSpinner("validate-connection", "Validating connection...")}
              </div>
            ) : null}

            {selectedPlatform && (connectionChoiceAcknowledged || !hasSavedConnectionFor(selectedPlatform)) ? (
              <>
                <h2>Step 2: Enter connection details</h2>
                {renderConnectionFields()}
                <div className="setup-actions">
                  <button disabled={validatingConnection} onClick={() => void saveConnectionDetails()}>Save details</button>
                  <button disabled={validatingConnection} onClick={() => void validateConnection(false)}>
                    {validatingConnection ? "Validating connection..." : "Validate connection"}
                  </button>
                </div>
                <div className="inline-action-row">
                  {renderInlineSpinner("save-connection", "Saving connection details...")}
                  {renderInlineSpinner("validate-connection", "Validating connection...")}
                </div>
              </>
            ) : null}

            <h2>Step 3: Upload + analysis</h2>
            <p>Connected platform: <strong>{activePlatform === "jira" ? "Jira" : "Azure DevOps"}</strong></p>
            <p>Project: <strong>{configuredProject || "(from validated setup)"}</strong></p>

            <label>
              Document type for upload
              <select value={pendingDocType} onChange={(event) => setPendingDocType(event.target.value as DocumentType)} disabled={busy}>
                <option value="to-be-process">To-Be Process</option>
                <option value="transcript">Transcript</option>
                <option value="reference">Reference / Diagram</option>
              </select>
            </label>
            <label className="upload">
              Upload documents (.txt, .docx, .pdf, images)
              <input type="file" accept=".txt,.docx,.pdf,.png,.jpg,.jpeg,.svg,.vsdx" multiple onChange={onUpload} disabled={busy} />
            </label>
            {renderInlineSpinner("upload", "Uploading file...")}

            <button disabled={busy} onClick={processUploadedDocument}>Create Backlog</button>
            <button disabled={busy} onClick={processPersonas}>Create Personas</button>
            <button disabled={busy} onClick={deleteAllUploadedFiles}>Delete all uploaded files</button>
            <button disabled={busy} onClick={() => void refreshFiles()}>Refresh files</button>
            <div className="inline-action-row">
              {renderInlineSpinner("create-backlog", "Creating backlog...")}
              {renderInlineSpinner("create-personas", "Identifying personas...")}
              {renderInlineSpinner("delete-all", "Deleting uploaded files...")}
              {renderInlineSpinner("refresh", "Refreshing file list...")}
            </div>

            <ul className="file-list">
              {files.map((file) => (
                <li key={file.fileName}>
                  <strong>{file.fileName}</strong>
                  <span className={`doc-type-badge ${file.documentType ?? "transcript"}`}>
                    {file.documentType === "to-be-process" ? "To-Be Process" : file.documentType === "reference" ? "Reference" : "Transcript"}
                  </span>
                  <span>{file.size} bytes</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel terminal-panel">
            <h2>Execution Terminal</h2>
            <pre className="terminal-window" aria-readonly="true">{terminalLines.join("\n")}</pre>
            {renderLowConfidenceDashboard()}
          </section>
        </main>
      ) : (
        <main className="layout">
          <section className="panel control-panel">
            <h2>Step 3: Upload + analysis</h2>
            <p>Connected platform: <strong>{activePlatform === "jira" ? "Jira" : "Azure DevOps"}</strong></p>
            <p>Project: <strong>{configuredProject}</strong></p>

            <label>
              Document type for upload
              <select value={pendingDocType} onChange={(event) => setPendingDocType(event.target.value as DocumentType)} disabled={busy}>
                <option value="to-be-process">To-Be Process</option>
                <option value="transcript">Transcript</option>
                <option value="reference">Reference / Diagram</option>
              </select>
            </label>
            <label className="upload">
              Upload documents (.txt, .docx, .pdf, images)
              <input type="file" accept=".txt,.docx,.pdf,.png,.jpg,.jpeg,.svg,.vsdx" multiple onChange={onUpload} disabled={busy} />
            </label>
            {renderInlineSpinner("upload", "Uploading file...")}

            <button disabled={busy} onClick={processUploadedDocument}>Create Backlog</button>
            <button disabled={busy} onClick={processPersonas}>Create Personas</button>
            <button disabled={busy} onClick={deleteAllUploadedFiles}>Delete all uploaded files</button>
            <button disabled={busy} onClick={() => void refreshFiles()}>Refresh files</button>
            <div className="inline-action-row">
              {renderInlineSpinner("create-backlog", "Creating backlog...")}
              {renderInlineSpinner("create-personas", "Identifying personas...")}
              {renderInlineSpinner("delete-all", "Deleting uploaded files...")}
              {renderInlineSpinner("refresh", "Refreshing file list...")}
            </div>

            <ul className="file-list">
              {files.map((file) => (
                <li key={file.fileName}>
                  <strong>{file.fileName}</strong>
                  <span className={`doc-type-badge ${file.documentType ?? "transcript"}`}>
                    {file.documentType === "to-be-process" ? "To-Be Process" : file.documentType === "reference" ? "Reference" : "Transcript"}
                  </span>
                  <span>{file.size} bytes</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel terminal-panel">
            <h2>Execution Terminal</h2>
            <pre className="terminal-window" aria-readonly="true">
              {terminalLines.join("\n")}
              {busy ? `\n$ Creating backlog ${spinnerGlyph}` : ""}
              {busy && activeFact ? `\n$ Random fact: ${activeFact}` : ""}
            </pre>

            {resultSummary ? (
              <div className="setup-status">
                {Object.entries(resultSummary).map(([key, value]) => (
                  <div key={key}>{key}: {value}</div>
                ))}
              </div>
            ) : null}
            {boardUrl ? (
              <div className="setup-status">
                Step 4: <a href={boardUrl} target="_blank" rel="noreferrer">Open board</a>
              </div>
            ) : null}
            {renderLowConfidenceDashboard()}
          </section>
        </main>
      )}

      {status ? <div className="setup-status">{status}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {showValidationSuccess ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Successfully Validated</h3>
            <p>Your connection is valid. Continue to backlog creation.</p>
            <button
              onClick={async () => {
                setShowValidationSuccess(false);
                const token = await getAccessToken();
                await refreshFiles(token, false);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {showConfigModal ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Configuration</h3>
            <p>Update your saved Azure DevOps/Jira connection profile.</p>
            <div className="platform-choice">
              <button className={selectedPlatform === "azure-devops" ? "selected" : ""} onClick={() => setSelectedPlatform("azure-devops")}>Azure DevOps</button>
              <button className={selectedPlatform === "jira" ? "selected" : ""} onClick={() => setSelectedPlatform("jira")}>Jira</button>
            </div>
            {selectedPlatform ? renderConnectionFields() : null}
            <div className="setup-actions">
              <button disabled={validatingConnection} onClick={() => void saveConnectionDetails()}>Save</button>
              <button disabled={validatingConnection} onClick={async () => {
                await validateConnection(false);
                setShowConfigModal(false);
              }}>
                {validatingConnection ? "Validating..." : "Save & Validate"}
              </button>
              <button onClick={() => setShowConfigModal(false)}>Close</button>
            </div>
            {renderInlineSpinner("save-connection", "Saving connection details...")}
            {renderInlineSpinner("validate-connection", "Validating connection...")}
          </div>
        </div>
      ) : null}
    </div>
  );
}
