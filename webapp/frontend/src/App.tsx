import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import {
  checkProcess,
  deleteAllFiles,
  getFiles,
  getRandomFact,
  getSetupConfig,
  processDocument,
  saveSetupConfig,
  uploadFile,
  validateSetupConfig,
} from "./api";
import { BacklogReviewResult, ProcessCheckResult, ProcessType, SetupConfigPayload, SetupConfigState, UploadedFile } from "./types";

const bffScope = import.meta.env.VITE_BFF_SCOPE as string;
type LoadingAction =
  | "sign-in"
  | "sign-out"
  | "save-connection"
  | "validate-connection"
  | "upload"
  | "refresh"
  | "delete-all"
  | "create-backlog";

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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showValidationSuccess, setShowValidationSuccess] = useState(false);
  const [validatingConnection, setValidatingConnection] = useState(false);

  const [azureDevOpsUrl, setAzureDevOpsUrl] = useState("");
  const [azureDevOpsProject, setAzureDevOpsProject] = useState("");
  const [azureDevOpsPat, setAzureDevOpsPat] = useState("");

  const [analysisMode, setAnalysisMode] = useState<"process" | "themes">("process");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionLoading, setActionLoading] = useState<LoadingAction | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [activeFact, setActiveFact] = useState<string | null>(null);
  const [boardUrl, setBoardUrl] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<Record<string, number> | null>(null);
  const [review, setReview] = useState<BacklogReviewResult | null>(null);
  const [showEnrichmentFieldsPage, setShowEnrichmentFieldsPage] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [processCheck, setProcessCheck] = useState<ProcessCheckResult | null>(null);
  const [processChecking, setProcessChecking] = useState(false);
  const [selectedProcessType, setSelectedProcessType] = useState<ProcessType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "$ Ready. Sign in to begin.",
  ]);
  const spinnerRef = useRef<number | null>(null);
  const factsRef = useRef<number | null>(null);

  const account = accounts[0];
  const isAuthenticated = Boolean(account);
  const configuredProject = useMemo(
    () => (azureDevOpsProject || setupState?.azureDevOpsProject || "").trim(),
    [azureDevOpsProject, setupState?.azureDevOpsProject]
  );
  const spinnerGlyph = ["|", "/", "-", "\\"][spinnerFrame % 4];
  const lowConfidenceWorkItems = useMemo(() => {
    const items = review?.items ?? [];
    return items
      .filter((item) => (item.enrichment?.confidence?.overall ?? 100) < 60)
      .sort((left, right) => (left.enrichment?.confidence?.overall ?? 100) - (right.enrichment?.confidence?.overall ?? 100));
  }, [review]);

  // Connection is only ready when validated AND process template is confirmed
  const connectionReady = Boolean(
    setupState?.isValidated && processCheck?.hasCorrectProcess
  );

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

  function renderUserGuide(): JSX.Element {
    return (
      <main className="fields-layout">
        <section className="panel fields-panel" style={{ maxWidth: 820 }}>
          <h2>User Guide</h2>
          <p style={{ opacity: 0.8, marginBottom: 16 }}>Step-by-step guide to using the Backlog Assistant.</p>

          <h3>Getting started</h3>
          <p>Sign in with your organisational account. After sign-in you will see the backlog assistant home screen.</p>

          <h3>Choose a process type</h3>
          <p>Before entering connection details, select the Azure DevOps process template your project should use (e.g. <strong>Agile with Enrichment</strong> or <strong>Finance &amp; Operations</strong>). Step 1 only appears after a process type is selected.</p>

          <h3>Step 1: Connect to Azure DevOps</h3>
          <ol>
            <li>Enter your Azure DevOps <strong>URL</strong> (e.g. <code>https://dev.azure.com/your-org</code>).</li>
            <li>Enter the <strong>Project name</strong> where backlog items should be created.</li>
            <li>Enter a <strong>Personal Access Token (PAT)</strong> with Work Items Read &amp; Write scope.</li>
            <li>Click <strong>Save details</strong>, then <strong>Validate connection</strong>.</li>
          </ol>
          <p>If a saved profile exists you will see <strong>Saved connection found</strong> with options to confirm or edit.</p>

          <h3>Process template check</h3>
          <p>After validation the app automatically checks that your project uses the expected process template for the selected process type.</p>
          <ul>
            <li><strong>Process correct</strong> — you will see &ldquo;Process verified&rdquo; and can proceed.</li>
            <li><strong>Process incorrect</strong> — the app shows the expected process name and provides step-by-step instructions to change your project&apos;s process in Azure DevOps Organization Settings. After changing the process, return here and click <strong>Validate connection</strong> again.</li>
          </ul>

          <h3>Step 2: Upload a document</h3>
          <ol>
            <li>Upload a single <code>.txt</code> file (transcript or to-be process document).</li>
            <li>Confirm the file appears in the file list below the upload button.</li>
          </ol>

          <h3>Step 3: Create backlog</h3>
          <ol>
            <li>Select an <strong>Analysis mode</strong>:
              <ul>
                <li><strong>To-be process</strong> — for structured process documents.</li>
                <li><strong>Transcript</strong> — for meeting transcripts or unstructured notes.</li>
              </ul>
            </li>
            <li>Click <strong>Create Backlog</strong>.</li>
            <li>Wait for the process to complete. You will see progress in the Execution Terminal and a rotating fact message during longer processing.</li>
          </ol>

          <h3>Step 4: View results</h3>
          <p>After completion a link to your Azure DevOps board is shown. Click it to view the created epics, features, and user stories with enrichment data.</p>

          <h3>Managing files</h3>
          <ul>
            <li><strong>Refresh files</strong> — reload the uploaded file list.</li>
            <li><strong>Delete all uploaded files</strong> — clear all uploaded content from the server.</li>
          </ul>

          <h3>Configuration</h3>
          <p>Click <strong>Configuration</strong> in the header to update your Azure DevOps connection at any time. Use <strong>Save &amp; validate</strong> to change to a different project and re-run the process template check.</p>

          <h3>Enrichment fields reference</h3>
          <p>Click <strong>Enrichment fields</strong> in the header to see the full list of 22 custom Azure DevOps fields used for backlog enrichment, including confidence scores, dependencies, quality metrics, effort estimates, and more.</p>

          <h3>Troubleshooting</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Problem</th>
                <th style={{ padding: "8px 12px" }}>Solution</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 12px" }}>Create Backlog does nothing</td>
                <td style={{ padding: "8px 12px" }}>Check that a <code>.txt</code> file is uploaded and visible in the file list.</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 12px" }}>Validation fails</td>
                <td style={{ padding: "8px 12px" }}>Check your URL, project name, and PAT token. Reopen Configuration and try again.</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 12px" }}>UI looks outdated</td>
                <td style={{ padding: "8px 12px" }}>Hard refresh with <code>Ctrl+F5</code> to clear browser cache.</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 12px" }}>Unexpected error</td>
                <td style={{ padding: "8px 12px" }}>Check the <strong>Execution Terminal</strong> panel for the detailed action flow and failure reason.</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
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
    setAzureDevOpsUrl(state.azureDevOpsUrl ?? "");
    setAzureDevOpsProject(state.azureDevOpsProject ?? "");
    if (state.processType) {
      setSelectedProcessType(state.processType);
    }
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

          // Check process template on load for validated connections
          setProcessChecking(true);
          try {
            const processResult = await checkProcess(token);
            setProcessCheck(processResult);
            if (processResult.hasCorrectProcess) {
              logLine(`Process verified: using "${processResult.processName}".`);
            } else {
              logLine(`Incorrect process "${processResult.processName}". Expected "${processResult.expectedProcessName}".`);
            }
          } catch {
            logLine("Could not check project process template.");
          } finally {
            setProcessChecking(false);
          }
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
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt files are supported for processing.");
      logLine(`Rejected upload for '${file.name}' (only .txt allowed).`);
      event.target.value = "";
      return;
    }

    setError(null);
    setActionLoading("upload");
    setBusy(true);
    logLine(`Uploading '${file.name}' to MCP server...`);

    try {
      const token = await getAccessToken();
      await uploadFile(token, file);
      await refreshFiles(token, false);
      setStatus(`Uploaded '${file.name}'.`);
      logLine(`Upload completed for '${file.name}'.`);
    } catch (error) {
      logLine(`Upload failed for '${file.name}'.`);
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
      azureDevOpsUrl: azureDevOpsUrl.trim() || undefined,
      azureDevOpsProject: azureDevOpsProject.trim() || undefined,
      azureDevOpsPat: includeSecrets ? azureDevOpsPat.trim() || undefined : undefined,
      processType: selectedProcessType ?? undefined,
    };
  }

  function hasSavedConnection(): boolean {
    if (!setupState) return false;
    return Boolean(setupState.azureDevOpsUrl && setupState.azureDevOpsProject && setupState.hasAzureDevOpsPat);
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
      setStatus("Successfully validated.");
      logLine("Connection validated successfully.");

      // After validation succeeds, check process template
      setProcessChecking(true);
      logLine("Checking project process template...");
      try {
        const processResult = await checkProcess(token);
        setProcessCheck(processResult);
        if (processResult.hasCorrectProcess) {
          logLine(`Process verified: using "${processResult.processName}".`);
        } else {
          logLine(`Incorrect process "${processResult.processName}". Expected "${processResult.expectedProcessName}".`);
        }
      } catch (err) {
        logLine("Could not check process template: " + (err instanceof Error ? err.message : "unknown error"));
      } finally {
        setProcessChecking(false);
      }
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "Validation failed";
      setError(message);
      logLine(`Validation failed: ${message}`);
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
    const selectedFileName = files[0]?.fileName;
    if (!selectedFileName) {
      setError("Upload a file first.");
      logLine("Process blocked: upload one .txt file first.");
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
    logLine(`Processing '${selectedFileName}' with analysis mode '${analysisMode}'...`);
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
        analysisMode,
        fileName: selectedFileName,
      });

      setStatus(response.reply);
      setBoardUrl(response.data?.boardUrl ?? null);
      setReview(response.data?.review ?? null);

      const backlogData = response.data?.backlog;
      const summary = backlogData && typeof backlogData === "object"
        ? Object.fromEntries(Object.entries(backlogData).filter(([, value]) => typeof value === "number"))
        : {};
      setResultSummary(Object.keys(summary).length > 0 ? (summary as Record<string, number>) : null);

      logLine("MCP tools executed via process route: analyse_document, preview_backlog, create_backlog.");
      logLine("Document processing completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document processing failed";
      logLine(`Document processing failed: ${message}`);
      logLine("Please retry from Step 2.");
      setError(message);
    } finally {
      stopProgressVisuals();
      setActiveFact(null);
      setBusy(false);
      setActionLoading((current) => (current === "create-backlog" ? null : current));
    }
  }

  function renderConnectionFields(): JSX.Element {
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
          Azure DevOps project name
          <input value={azureDevOpsProject} onChange={(event) => setAzureDevOpsProject(event.target.value)} />
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
        <p>Secure web interface for Azure DevOps backlog creation.</p>
        <div className="auth-row">
          <span>Signed in as {account?.username}</span>
          {(showEnrichmentFieldsPage || showUserGuide) ? (
            <button onClick={() => { setShowEnrichmentFieldsPage(false); setShowUserGuide(false); }}>Back to assistant</button>
          ) : (
            <>
              <button onClick={() => setShowEnrichmentFieldsPage(true)}>Enrichment fields</button>
              <button onClick={() => setShowConfigModal(true)}>Configuration</button>
            </>
          )}
          <button onClick={signOut}>Sign out</button>
          {renderInlineSpinner("sign-out", "Signing out...")}
          <button
            onClick={() => { setShowUserGuide((c) => !c); setShowEnrichmentFieldsPage(false); }}
            title="User Guide"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.7)",
              background: "transparent",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            ?
          </button>
        </div>
      </header>

      {showUserGuide ? renderUserGuide() : showEnrichmentFieldsPage ? renderEnrichmentFieldsPage() : !connectionReady ? (
        <main className="wizard-layout">
          <section className="panel control-panel">
            <h2>Choose Process Type</h2>
            <p>Select the Azure DevOps process template your project should use.</p>
            <div className="setup-actions" style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setSelectedProcessType("agile-enrichment")}
                style={{
                  padding: "12px 20px", fontWeight: 600,
                  background: selectedProcessType === "agile-enrichment" ? "#0058ab" : "#f5f5f5",
                  color: selectedProcessType === "agile-enrichment" ? "#fff" : "#333",
                  border: "2px solid " + (selectedProcessType === "agile-enrichment" ? "#0058ab" : "#ddd"),
                  borderRadius: 8, cursor: "pointer"
                }}
              >
                Agile with Enrichment
              </button>
              <button
                onClick={() => setSelectedProcessType("finance-operations")}
                style={{
                  padding: "12px 20px", fontWeight: 600,
                  background: selectedProcessType === "finance-operations" ? "#0058ab" : "#f5f5f5",
                  color: selectedProcessType === "finance-operations" ? "#fff" : "#333",
                  border: "2px solid " + (selectedProcessType === "finance-operations" ? "#0058ab" : "#ddd"),
                  borderRadius: 8, cursor: "pointer"
                }}
              >
                Finance &amp; Operations
              </button>
            </div>

            {selectedProcessType !== null && (
              <>
                {hasSavedConnection() ? (
                  <div className="setup-card">
                    <h3>Saved connection found</h3>
                    <p>Confirm existing details or make changes before validation.</p>
                    <div className="setup-actions">
                      <button disabled={validatingConnection} onClick={() => void validateConnection(true)}>Confirm &amp; validate</button>
                    </div>
                    {renderInlineSpinner("validate-connection", "Validating connection...")}
                  </div>
                ) : null}

                <h2>Step 1: Enter connection details</h2>
                {renderConnectionFields()}
                <div className="setup-actions">
                  <button disabled={validatingConnection} onClick={() => void saveConnectionDetails()}>Save details</button>
                  <button disabled={validatingConnection} onClick={() => void validateConnection(false)}>
                    {validatingConnection ? "Validating connection..." : "Validate connection"}
                  </button>
                </div>
                {actionLoading === "save-connection" && (
                  <div style={{ margin: "12px 0", padding: 14, borderRadius: 10, background: "#e3f2fd", display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="spinner-dot" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: "1rem" }}>Saving connection details...</span>
                  </div>
                )}
                {actionLoading === "validate-connection" && (
                  <div style={{ margin: "12px 0", padding: 14, borderRadius: 10, background: "#e3f2fd", display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="spinner-dot" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: "1rem" }}>Validating connection to Azure DevOps...</span>
                  </div>
                )}

                {/* Process check — blocks progress until correct process is confirmed */}
                {setupState?.isValidated && (
                  <div style={{ margin: "16px 0", padding: 16, borderRadius: 10, background: processCheck?.hasCorrectProcess ? "#e6f4ea" : processChecking ? "#e3f2fd" : "#fff3e0" }}>
                    {processChecking ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="spinner-dot" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: "1rem" }}>Checking project process template...</span>
                      </div>
                    ) : processCheck?.hasCorrectProcess ? (
                      <p style={{ margin: 0, color: "#2e7d32", fontWeight: 600, fontSize: "1rem" }}>Process verified: using &ldquo;{processCheck.processName}&rdquo;.</p>
                    ) : processCheck ? (
                      <div>
                        <h3 style={{ margin: "0 0 8px", color: "#e65100" }}>Incorrect Process Template</h3>
                        <p style={{ margin: "0 0 12px" }}>
                          Your project is using the &ldquo;{processCheck.processName}&rdquo; process, but the expected process is &ldquo;{processCheck.expectedProcessName}&rdquo;.
                        </p>
                        <p style={{ margin: "0 0 12px" }}>
                          To fix this, change your project&apos;s process in Azure DevOps:
                        </p>
                        <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                          <li>Go to <strong>Organization Settings</strong> &gt; <strong>Process</strong></li>
                          <li>Find your current process (&ldquo;{processCheck.processName}&rdquo;) and open it</li>
                          <li>Select the <strong>Projects</strong> tab</li>
                          <li>Click the <strong>&hellip;</strong> menu next to your project and select <strong>Change process</strong></li>
                          <li>Choose the &ldquo;{processCheck.expectedProcessName}&rdquo; process</li>
                        </ol>
                        <p style={{ margin: 0 }}>
                          After changing the process, return here and click <strong>Validate connection</strong> again.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            )}

            <h2>Step 2: Upload + analysis</h2>
            <p>Connected platform: <strong>Azure DevOps</strong></p>
            <p>Project: <strong>{configuredProject || "(from validated setup)"}</strong></p>

            <label className="upload">
              Upload transcript / to-be process file (.txt)
              <input type="file" accept=".txt,text/plain" onChange={onUpload} disabled={busy} />
            </label>
            {renderInlineSpinner("upload", "Uploading file...")}

            <label>
              Analysis mode
              <select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as "process" | "themes")} disabled={busy}>
                <option value="process">to-be process</option>
                <option value="themes">transcript</option>
              </select>
            </label>

            <button disabled={busy} onClick={processUploadedDocument}>Create Backlog</button>
            <button disabled={busy} onClick={deleteAllUploadedFiles}>Delete all uploaded files</button>
            <button disabled={busy} onClick={() => void refreshFiles()}>Refresh files</button>
            <div className="inline-action-row">
              {renderInlineSpinner("create-backlog", "Creating backlog...")}
              {renderInlineSpinner("delete-all", "Deleting uploaded files...")}
              {renderInlineSpinner("refresh", "Refreshing file list...")}
            </div>

            <ul className="file-list">
              {files.map((file) => (
                <li key={file.fileName}>
                  <strong>{file.fileName}</strong>
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
            <h2>Step 2: Upload + analysis</h2>
            <p>Connected platform: <strong>Azure DevOps</strong></p>
            <p>Project: <strong>{configuredProject}</strong></p>

            <label className="upload">
              Upload transcript / to-be process file (.txt)
              <input type="file" accept=".txt,text/plain" onChange={onUpload} disabled={busy} />
            </label>
            {renderInlineSpinner("upload", "Uploading file...")}

            <label>
              Analysis mode
              <select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as "process" | "themes")} disabled={busy}>
                <option value="process">to-be process</option>
                <option value="themes">transcript</option>
              </select>
            </label>

            <button disabled={busy} onClick={processUploadedDocument}>Create Backlog</button>
            <button disabled={busy} onClick={deleteAllUploadedFiles}>Delete all uploaded files</button>
            <button disabled={busy} onClick={() => void refreshFiles()}>Refresh files</button>
            <div className="inline-action-row">
              {renderInlineSpinner("create-backlog", "Creating backlog...")}
              {renderInlineSpinner("delete-all", "Deleting uploaded files...")}
              {renderInlineSpinner("refresh", "Refreshing file list...")}
            </div>

            <ul className="file-list">
              {files.map((file) => (
                <li key={file.fileName}>
                  <strong>{file.fileName}</strong>
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
                Step 3: <a href={boardUrl} target="_blank" rel="noreferrer">Open board</a>
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
            <h3>Connection Validated</h3>
            <p>Your Azure DevOps connection is valid. Checking process template...</p>
            <button onClick={() => setShowValidationSuccess(false)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}


      {showConfigModal ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Configuration</h3>
            <p>Update your saved Azure DevOps connection profile.</p>
            {renderConnectionFields()}
            <div className="setup-actions">
              <button onClick={async () => { await saveConnectionDetails(); setShowConfigModal(false); }}>Save & close</button>
              <button disabled={validatingConnection} onClick={async () => { setShowConfigModal(false); await validateConnection(false); }}>
                {validatingConnection ? "Validating..." : "Save & validate"}
              </button>
              <button onClick={() => setShowConfigModal(false)}>Cancel</button>
            </div>
            {renderInlineSpinner("save-connection", "Saving connection details...")}
          </div>
        </div>
      ) : null}
    </div>
  );
}
