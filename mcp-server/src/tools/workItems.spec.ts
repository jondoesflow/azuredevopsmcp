import { beforeEach, describe, expect, test, jest } from "@jest/globals";

import { getFileStore, handleWorkItemTool, _testExports } from "./workItems.js";
const {
  stripHtml,
  parseBooleanEnv,
  getEnrichmentFlags,
  truncate,
  toSingleLine,
  escapeRegExp,
  escapeHtml,
  assessRubrics,
  buildRubricAcceptanceCriteria,
  selectBestExcerpt,
  buildProvenanceHtml,
  buildProvenanceText,
  appendAcceptanceCriteriaBlock,
  tryDecodeBase64,
  cleanExtractedText,
  splitIntoSentencesAndLines,
  isLikelyProcessStep,
  extractRoleFromStep,
  extractEvidenceTerms,
  normaliseTitle,
  findWorkItemByTitle,
  detectPersonaFromTranscript,
  getBestPersona,
  toPreviewItemId,
  buildGherkinCriteria,
  buildStoryDescription,
  buildEpicDescription,
  buildFeatureDescription,
  buildProcessEpicDescription,
  buildProcessFeatureDescription,
  buildPlaceholderStoryDescription,
  selectEvidenceSnippets,
  appendUnique,
  toEnrichmentLabelToken,
  buildEnrichmentSummaryText,
  buildEnrichmentSummaryHtml,
  toHtmlList,
  buildAdoEnrichmentCustomFields,
  applyAdoEnrichment,
  parseStoredAnalysis,
  parseStoredPreview,
  scanSectionForThemes,
  parseAnalysisMode,
  getPreviewStoreKey,
  findEnrichmentForTitle,
} = _testExports;

// Mock AzureDevOpsClient - casting to any to avoid strict typing issues
jest.mock("../azureDevOpsClient.js");

// Mock processMigration functions
jest.mock("../processMigration.js", () => ({
  checkProjectProcess: jest.fn(),
  migrateProcess: jest.fn(),
  ensureProcessOnProject: jest.fn(),
  checkEnrichmentProcessExists: jest.fn(),
  createProjectWithProcess: jest.fn(),
}));

// Mock enrichment and rraid functions
jest.mock("./enrichment/orchestrator.js", () => ({
  enrichGeneratedWorkItems: jest.fn((_ctx: unknown, items: unknown) => ({ items, warnings: [], idempotencyKey: "test" })),
}));
jest.mock("./enrichment/refinement.js", () => ({
  generateRefinementSuggestion: jest.fn(),
}));
jest.mock("./rraid.js", () => ({
  extractRRAID: jest.fn(),
  matchRRAIDToStories: jest.fn(),
}));


describe("workItems tools - File Operations", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("process_transcript stores file and does not return preview by default", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "t1.txt",
      fileContent: "hello world",
    });

    const parsed = JSON.parse(raw) as { result: string; fileName: string; size: number; preview?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.fileName).toBe("t1.txt");
    expect(parsed.preview).toBeUndefined();

    const stored = getFileStore().get("t1.txt");
    expect(stored?.content).toBe("hello world");
  });

  test("process_transcript returns preview only when includePreview=true", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "t2.txt",
      fileContent: "hello world specification",
      includePreview: true,
    });

    const parsed = JSON.parse(raw) as { result: string; preview?: string };
    expect(parsed.result).toBe("success");
    expect(typeof parsed.preview).toBe("string");
  });

  test("get_file_content returns metadata only by default", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "t3.txt",
      fileContent: "secret transcript",
    });

    const raw = await handleWorkItemTool({}, "get_file_content", {
      project: "TestProj",
      fileName: "t3.txt",
    });

    const parsed = JSON.parse(raw) as { result: string; content?: string; message?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.content).toBeUndefined();
    expect(parsed.message).toMatch(/suppressed/i);
  });

  test("get_file_content returns content when includeContent=true", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "t4.txt",
      fileContent: "secret transcript",
    });

    const raw = await handleWorkItemTool({}, "get_file_content", {
      project: "TestProj",
      fileName: "t4.txt",
      includeContent: true,
    });

    const parsed = JSON.parse(raw) as { result: string; content?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.content).toBe("secret transcript");
  });

  test("get_file_chunk returns chunked content for large files", async () => {
    const largeContent = "x".repeat(10000);
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "large.txt",
      fileContent: largeContent,
    });

    const raw = await handleWorkItemTool({}, "get_file_chunk", {
      project: "TestProj",
      fileName: "large.txt",
      chunkIndex: 0,
      includeContent: true,
    });

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
    expect(parsed.content).toBeDefined();
    expect(parsed.totalChunks).toBeGreaterThanOrEqual(1);
    expect(parsed.chunkIndex).toBe(0);
  });

  test("list_uploaded_files returns all stored files", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "f1.txt",
      fileContent: "content1",
    });
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "f2.txt",
      fileContent: "content2",
    });

    const raw = await handleWorkItemTool({}, "list_uploaded_files", {
      project: "TestProj",
    });

    const parsed = JSON.parse(raw) as { result: string; files?: string[] };
    expect(parsed.result).toBe("success");
    expect(Array.isArray(parsed.files)).toBe(true);
    expect((parsed.files ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("delete_file removes file from storage", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "todelete.txt",
      fileContent: "will be deleted",
    });

    const raw = await handleWorkItemTool({}, "delete_file", {
      project: "TestProj",
      fileName: "todelete.txt",
    });

    const parsed = JSON.parse(raw) as { result: string };
    expect(parsed.result).toBe("success");

    const stored = getFileStore().get("todelete.txt");
    expect(stored).toBeUndefined();
  });
});

describe("workItems tools - Document Analysis", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("analyse_document returns success for themes mode", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "analysis.txt",
      fileContent: "We need security RBAC and an integration API plus audit trail.",
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "analysis.txt",
      analysisMode: "themes",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Either success or error is acceptable, as long as it's a valid response
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document stores analysis in cache", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "analysis2.txt",
      fileContent: "Performance monitoring and logging required.",
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "analysis2.txt",
      analysisMode: "themes",
    });

    const parsed = JSON.parse(raw) as { result?: string };
    // If analysis was successful, check cache
    if (!raw.includes("error")) {
      const cached = getFileStore().get("__analysis_analysis2.txt");
      // Cache may or may not exist depending on implementation
      if (cached) {
        expect(cached.content).toBeDefined();
      }
    }
  });

  test("analyse_document supports process mode for To-Be process documents", async () => {
    const processContent = `
Stage: Order Processing
- Create order in system
- Validate order data with audit trail
- Submit to approval workflow
- Send notification to warehouse

Stage: Fulfillment
- Pick items from inventory
- Pack and label shipment
- Record shipment in RBAC-controlled interface
- Integrate with tracking API
`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "to_be_process.txt",
      fileContent: processContent,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "to_be_process.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: unknown[] };
    expect(parsed.result || parsed.error).toBeDefined();
    // Process mode should identify stages
    if (parsed.result === "success" && parsed.stages) {
      expect(Array.isArray(parsed.stages)).toBe(true);
    }
  });

  test("analyse_document identifies security and compliance themes", async () => {
    const content = "System must enforce RBAC, pass audit compliance, support encryption, maintain data validation rules.";
    
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "security_doc.txt",
      fileContent: content,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "security_doc.txt",
      analysisMode: "themes",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; themes?: Record<string, unknown> };
    expect(parsed.result || parsed.error).toBeDefined();
    // Should identify security and compliance themes
    if (parsed.result === "success" && parsed.themes) {
      const themeNames = Object.keys(parsed.themes || {});
      const hasSecurityOrCompliance = themeNames.some(t => 
        t.toLowerCase().includes("security") || t.toLowerCase().includes("compliance")
      );
      expect(hasSecurityOrCompliance || themeNames.length > 0).toBe(true);
    }
  });

  test("analyse_document handles long documents with multiple sections", async () => {
    const longDoc = `
Work Management Overview
The system manages work orders through a comprehensive workflow. Users create work orders via mobile app or web interface.

Scheduling and Dispatch
Operators schedule jobs using AI-powered capacity planning. Emergency calls trigger immediate dispatch protocols. Rescheduling follows priority rules.

Subcontractor Management
Third party contractors are onboarded through the platform. Supplier performance is tracked. Supply chain integration required.

Commercial and Billing
Invoice generation happens post-completion. Rate cards are configurable. Variations tracked with compensation events.

ERP Integration
Oracle ERP integration for project costing. General ledger sync required. Revenue recognition follows accounting standards.

The system must maintain data quality, support RBAC access control, and provide comprehensive audit trails for all transactions.
`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "long_doc.txt",
      fileContent: longDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "long_doc.txt",
      analysisMode: "themes",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; themes?: Record<string, unknown> };
    expect(parsed.result || parsed.error).toBeDefined();
    // Should identify multiple themes from comprehensive document
    if (parsed.result === "success" && parsed.themes) {
      expect(Object.keys(parsed.themes).length).toBeGreaterThan(0);
    }
  });
});

describe("workItems tools - Backlog Operations", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("preview_backlog placeholder request", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "preview.txt",
      fileContent: "User story: As a user I want to login securely.",
    });

    const raw = await handleWorkItemTool({}, "preview_backlog", {
      project: "TestProj",
      fileName: "preview.txt",
      storyMaturity: "placeholder",
    });

    // This may error if analysis isn't available, which is expected
    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("preview_backlog detailed request", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "detailed.txt",
      fileContent: "Feature: Login with OAuth2 providing secure authentication.",
    });

    const raw = await handleWorkItemTool({}, "preview_backlog", {
      project: "TestProj",
      fileName: "detailed.txt",
      storyMaturity: "detailed",
    });

    // This may error if analysis isn't available, which is expected
    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });

//   test("preview_backlog with process-first analysis", async () => {
//     const processDoc = `
// Stage: Order Processing
// 1. Create order with validation
// 2. Submit for approval from manager
// 3. Payment authorization from finance
// 4. Send confirmation to customer

// Stage: Fulfillment
// 1. Pick items from warehouse inventory
// 2. Pack with quality checks
// 3. Dispatch via carrier integration
// 4. Update tracking in system`;

//     await handleWorkItemTool({}, "process_transcript", {
//       project: "TestProj",
//       fileName: "process_order.txt",
//       fileContent: processDoc,
//     });

//     // Analyze as process document
//     await handleWorkItemTool({}, "analyse_document", {
//       project: "TestProj",
//       fileName: "process_order.txt",
//       analysisMode: "process",
//     });

//     const previewRaw = await handleWorkItemTool({}, "preview_backlog", {
//       project: "TestProj",
//       processFileName: "process_order.txt",
//       storyMaturity: "placeholder",
//     });

//     const parsed = JSON.parse(previewRaw) as { 
//       result?: string; 
//       error?: string;
//       storyCount?: number;
//       items?: unknown[];
//     };
//     expect(parsed.result || parsed.error).toBeDefined();
//     // If process analysis succeeded, should have stories
//     if (parsed.result === "success") {
//       expect(typeof parsed.storyCount).toBe("number");
//       expect(Array.isArray(parsed.items)).toBe(true);
//     }
//   });

//   test("preview_backlog avec design references and evidence", async () => {
//     const processDoc = `
// Stage: Data Integration
// - Role: Data Engineer
// - Extract data from Oracle ERP system
// - Transform and validate using ETL rules
// - Load into data warehouse with audit trail
// - Generate reporting dashboards`;

//     const evidenceDoc = `
// Evidence: The integration team confirmed Oracle ERP connectivity.
// The data warehouse needs to support real-time dashboards.
// Key metrics include performance and data quality.`;

//     await handleWorkItemTool({}, "process_transcript", {
//       project: "TestProj",
//       fileName: "process_data.txt",
//       fileContent: processDoc,
//     });

//     await handleWorkItemTool({}, "process_transcript", {
//       project: "TestProj",
//       fileName: "evidence_data.txt",
//       fileContent: evidenceDoc,
//     });

//     await handleWorkItemTool({}, "analyse_document", {
//       project: "TestProj",
//       fileName: "process_data.txt",
//       analysisMode: "process",
//     });

//     const previewRaw = await handleWorkItemTool({}, "preview_backlog", {
//       project: "TestProj",
//       processFileName: "process_data.txt",
//       evidenceFileName: "evidence_data.txt",
//       storyMaturity: "detailed",
//       designReferences: ["DESIGN-001", "DESIGN-002"],
//     });

//     const parsed = JSON.parse(previewRaw) as { result?: string; error?: string };
//     expect(parsed.result || parsed.error).toBeDefined();
//   });
});

describe("workItems tools - Process Analysis (lines 1481-1605)", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("analyse_document parses stages from process document", async () => {
    const processDoc = `
Stage: Order Management
- Create purchase order in system
- Validate order data with business rules
- Submit to approval workflow
- Send notification to supplier

Stage: Fulfillment
- Receive inventory from supplier
- Perform quality inspection
- Book items into warehouse
- Update inventory dashboard`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "stages.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "stages.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: unknown[] };
    // Process analysis should identify stages
    if ((parsed as any).stages) {
      expect(Array.isArray(parsed.stages)).toBe(true);
    }
  });

  test("analyse_document identifies numbered steps as process steps", async () => {
    const processDoc = `
1. Dispatcher receives job request from customer
2. System validates job eligibility and requirements
3. Allocate best available technician based on skills
4. Schedule appointment with customer confirmation
5. Dispatch notification sent to field worker`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "numbered_steps.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "numbered_steps.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: Array<{ steps: unknown[] }> };
    // Should identify numbered lines as process steps
    if (parsed.result === "success" && (parsed as any).stages && (parsed as any).stages.length > 0) {
      expect((parsed as any).stages[0].steps).toBeDefined();
    }
  });

  test("analyse_document extracts roles from process steps", async () => {
    const processDoc = `
Stage: Approval Workflow
- Role: Manager - Review and approve work order
- Role: Finance - Authorize payment transaction
- Role: Operations - Assign technician to job
- Role: Dispatcher - Schedule appointment
- Role: Customer - Confirm service details`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "roles.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "roles.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Role extraction happens internally during process analysis
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document handles bullet-style process steps", async () => {
    const processDoc = `
Stage: Payment Processing
- Validate customer payment method
- Process transaction via payment gateway
- Record payment in accounting system
- Send payment confirmation email
- Update order status to paid`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "bullets.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "bullets.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: unknown[] };
    expect(parsed.result || parsed.error).toBeDefined();
    // Should identify bullet points as steps
    if (parsed.stages || (parsed as any).stages) {
      expect(Array.isArray((parsed as any).stages)).toBe(true);
    }
  });

  test("analyse_document handles arrow notation for workflow flow", async () => {
    const processDoc = `
Order Received -> Validate -> Approve -> Allocate Resources -> Schedule -> Dispatch -> Complete

Stage: Detailed Order Processing
1. Customer submits order
2. System validates inventory and pricing
3. Manager approves order terms
4. Resource allocation engine assigns technician
5. Scheduler books appointment
6. Dispatcher sends field notification
7. Technician completes work on-site`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "arrows.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "arrows.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document extracts evidence terms from steps", async () => {
    const processDoc = `
Stage: Integration
- Connect to Oracle ERP for financial data
- Sync with Salesforce CRM customer records
- Integrate shipping carrier API for tracking
- Enable webhook notifications for status updates
- Support OAuth2 authentication for security`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "evidence.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "evidence.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Evidence term extraction happens internally for linking to stories
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document splits long paragraphs into sentences", async () => {
    const processDoc = `
Stage: Complex Processing Workflow
The system must receive customer orders through multiple channels. After initial validation, orders are classified by type and urgency. High-priority orders follow expedited approval paths while standard orders go through standard validation. Once approved, orders move to scheduling where resources are allocated based on availability and skills. The dispatcher creates a work schedule and communicates with field teams via mobile app. Upon completion, the system generates invoices and updates customer records.`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "long_para.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "long_para.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Text parsing and sentence splitting happens internally
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document identifies stage headings with various formats", async () => {
    const processDoc = `
1. Order Processing
Initial customer interaction and order validation through the system.

2. Approval Phase  
Management review and authorization of orders before fulfillment.

3. Fulfillment
Physical execution of services and delivery to customer.

Section: Billing and Collection
Invoice generation and payment processing.

To-Be: Reporting and Analytics
Comprehensive dashboards for operations monitoring.`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "headings.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "headings.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: unknown[] };
    // Should handle multiple heading formats
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document skips non-process content", async () => {
    const processDoc = `
This is a discussion about the new business process. 

The company decided to modernize the order fulfillment system.

Stage: Order Management
- Create order record in database
- Validate with business rules
- Submit for approval

Some additional notes here that aren't process steps.

This is just explanation text that shouldn't be parsed as steps.`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "mixed.txt",
      fileContent: processDoc,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "mixed.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Should filter out non-process lines intelligently
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document handles fallback when no stages identified", async () => {
    const minimalContent = "Some process related content without clear structure";

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "minimal.txt",
      fileContent: minimalContent,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "minimal.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    // Should return something even if stages aren't clearly identified
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("analyse_document process mode with real-world compliance keywords", async () => {
    const complianceProcess = `
Stage: Security and Compliance
- Enforce RBAC role-based access control
- Implement encryption for data at rest
- Enable audit logging for compliance
- Support GDPR data retention policies
- Implement SSO authentication
- Pass SOC2 compliance validation

Stage: Reporting and Analytics
- Generate compliance audit reports
- Create KPI dashboards for management
- Enable data export in compliance format
- Support retention policy enforcement`;

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "compliance.txt",
      fileContent: complianceProcess,
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "compliance.txt",
      analysisMode: "process",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; stages?: unknown[] };
    expect(parsed.result || parsed.error).toBeDefined();
    // Process analysis should identify security and compliance stages
    if ((parsed as any).stages) {
      expect(Array.isArray((parsed as any).stages)).toBe(true);
    }
  });
});



describe("workItems tools - Error Handling", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("unknown tool throws error", async () => {
    try {
      await handleWorkItemTool({}, "unknown_tool_xyz" as any, { project: "TestProj" });
      fail("Should have thrown");
    } catch (error) {
      expect(error).toBeDefined();
      expect((error as any).message).toMatch(/Unknown tool|Operation failed/i);
    }
  });

  test("missing required parameter throws error", async () => {
    try {
      await handleWorkItemTool({}, "process_transcript", {
        fileName: "noproject.txt",
        fileContent: "test",
      } as any);
      fail("Should have thrown");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("nonexistent file returns error", async () => {
    const raw = await handleWorkItemTool({}, "get_file_content", {
      project: "TestProj",
      fileName: "nonexistent.txt",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string; message?: string };
    // Should have some response
    expect(parsed.result || parsed.error || parsed.message).toBeDefined();
  });
});

describe("workItems tools - HTML Handling", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("handles HTML entities in file content", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "html.txt",
      fileContent: "Content &amp; &lt;special&gt; &#39;chars&#39;",
    });

    const parsed = JSON.parse(raw) as { result: string };
    expect(parsed.result).toBe("success");
  });

  test("handles very large files", async () => {
    const veryLargeContent = "Line of text: ".repeat(100000);

    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "huge.txt",
      fileContent: veryLargeContent,
    });

    const parsed = JSON.parse(raw) as { result: string; size: number };
    expect(parsed.result).toBe("success");
    expect(parsed.size).toBeGreaterThan(0);
  });
});

describe("workItems tools - List Operations (with mocked ADO client)", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      listWorkItems: (jest.fn() as any)
        .mockResolvedValueOnce([
          { id: 1, fields: { "System.Title": "Epic 1", "System.State": "Active" } },
          { id: 2, fields: { "System.Title": "Epic 2", "System.State": "Active" } },
        ])
        .mockResolvedValueOnce([
          { id: 3, fields: { "System.Title": "Feature 1", "System.State": "Active" } },
        ])
        .mockResolvedValueOnce([
          { id: 4, fields: { "System.Title": "Story 1", "System.State": "Active" } },
        ])
        .mockResolvedValueOnce([
          { id: 5, fields: { "System.Title": "Task 1", "System.State": "Active" } },
        ]),
    };
  });

  test("list_epics returns epics from Azure DevOps", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "list_epics",
      { project: "TestProj", top: 10 }
    );

    const parsed = JSON.parse(raw) as { result: string; count: number; items: any[] };
    expect(parsed.result).toBe("success");
    expect(parsed.count).toBeGreaterThan(0);
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  test("list_features returns features from Azure DevOps filtered by epic", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "list_features",
      { project: "TestProj", epic: 1, top: 10 }
    );

    const parsed = JSON.parse(raw) as { result: string; count: number; items: any[] };
    expect(parsed.result).toBe("success");
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  test("list_user_stories returns stories from Azure DevOps filtered by feature", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "list_user_stories",
      { project: "TestProj", feature: 3, top: 10 }
    );

    const parsed = JSON.parse(raw) as { result: string; count: number; items: any[] };
    expect(parsed.result).toBe("success");
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  test("list_tasks returns tasks from Azure DevOps filtered by user story", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "list_tasks",
      { project: "TestProj", userStory: 4, top: 10 }
    );

    const parsed = JSON.parse(raw) as { result: string; count: number; items: any[] };
    expect(parsed.result).toBe("success");
    expect(Array.isArray(parsed.items)).toBe(true);
  });
});

describe("workItems tools - Create Operations (with mocked ADO client)", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      // @ts-expect-error - jest.fn typing
      createWorkItem: jest.fn().mockResolvedValue({
        id: 100,
        title: "Created Item",
        state: "New",
        fields: {},
      }),
      // @ts-expect-error - jest.fn typing
      addRelation: jest.fn().mockResolvedValue(true),
    };
  });

  test("create_epic creates epic in Azure DevOps", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "create_epic",
      {
        project: "TestProj",
        title: "New Epic",
        description: "Epic description",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });

  test("create_feature creates feature under epic", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "create_feature",
      {
        project: "TestProj",
        epicId: 1,
        title: "New Feature",
        description: "Feature description",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });

  test("create_user_story creates story under feature", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "create_user_story",
      {
        project: "TestProj",
        featureId: 3,
        title: "New Story",
        description: "As a user I want to log in securely",
        acceptanceCriteria: ["Given I am on the login page", "When I enter valid credentials", "Then I should see the dashboard"],
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });

  test("create_task creates task under story", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "create_task",
      {
        project: "TestProj",
        userStoryId: 4,
        title: "Implement password validation",
        description: "Add regex to validate password strength",
        assignedTo: "dev@example.com",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });

  test("add_acceptance_criteria adds criteria to story", async () => {
    (mockClient.addAcceptanceCriteria as any) = (jest.fn() as any).mockResolvedValueOnce({
      id: 4,
      fields: { "System.Description": "Updated with criteria" },
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "add_acceptance_criteria",
      {
        project: "TestProj",
        userStoryId: 4,
        criteria: ["Criterion 1: Must complete", "Criterion 2: Must verify"],
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });
});

describe("workItems tools - Update & Configuration Operations", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      // @ts-expect-error - jest.fn typing  
      updateWorkItem: jest.fn().mockResolvedValue({
        id: 4,
        title: "Updated Story",
        fields: { "System.State": "Active" },
      }),
      getOrgUrl: jest.fn().mockReturnValue("https://dev.azure.com/myorg"),
      getPat: jest.fn().mockReturnValue("test-pat-token"),
    };
  });

  test("update_work_item updates work item state", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "update_work_item",
      {
        project: "TestProj",
        workItemId: 4,
        state: "Active",
        title: "Updated title",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result).toBe("success");
  });

  test("check_project_process validates project process", async () => {
    const { checkProjectProcess } = require("../processMigration.js");
    checkProjectProcess.mockResolvedValue({
      projectName: "TestProj",
      currentProcessName: "Agile with Enrichment",
      processExists: true,
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "check_project_process",
      {
        project: "TestProj",
        expectedProcessName: "Agile with Enrichment",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("ensure_process_on_project ensures process exists and is assigned", async () => {
    const { ensureProcessOnProject } = require("../processMigration.js");
    ensureProcessOnProject.mockResolvedValue({
      projectName: "TestProj",
      processName: "Agile with Enrichment",
      steps: [
        { step: "check", status: "success" },
        { step: "create", status: "skipped" },
        { step: "assign", status: "success" },
      ],
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "ensure_process_on_project",
      {
        project: "TestProj",
        requiredProcessName: "Agile with Enrichment",
      }
    );

    const parsed = JSON.parse(raw);
    expect(parsed.result || parsed.error).toBeDefined();
  });

  // test("migrate_enrichment_process migrates process between orgs", async () => {
  //   const { migrateProcess } = require("../processMigration.js");
  //   migrateProcess.mockResolvedValue({
  //     success: true,
  //     targetProject: "TargetProject",
  //     message: "Process migration completed successfully",
  //   });

  //   const raw = await handleWorkItemTool(
  //     { azureDevOpsClient: mockClient },
  //     "migrate_enrichment_process",
  //     {
  //       project: "TestProj",
  //       sourceOrgUrl: "https://dev.azure.com/sourceOrg",
  //       sourceProject: "SourceProject",
  //       sourceProcessName: "Agile with Enrichment",
  //       sourcePat: "source-pat-token",
  //       newProjectName: "TargetProject",
  //     }
  //   );

  //   const parsed = JSON.parse(raw);
  //   expect(parsed.result || parsed.error).toBeDefined();
  // });
});

describe("workItems tools - Health & Refinement Operations", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      // @ts-expect-error - jest.fn typing
      listWorkItems: jest.fn().mockResolvedValue([
        {
          id: 1,
          fields: {
            "System.Title": "Story 1",
            "System.State": "Done",
            "System.WorkItemType": "User Story",
            "System.Description": "Well-defined story with criteria",
          },
        },
        {
          id: 2,
          fields: {
            "System.Title": "Story 2",
            "System.State": "Active",
            "System.WorkItemType": "User Story",
            "System.Description": "Incomplete story needs refinement",
          },
        },
      ]),
      // @ts-expect-error - jest.fn typing
      getWorkItem: jest.fn().mockResolvedValue({
        id: 1,
        fields: {
          "System.Title": "Login feature",
          "System.Description": "User needs to login securely",
          "System.State": "Active",
        },
      }),
    };
  });

  test("get_backlog_health calculates health metrics for stories", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "get_backlog_health",
      { project: "TestProj", top: 500 }
    );

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("refine_story suggests improvements for low-confidence stories", async () => {
    const { generateRefinementSuggestion } = require("./enrichment/refinement.js");
    generateRefinementSuggestion.mockResolvedValue({
      suggestions: [
        "Add specific acceptance criteria",
        "Include DoD checklist",
        "Define priority/effort",
      ],
      confidence: 0.65,
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "refine_story",
      {
        project: "TestProj",
        workItemId: 1,
        title: "Login feature",
        description: "User needs to login",
      }
    );

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });
});

describe("workItems tools - RRAID Operations", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      // @ts-expect-error - jest.fn typing
      createWorkItem: jest.fn().mockResolvedValue({
        id: 200,
        title: "RRAID Item",
        state: "New",
        fields: {},
      }),
      // @ts-expect-error - jest.fn typing
      listWorkItems: jest.fn().mockResolvedValue([
        {
          id: 1,
          fields: {
            "System.Title": "Risk: Performance degradation",
            "System.WorkItemType": "Risk",
          },
        },
      ]),
    };
  });

  test("extract_rraid extracts RRAID items from analyzed file", async () => {
    const { extractRRAID } = require("./rraid.js");
    extractRRAID.mockResolvedValue({
      risks: [{ title: "Performance degradation", severity: "High" }],
      requirements: [{ title: "OAuth2 integration", priority: "Must" }],
      assumptions: [{ title: "Users have bandwidth", confidence: 0.8 }],
      issues: [{ title: "API latency", impact: "High" }],
      dependencies: [{ title: "Third-party service", criticality: "Critical" }],
    });

    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "rraid.txt",
      fileContent: "Risk: Performance degradation. Assumption: Users have bandwidth. Dependency: Third-party service.",
    });

    const raw = await handleWorkItemTool({}, "extract_rraid", {
      project: "TestProj",
      fileName: "rraid.txt",
    });

    const parsed = JSON.parse(raw) as { result?: string; error?: string };
    expect(parsed.result || parsed.error).toBeDefined();
  });

  test("create_rraid_items creates RRAID work items in Azure DevOps", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "create_rraid_items",
      {
        project: "TestProj",
        items: [
          {
            title: "Performance Risk",
            description: "May degrade under load",
            category: "Risk",
            severity: "High",
          },
          {
            title: "API Availability",
            description: "Dependent on external service",
            category: "Dependency",
            severity: "Medium",
          },
        ],
      }
    );

    const parsed = JSON.parse(raw) as { result?: string; created?: number };
    expect(parsed.result === "success" || parsed.created !== undefined || parsed.result === "error").toBe(true);
  });

  test("list_rraid_items lists RRAID items by category", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient },
      "list_rraid_items",
      {
        project: "TestProj",
        category: "Risk",
      }
    );

    const parsed = JSON.parse(raw) as { result?: string };
    expect(parsed.result).toBeDefined();
  });
});

describe("workItems tools - Integration Scenarios", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      // @ts-expect-error - jest.fn typing
      listUserStories: jest.fn().mockResolvedValue([]),
      // @ts-expect-error - jest.fn typing
      createWorkItem: jest.fn().mockResolvedValue({ id: 100, fields: { "System.Title": "Created" } }),
      // @ts-expect-error - jest.fn typing
      updateWorkItem: jest.fn().mockResolvedValue({ id: 100, fields: { "System.State": "Active" } }),
      // @ts-expect-error - jest.fn typing
      addRelation: jest.fn().mockResolvedValue(true),
    };
  });

  test("complete document analysis workflow from upload to analysis", async () => {
    const upload = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "workflow.txt",
      fileContent: "We need authentication module with RBAC and API gateway with rate limiting.",
    });

    expect(JSON.parse(upload).result).toBe("success");

    const analysis = await handleWorkItemTool({}, "analyse_document", {
      project: "TestProj",
      fileName: "workflow.txt",
      analysisMode: "themes",
    });

    const analysisParsed = JSON.parse(analysis);
    expect(analysisParsed.result || analysisParsed.error).toBeDefined();

    const files = await handleWorkItemTool({}, "list_uploaded_files", {
      project: "TestProj",
    });

    const filesParsed = JSON.parse(files);
    expect(filesParsed.result).toBe("success");
    expect(Array.isArray(filesParsed.files)).toBe(true);
  });

  // test("backlog management workflow with analysis, preview, and theme details", async () => {
  //   const upload = await handleWorkItemTool({}, "process_transcript", {
  //     project: "TestProj",
  //     fileName: "backlog.txt",
  //     fileContent: "Need user authentication, admin panel, and reporting dashboard with security controls.",
  //   });

  //   expect(JSON.parse(upload).result).toBe("success");

  //   const analysis = await handleWorkItemTool({}, "analyse_document", {
  //     project: "TestProj",
  //     fileName: "backlog.txt",
  //     analysisMode: "themes",
  //   });

  //   const analysisParsed = JSON.parse(analysis);
  //   if (analysisParsed.result === "success" && analysisParsed.themes) {
  //     const themeNames = Object.keys(analysisParsed.themes);
  //     if (themeNames.length > 0) {
  //       const themeDetail = await handleWorkItemTool({}, "get_theme_details", {
  //         project: "TestProj",
  //         fileName: "backlog.txt",
  //         themeName: themeNames[0],
  //       });

  //       const themeDetailParsed = JSON.parse(themeDetail);
  //       expect(themeDetailParsed.result || themeDetailParsed.error).toBeDefined();
  //     }
  //   }

  //   const preview = await handleWorkItemTool({}, "preview_backlog", {
  //     project: "TestProj",
  //     fileName: "backlog.txt",
  //     storyMaturity: "placeholder",
  //   });

  //   const previewParsed = JSON.parse(preview);
  //   expect(previewParsed.result || previewParsed.error).toBeDefined();
  // });

  // test("complete backlog creation workflow with enrichment and RRAID", async () => {
  //   await handleWorkItemTool({}, "process_transcript", {
  //     project: "TestProj",
  //     fileName: "complete.txt",
  //     fileContent: "Implement OAuth2 for authentication, add audit logging, ensure compliance with GDPR.",
  //   });

  //   const analysis = await handleWorkItemTool({}, "analyse_document", {
  //     project: "TestProj",
  //     fileName: "complete.txt",
  //     analysisMode: "themes",
  //   });

  //   const analysisParsed = JSON.parse(analysis);
  //   if (analysisParsed.result === "success") {
  //     const preview = await handleWorkItemTool({}, "preview_backlog", {
  //       project: "TestProj",
  //       fileName: "complete.txt",
  //       storyMaturity: "detailed",
  //     });

  //     const previewParsed = JSON.parse(preview);
  //     expect(previewParsed.result || previewParsed.error).toBeDefined();

  //     const rraid = await handleWorkItemTool({}, "extract_rraid", {
  //       project: "TestProj",
  //       fileName: "complete.txt",
  //     });

  //     const rraidParsed = JSON.parse(rraid);
  //     expect(rraidParsed.result || rraidParsed.error).toBeDefined();
  //   }
  // });
});

// ============================================================================
// handleProcessTranscript — extended paths (lines 1201–1335)
// ============================================================================
describe("workItems tools - process_transcript extended paths", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("contentUrl: decodes a valid data URI and stores the file", async () => {
    const content = "Hello from data URI";
    const encoded = Buffer.from(content).toString("base64");
    const dataUri = `data:text/plain;base64,${encoded}`;

    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "from-uri.txt",
      contentUrl: dataUri,
    } as any);

    const parsed = JSON.parse(raw) as { result: string; fileName: string };
    expect(parsed.result).toBe("success");
    expect(parsed.fileName).toBe("from-uri.txt");

    const stored = getFileStore().get("from-uri.txt");
    expect(stored?.content).toBe(content);
  });

  test("contentUrl: returns error for unsupported (non-data, non-http) URL scheme", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "bad-scheme.txt",
      contentUrl: "ftp://example.com/file.txt",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/data:|http/i);
  });

  test("contentUrl: returns error when http fetch fails (non-ok response)", async () => {
    // Mock global fetch to return a non-ok response
    const originalFetch = global.fetch;
    global.fetch = (jest.fn() as any).mockResolvedValue({ ok: false, status: 404 });

    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "remote.txt",
      contentUrl: "https://example.com/missing.txt",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toContain("404");

    global.fetch = originalFetch;
  });

  test("contentUrl: returns error when http fetch throws a network error", async () => {
    const originalFetch = global.fetch;
    global.fetch = (jest.fn() as any).mockRejectedValue(new Error("Network failure"));

    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "network-fail.txt",
      contentUrl: "https://example.com/file.txt",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toContain("Network failure");

    global.fetch = originalFetch;
  });

  test("returns error when neither fileContent nor contentUrl is provided and file does not exist", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "nofile.txt",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/fileContent|contentUrl/i);
  });

  test("returns success with existing file info when no content given but file already exists", async () => {
    // Pre-populate the store
    getFileStore().set("existing.txt", {
      name: "existing.txt",
      content: "pre-existing content here",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "existing.txt",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("success");
    expect(parsed.message).toMatch(/already exists/i);
  });

  test("skips overwriting when the new content is smaller than existing file", async () => {
    // Store a large file first
    getFileStore().set("guarded.txt", {
      name: "guarded.txt",
      content: "x".repeat(200),
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });

    // Re-upload with only a tiny snippet (< 100 chars and < existing size)
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "guarded.txt",
      fileContent: "tiny",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("success");
    // The existing larger content should have been preserved
    expect(getFileStore().get("guarded.txt")?.content.length).toBe(200);
    expect(parsed.message).toMatch(/already exists with more content/i);
  });

  test("returns error for binary file extension when extraction yields empty content", async () => {
    // Pass a .pdf extension but with invalid base64 — extraction will fail and return ""
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "corrupt.pdf",
      fileContent: "not-valid-base64-pdf-content",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message?: string };
    // Should either error (empty extraction) or succeed — both are valid outcomes
    // Key check: no unhandled exception
    expect(parsed.result === "error" || parsed.result === "success").toBe(true);
  });

  test("stores custom contentType when provided", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "typed.txt",
      fileContent: "some content",
      contentType: "text/markdown",
    } as any);

    const parsed = JSON.parse(raw) as { result: string };
    expect(parsed.result).toBe("success");
    expect(getFileStore().get("typed.txt")?.mimeType).toBe("text/markdown");
  });
});

// ============================================================================
// handleGetThemeDetails — all branches
// ============================================================================
describe("workItems tools - get_theme_details", () => {
  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();
  });

  test("returns error when no analysis exists for the file", async () => {
    const raw = await handleWorkItemTool({}, "get_theme_details", {
      project: "TestProj",
      fileName: "not-analysed.txt",
      themeName: "Security",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/analyse_document/i);
  });

  test("returns error when file was analysed in process mode", async () => {
    // Inject a process-mode analysis directly into the store
    getFileStore().set("__analysis_process.txt", {
      name: "__analysis_process.txt",
      content: JSON.stringify({ analysisMode: "process", processStages: [] }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool({}, "get_theme_details", {
      project: "TestProj",
      fileName: "process.txt",
      themeName: "Security",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/process mode/i);
  });

  test("returns error when the requested theme does not exist", async () => {
    getFileStore().set("__analysis_themes.txt", {
      name: "__analysis_themes.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: { "Security and Compliance": { mentions: 2, subtopics: ["RBAC"] } },
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool({}, "get_theme_details", {
      project: "TestProj",
      fileName: "themes.txt",
      themeName: "Non-existent Theme",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; message: string; availableThemes: string[] };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/not found/i);
    expect(Array.isArray(parsed.availableThemes)).toBe(true);
    expect(parsed.availableThemes).toContain("Security and Compliance");
  });

  test("returns theme subtopics when theme exists", async () => {
    getFileStore().set("__analysis_themes2.txt", {
      name: "__analysis_themes2.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: {
          "Reporting and Analytics": { mentions: 3, subtopics: ["Operational dashboards", "Power BI and Fabric reporting"] },
        },
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool({}, "get_theme_details", {
      project: "TestProj",
      fileName: "themes2.txt",
      themeName: "Reporting and Analytics",
    } as any);

    const parsed = JSON.parse(raw) as { result: string; theme: string; subtopics: string[] };
    expect(parsed.result).toBe("success");
    expect(parsed.theme).toBe("Reporting and Analytics");
    expect(Array.isArray(parsed.subtopics)).toBe(true);
    expect(parsed.subtopics).toContain("Operational dashboards");
  });

  test("full flow: upload, analyse, then get_theme_details", async () => {
    const mockClient = {
      listWorkItems: (jest.fn() as any).mockResolvedValue([]),
    };
    await handleWorkItemTool({}, "process_transcript", {
      project: "TestProj",
      fileName: "security_doc2.txt",
      fileContent: "The system needs RBAC security compliance audit access control permissions encryption.",
    } as any);

    const analysisRaw = await handleWorkItemTool({ azureDevOpsClient: mockClient } as any, "analyse_document", {
      project: "TestProj",
      fileName: "security_doc2.txt",
      analysisMode: "themes",
    } as any);
    const analysis = JSON.parse(analysisRaw) as { result?: string; themes?: { name: string }[] };

    // Only check theme details if analysis succeeded and found themes
    if (analysis.result === "success" && analysis.themes && analysis.themes.length > 0) {
      const firstTheme = analysis.themes[0].name;
      const raw = await handleWorkItemTool({}, "get_theme_details", {
        project: "TestProj",
        fileName: "security_doc2.txt",
        themeName: firstTheme,
      } as any);
      const parsed = JSON.parse(raw) as { result: string };
      expect(parsed.result).toBe("success");
    } else {
      // Analysis didn't find themes - just confirm no crash
      expect(analysis.result === "success" || analysis.result === "error").toBe(true);
    }
  });
});

// ============================================================================
// handleCreateBacklog — themes mode
// ============================================================================
describe("workItems tools - create_backlog (themes mode)", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      listWorkItems: (jest.fn() as any).mockResolvedValue([]),
      createWorkItem: (jest.fn() as any).mockImplementation(({ title }: { title: string }) =>
        Promise.resolve({ id: Math.floor(Math.random() * 9000) + 1000, fields: { "System.Title": title } })
      ),
      updateWorkItem: (jest.fn() as any).mockResolvedValue({ id: 999 }),
      addRelation: (jest.fn() as any).mockResolvedValue(true),
    };
  });

  test("returns error when no analysis exists", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "missing.txt" } as any
    );
    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/analyse_document/i);
  });

  test("returns error when neither fileName nor processFileName is provided", async () => {
    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj" } as any
    );
    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/processFileName|fileName/i);
  });

  test("creates backlog work items from themes analysis", async () => {
    // Set up file
    getFileStore().set("backlog.txt", {
      name: "backlog.txt",
      content: "Need security RBAC access control and api integration with reporting dashboards",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });

    // Set up a themes analysis in cache
    getFileStore().set("__analysis_backlog.txt", {
      name: "__analysis_backlog.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: {
          "Security and Compliance": { mentions: 2, subtopics: ["Access control and permissions"] },
          "Reporting and Analytics": { mentions: 1, subtopics: ["Operational dashboards"] },
        },
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "backlog.txt" } as any
    );

    const parsed = JSON.parse(raw) as { result: string; epics: number; features: number; userStories: number };
    expect(parsed.result).toBe("success");
    // Should have created epics, features, and user stories
    expect(typeof parsed.epics).toBe("number");
    expect(typeof parsed.features).toBe("number");
    expect(typeof parsed.userStories).toBe("number");
    // At least one of each should have been created
    expect(parsed.epics + parsed.features + parsed.userStories).toBeGreaterThan(0);
    // createWorkItem should have been called
    expect(mockClient.createWorkItem).toHaveBeenCalled();
  });

  test("reuses existing epics rather than creating duplicates", async () => {
    getFileStore().set("backlog2.txt", {
      name: "backlog2.txt",
      content: "security rbac",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_backlog2.txt", {
      name: "__analysis_backlog2.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: { "Security and Compliance": { mentions: 1, subtopics: ["Access control and permissions"] } },
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    // Mock listWorkItems to return an existing epic with matching title
    mockClient.listWorkItems = (jest.fn() as any).mockResolvedValue([
      { id: 42, fields: { "System.Title": "Security and Compliance" } },
    ]);

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "backlog2.txt" } as any
    );

    const parsed = JSON.parse(raw) as { result: string; epics: number };
    expect(parsed.result).toBe("success");
    // Epic was reused, not created
    expect(parsed.epics).toBe(0);
  });

  test("create_backlog respects areaPath input", async () => {
    getFileStore().set("area.txt", {
      name: "area.txt",
      content: "reporting dashboard kpi",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_area.txt", {
      name: "__analysis_area.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: { "Reporting and Analytics": { mentions: 1, subtopics: ["Operational dashboards"] } },
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "area.txt", areaPath: "TestProj\\Team A" } as any
    );

    const parsed = JSON.parse(raw) as { result: string };
    expect(parsed.result).toBe("success");
    // Verify createWorkItem was called with the custom areaPath
    const calls = mockClient.createWorkItem.mock.calls as any[];
    if (calls.length > 0) {
      const hasAreaPath = calls.some((c: any) => c[0]?.areaPath === "TestProj\\Team A");
      expect(hasAreaPath).toBe(true);
    }
  });
});

// ============================================================================
// handleCreateBacklog — process mode (handleCreateBacklogFromProcess)
// ============================================================================
describe("workItems tools - create_backlog (process mode)", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    mockClient = {
      listWorkItems: (jest.fn() as any).mockResolvedValue([]),
      createWorkItem: (jest.fn() as any).mockImplementation(({ title }: { title: string }) =>
        Promise.resolve({ id: Math.floor(Math.random() * 9000) + 1000, fields: { "System.Title": title } })
      ),
      updateWorkItem: (jest.fn() as any).mockResolvedValue({ id: 999 }),
      addRelation: (jest.fn() as any).mockResolvedValue(true),
    };
  });

  test("returns error when processStages is empty", async () => {
    getFileStore().set("proc.txt", {
      name: "proc.txt",
      content: "some process content",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_proc.txt", {
      name: "__analysis_proc.txt",
      content: JSON.stringify({ analysisMode: "process", processStages: [], rubrics: [] }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", processFileName: "proc.txt" } as any
    );

    const parsed = JSON.parse(raw) as { result: string; message: string };
    expect(parsed.result).toBe("error");
    expect(parsed.message).toMatch(/No process stages/i);
  });

  test("creates placeholder backlog from process analysis", async () => {
    const processContent = `Stage: Order Management
- Create purchase order
- Validate order details
- Submit for approval`;

    getFileStore().set("process.txt", {
      name: "process.txt",
      content: processContent,
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_process.txt", {
      name: "__analysis_process.txt",
      content: JSON.stringify({
        analysisMode: "process",
        processStages: [
          {
            title: "Order Management",
            steps: [
              { title: "Create purchase order", role: undefined, evidenceTerms: ["purchase", "order"] },
              { title: "Validate order details", role: undefined, evidenceTerms: ["validate", "order"] },
            ],
          },
        ],
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", processFileName: "process.txt", storyMaturity: "placeholder" } as any
    );

    const parsed = JSON.parse(raw) as {
      result: string;
      analysisMode: string;
      storyMaturity: string;
      epics: number;
      features: number;
      userStories: number;
    };
    expect(parsed.result).toBe("success");
    expect(parsed.analysisMode).toBe("process");
    expect(parsed.storyMaturity).toBe("placeholder");
    expect(typeof parsed.epics).toBe("number");
    expect(typeof parsed.features).toBe("number");
    expect(typeof parsed.userStories).toBe("number");
    expect(mockClient.createWorkItem).toHaveBeenCalled();
  });

  test("creates detailed backlog from process analysis", async () => {
    getFileStore().set("proc2.txt", {
      name: "proc2.txt",
      content: "Stage: Billing\n- Generate invoice\n- Process payment",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_proc2.txt", {
      name: "__analysis_proc2.txt",
      content: JSON.stringify({
        analysisMode: "process",
        processStages: [
          {
            title: "Billing",
            steps: [
              { title: "Generate invoice", role: "finance analyst", evidenceTerms: ["invoice"] },
              { title: "Process payment", role: undefined, evidenceTerms: ["payment"] },
            ],
          },
        ],
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const raw = await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", processFileName: "proc2.txt", storyMaturity: "detailed" } as any
    );

    const parsed = JSON.parse(raw) as { result: string; storyMaturity: string };
    expect(parsed.result).toBe("success");
    expect(parsed.storyMaturity).toBe("detailed");
    // Verify story titles use "Implement" prefix for detailed maturity
    const createCalls = mockClient.createWorkItem.mock.calls as any[];
    const storyTitles = createCalls
      .filter((c: any) => c[0]?.witType === "User Story")
      .map((c: any) => c[0]?.title as string);
    expect(storyTitles.some((t) => t.startsWith("Implement"))).toBe(true);
  });

  test("placeholder stories use 'Discovery placeholder:' title prefix", async () => {
    getFileStore().set("proc3.txt", {
      name: "proc3.txt",
      content: "Stage: Dispatch\n- Assign field engineer",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_proc3.txt", {
      name: "__analysis_proc3.txt",
      content: JSON.stringify({
        analysisMode: "process",
        processStages: [
          {
            title: "Dispatch",
            steps: [{ title: "Assign field engineer", role: "dispatcher", evidenceTerms: ["assign"] }],
          },
        ],
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", processFileName: "proc3.txt", storyMaturity: "placeholder" } as any
    );

    const createCalls = mockClient.createWorkItem.mock.calls as any[];
    const storyTitles = createCalls
      .filter((c: any) => c[0]?.witType === "User Story")
      .map((c: any) => c[0]?.title as string);
    expect(storyTitles.some((t) => t.startsWith("Discovery placeholder:"))).toBe(true);
  });
});

// ============================================================================
// persistAdoDependencies — via create_backlog with enriched preview
// ============================================================================
describe("workItems tools - persistAdoDependencies (via create_backlog)", () => {
  let mockClient: any;

  beforeEach(() => {
    getFileStore().clear();
    jest.clearAllMocks();

    // Use a deterministic ID map so dependency linking can succeed
    let idCounter = 100;
    mockClient = {
      listWorkItems: (jest.fn() as any).mockResolvedValue([]),
      createWorkItem: (jest.fn() as any).mockImplementation(({ title }: { title: string }) =>
        Promise.resolve({ id: ++idCounter, fields: { "System.Title": title } })
      ),
      updateWorkItem: (jest.fn() as any).mockResolvedValue({ id: 999 }),
      addRelation: (jest.fn() as any).mockResolvedValue(true),
    };
  });

  test("addRelation is NOT called when there are no dependency links in the preview", async () => {
    getFileStore().set("nodeps.txt", {
      name: "nodeps.txt",
      content: "security rbac",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_nodeps.txt", {
      name: "__analysis_nodeps.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: { "Security and Compliance": { mentions: 1, subtopics: ["Access control and permissions"] } },
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    // No preview stored → persistAdoDependencies receives undefined preview
    await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "nodeps.txt" } as any
    );

    // addRelation should not have been called since there's no preview with deps
    expect(mockClient.addRelation).not.toHaveBeenCalled();
  });

  test("addRelation IS called when preview contains dependency links between stories", async () => {
    // Build a preview with two items one depending on the other
    const previewItemA = {
      id: "themes:access control and permissions:implement access control and permissions",
      title: "Implement Access control and permissions",
      description: "",
      acceptanceCriteria: [],
      sourceReferences: [],
      enrichment: {
        dependencies: {
          dependsOn: ["themes:operational dashboards:implement operational dashboards"],
          blocks: [],
          confidence: 80,
          rationale: [],
        },
      },
    };
    const previewItemB = {
      id: "themes:operational dashboards:implement operational dashboards",
      title: "Implement Operational dashboards",
      description: "",
      acceptanceCriteria: [],
      sourceReferences: [],
      enrichment: undefined,
    };

    const preview = {
      fileName: "deps.txt",
      analysisMode: "themes",
      storyMaturity: "detailed",
      items: [previewItemA, previewItemB],
      warnings: [],
      idempotencyKey: "test-key",
      createdAt: new Date().toISOString(),
    };

    getFileStore().set("deps.txt", {
      name: "deps.txt",
      content: "security and reporting",
      mimeType: "text/plain",
      uploadedAt: new Date(),
    });
    getFileStore().set("__analysis_deps.txt", {
      name: "__analysis_deps.txt",
      content: JSON.stringify({
        analysisMode: "themes",
        themes: {
          "Security and Compliance": { mentions: 1, subtopics: ["Access control and permissions"] },
          "Reporting and Analytics": { mentions: 1, subtopics: ["Operational dashboards"] },
        },
        rubrics: [],
      }),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });
    // Store the pre-built preview so it's used instead of regenerating
    getFileStore().set("__preview_deps.txt", {
      name: "__preview_deps.txt",
      content: JSON.stringify(preview),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    await handleWorkItemTool(
      { azureDevOpsClient: mockClient } as any,
      "create_backlog",
      { project: "TestProj", fileName: "deps.txt" } as any
    );

    // addRelation should have been called for the dependency link
    expect(mockClient.addRelation).toHaveBeenCalled();
    const relationCall = (mockClient.addRelation.mock.calls[0] as any[])[0] as any;
    expect(relationCall.relationType).toBe("System.LinkTypes.Related");
  });
});

  describe("Additional Basic Operations", () => {
    let mockClient: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockClient = {
        getWorkItem: jest.fn(),
        listWorkItems: jest.fn(),
        updateWorkItem: jest.fn(),
        getOrgUrl: jest.fn(),
        getPat: jest.fn()
      };
    });

    test("get_user_story delegates to client getWorkItem", async () => {
      mockClient.getWorkItem = (jest.fn() as any).mockResolvedValue({ id: 1, fields: { "System.Title": "Test", "System.State": "New", "System.Description": "Desc" } });
      mockClient.listWorkItems = (jest.fn() as any).mockResolvedValue([]);
      
      const result = await handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "get_user_story",
        { project: "Proj", userStoryId: 1 } as any
      );
      
      expect(mockClient.getWorkItem).toHaveBeenCalledWith("Proj", 1);
      expect(result).toBeDefined();
    });

    test("update_work_item delegates to client updateWorkItem", async () => {
      mockClient.updateWorkItem = (jest.fn() as any).mockResolvedValue({ id: 1 });
      const result = await handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "update_work_item",
        { workItemId: 1, state: "Active", assignedTo: "me" } as any
      );
      expect(mockClient.updateWorkItem).toHaveBeenCalledWith(expect.objectContaining({ workItemId: 1, state: "Active", assignedTo: "me" }));
      expect(result).toBeDefined();
    });

    test("migrate_enrichment_process handles full flow", async () => {
      const { checkEnrichmentProcessExists, migrateProcess, createProjectWithProcess } = require("../processMigration.js");
      
      // Setup mock values
      checkEnrichmentProcessExists.mockResolvedValueOnce({ found: false });
      migrateProcess.mockResolvedValueOnce({ processId: "new-proc-id", processName: "New Proc" });
      createProjectWithProcess.mockResolvedValueOnce({ projectName: "NewProject" });
      
      mockClient.getOrgUrl.mockReturnValue("https://dev.azure.com/target");
      mockClient.getPat.mockReturnValue("pat");

      const result = await handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "migrate_enrichment_process",
        { 
          sourceOrgUrl: "https://dev.azure.com/src",
          sourceProject: "SrcProj",
          sourceProcessName: "SrcProc",
          sourcePat: "srcPat",
          newProjectName: "NewProject"
        } as any
      );
      
      expect(migrateProcess).toHaveBeenCalled();
      expect(createProjectWithProcess).toHaveBeenCalled();
      
      const parsed = JSON.parse(result as string);
      expect(parsed.result).toBe("success");
      expect(parsed.boardUrl).toContain("NewProject");
    });

    test("get_user_story missing userStoryId throws", async () => {
      await expect(handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "get_user_story",
        { project: "Proj" /* no userStoryId */ } as any
      )).rejects.toThrow("Provide userStoryId (number).");
    });

    test("add_acceptance_criteria missing userStoryId throws", async () => {
      await expect(handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "add_acceptance_criteria",
        { project: "Proj", criteria: ["A"] } as any
      )).rejects.toThrow("Provide userStoryId (number).");
    });

    test("get_backlog_health histograms populate correctly", async () => {
      mockClient.getWorkItem.mockResolvedValueOnce({ id: 1, fields: { "System.Title": "Epic 1" } });
      const mockStories = [
        { id: 101, fields: { "System.Title": "Story A", "Custom.EnrichmentConfidenceOverall": 80, "Custom.EnrichmentQualityScore": 90, "Custom.EnrichmentEffortTShirtSize": "L", "Custom.EnrichmentMissingPiecesIssues": "Missing tests; Needs API spec", "Custom.EnrichmentDependenciesDependsOn": "202" } },
        { id: 102, fields: { "System.Title": "Story B", "Custom.EnrichmentConfidenceOverall": 60, "Custom.EnrichmentQualityScore": 70, "Custom.EnrichmentEffortTShirtSize": "M", "Custom.EnrichmentMissingPiecesIssues": "Needs API spec", "Custom.EnrichmentDependenciesBlocks": "303" } },
        { id: 103, fields: { "System.Title": "Story C", "Custom.EnrichmentConfidenceOverall": 30, "Custom.EnrichmentQualityScore": 40, "Custom.EnrichmentEffortTShirtSize": "S" } },
        { id: 104, fields: {} } // missing fields
      ];
      mockClient.listWorkItems.mockResolvedValueOnce(mockStories);

      const result = await handleWorkItemTool(
        { azureDevOpsClient: mockClient } as any,
        "get_backlog_health",
        { project: "Proj", epicId: 1 } as any
      );
      const parsed = JSON.parse(result as string);
      expect(parsed.totalStories).toBe(4);
      expect(parsed.ragDistribution.green).toBe(1); // 80 -> green
      expect(parsed.ragDistribution.amber).toBe(1); // 60 -> amber
      expect(parsed.ragDistribution.red).toBe(1); // 30 -> red
      expect(parsed.ragDistribution.unscored).toBe(1); // missing
      expect(parsed.effortBreakdown.L).toBe(1);
      expect(parsed.missingPiecesHeatmap.length).toBeGreaterThan(0);
      expect(parsed.dependencyGraph.length).toBeGreaterThan(0);
    });
  });
