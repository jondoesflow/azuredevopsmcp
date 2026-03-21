import { getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";
import { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi.js";
import { TeamContext } from "azure-devops-node-api/interfaces/CoreInterfaces.js";
import { JsonPatchOperation, Operation } from "azure-devops-node-api/interfaces/common/VSSInterfaces.js";
import { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import { Config } from "./config.js";
import { logger } from "./logger.js";

export interface WorkItemInput {
  project: string;
  witType: string;
  title: string;
  description?: string;
  iterationPath?: string;
  areaPath?: string;
  state?: string;
  assignedTo?: string;
  parentId?: number;
  acceptanceCriteria?: string[];
  priority?: number;
  tags?: string;
  moscow?: string;
  customFields?: Record<string, string | number | boolean>;
}

export interface WorkItemFilter {
  project: string;
  witType: string;
  state?: string;
  assignedTo?: string;
  parentId?: number;
  top?: number;
}

export interface WorkItemUpdate {
  project: string;
  workItemId: number;
  title?: string;
  state?: string;
  assignedTo?: string;
  description?: string;
  iterationPath?: string;
  areaPath?: string;
  acceptanceCriteria?: string[];
  moscow?: string;
  tags?: string;
  customFields?: Record<string, string | number | boolean>;
}

export interface WorkItemRelationInput {
  project: string;
  sourceWorkItemId: number;
  targetWorkItemId: number;
  relationType?: string;
}

export class AzureDevOpsClient {
  private readonly webApi: WebApi;
  private witApi: IWorkItemTrackingApi | null = null;

  constructor(config: Config) {
    if (!config.azureDevOps) {
      throw new Error("Azure DevOps is not configured. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT, and AZURE_DEVOPS_URL.");
    }

    const authHandler = getPersonalAccessTokenHandler(config.azureDevOps.pat);
    this.webApi = new WebApi(config.azureDevOps.url, authHandler);
    logger.info("Azure DevOps client initialized", {
      org: config.azureDevOps.org,
      url: config.azureDevOps.url,
    });
  }

  private async getWitApi(): Promise<IWorkItemTrackingApi> {
    if (!this.witApi) {
      this.witApi = await this.webApi.getWorkItemTrackingApi();
    }
    return this.witApi;
  }

  async createWorkItem(input: WorkItemInput): Promise<WorkItem> {
    logger.info("Creating work item", { type: input.witType, title: input.title, project: input.project });
    
    try {
      const witApi = await this.getWitApi();
      const patchDocument: JsonPatchOperation[] = [];

      // Add fields
      patchDocument.push({
        op: Operation.Add,
        path: "/fields/System.Title",
        value: input.title,
      });

      if (input.description) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.Description",
          value: input.description,
        });
      }

      if (input.iterationPath) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.IterationPath",
          value: input.iterationPath,
        });
      }

      if (input.areaPath) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.AreaPath",
          value: input.areaPath,
        });
      }

      if (input.assignedTo) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.AssignedTo",
          value: input.assignedTo,
        });
      }

      if (input.state) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.State",
          value: input.state,
        });
      }

      // Add parent link if this is a child work item
      if (input.parentId) {
        const serverUrl = (this.webApi as unknown as { serverUrl: string }).serverUrl;
        patchDocument.push({
          op: Operation.Add,
          path: `/relations/-`,
          value: {
            rel: "System.LinkTypes.Hierarchy-reverse",
            url: `${serverUrl}_apis/wit/workItems/${input.parentId}`,
          },
        });
      }

      // Add acceptance criteria for user stories
      if (input.witType === "User Story" && input.acceptanceCriteria && input.acceptanceCriteria.length > 0) {
        const criteriaText = input.acceptanceCriteria.map((c) => `${c}<br/>`).join("");
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: criteriaText,
        });
      }

      if (input.priority) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/Microsoft.VSTS.Common.Priority",
          value: input.priority,
        });
      }

      if (input.tags) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/System.Tags",
          value: input.tags,
        });
      }

      if (input.moscow) {
        patchDocument.push({
          op: Operation.Add,
          path: "/fields/Custom.MoSCoW",
          value: input.moscow,
        });
      }

      if (input.customFields) {
        for (const [fieldName, fieldValue] of Object.entries(input.customFields)) {
          patchDocument.push({
            op: Operation.Add,
            path: `/fields/${fieldName}`,
            value: fieldValue,
          });
        }
      }

      try {
        const workItem = await witApi.createWorkItem(
          null,
          patchDocument,
          input.project,
          input.witType,
          false,
          false
        );

        logger.info("Work item created successfully", { id: workItem.id });
        return workItem;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isIterationPathError = message.includes("System.IterationPath") && message.includes("Invalid tree name");
        const hasIterationPath = patchDocument.some((op) => op.path === "/fields/System.IterationPath");

        if (!isIterationPathError || !hasIterationPath) {
          throw error;
        }

        logger.warn("Invalid iteration path, retrying work item creation without System.IterationPath", {
          project: input.project,
          type: input.witType,
          title: input.title,
          iterationPath: input.iterationPath,
        });

        const fallbackPatchDocument = patchDocument.filter((op) => op.path !== "/fields/System.IterationPath");
        const workItem = await witApi.createWorkItem(
          null,
          fallbackPatchDocument,
          input.project,
          input.witType,
          false,
          false
        );

        logger.info("Work item created successfully using fallback without iteration path", { id: workItem.id });
        return workItem;
      }
    } catch (error) {
      logger.error("Failed to create work item", error);
      throw error;
    }
  }

  async getWorkItem(project: string, workItemId: number): Promise<WorkItem> {
    logger.info("Fetching work item", { project, id: workItemId });
    
    try {
      const witApi = await this.getWitApi();
      const workItem = await witApi.getWorkItem(workItemId, [project]);
      logger.info("Work item fetched successfully", { id: workItem.id });
      return workItem;
    } catch (error) {
      logger.error("Failed to fetch work item", error);
      throw error;
    }
  }

  async listWorkItems(filter: WorkItemFilter): Promise<WorkItem[]> {
    logger.info("Listing work items", { project: filter.project, type: filter.witType });

    try {
      const witApi = await this.getWitApi();

      // Sanitize string values to prevent WIQL injection (escape single quotes)
      const sanitizeWiql = (value: string): string => value.replace(/'/g, "''");

      // Build WIQL query using sanitized values
      let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.WorkItemType], [System.Description] FROM WorkItems WHERE [System.TeamProject] = '${sanitizeWiql(filter.project)}' AND [System.WorkItemType] = '${sanitizeWiql(filter.witType)}'`;

      if (filter.state) {
        wiql += ` AND [System.State] = '${sanitizeWiql(filter.state)}'`;
      }

      if (filter.assignedTo) {
        wiql += ` AND [System.AssignedTo] = '${sanitizeWiql(filter.assignedTo)}'`;
      }

      // For child items, filter by parent (coerce to integer to prevent injection)
      if (filter.parentId) {
        const parentId = Math.trunc(Number(filter.parentId));
        if (!Number.isFinite(parentId) || parentId <= 0) {
          throw new Error("Invalid parentId");
        }
        wiql += ` AND [System.Parent] = ${parentId}`;
      }

      wiql += " ORDER BY [System.Id] DESC";

      const teamContext: TeamContext = { project: filter.project };
      const queryResult = await witApi.queryByWiql({ query: wiql }, teamContext);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        logger.info("No work items found", { project: filter.project, type: filter.witType });
        return [];
      }

      const ids = queryResult.workItems.map((w) => w.id).filter((id): id is number => id !== undefined);
      const top = Math.min(filter.top || 50, ids.length);
      const idsToFetch = ids.slice(0, top);

      if (idsToFetch.length === 0) {
        return [];
      }

      const workItems = await witApi.getWorkItems(
        idsToFetch,
        undefined,
        undefined,
        undefined,
        undefined,
        filter.project
      );

      logger.info("Work items listed successfully", { count: workItems.length });
      return workItems;
    } catch (error) {
      logger.error("Failed to list work items", error);
      throw error;
    }
  }

  async updateWorkItem(update: WorkItemUpdate): Promise<WorkItem> {
    logger.info("Updating work item", { project: update.project, id: update.workItemId });
    
    try {
      const witApi = await this.getWitApi();
      const patchDocument: JsonPatchOperation[] = [];

      if (update.title) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.Title",
          value: update.title,
        });
      }

      if (update.state) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.State",
          value: update.state,
        });
      }

      if (update.assignedTo) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.AssignedTo",
          value: update.assignedTo,
        });
      }

      if (update.description) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.Description",
          value: update.description,
        });
      }

      if (update.iterationPath) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.IterationPath",
          value: update.iterationPath,
        });
      }

      if (update.areaPath) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.AreaPath",
          value: update.areaPath,
        });
      }

      if (update.acceptanceCriteria && update.acceptanceCriteria.length > 0) {
        const criteriaText = update.acceptanceCriteria.map((c) => `${c}<br/>`).join("");
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: criteriaText,
        });
      }

      if (update.moscow) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/Custom.MoSCoW",
          value: update.moscow,
        });
      }

      if (update.tags) {
        patchDocument.push({
          op: Operation.Replace,
          path: "/fields/System.Tags",
          value: update.tags,
        });
      }

      if (update.customFields) {
        for (const [fieldName, fieldValue] of Object.entries(update.customFields)) {
          patchDocument.push({
            op: Operation.Replace,
            path: `/fields/${fieldName}`,
            value: fieldValue,
          });
        }
      }

      if (patchDocument.length === 0) {
        throw new Error("No fields to update");
      }

      try {
        const workItem = await witApi.updateWorkItem(
          null,
          patchDocument,
          update.workItemId,
          update.project,
          false
        );

        logger.info("Work item updated successfully", { id: workItem.id });
        return workItem;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isIterationPathError = message.includes("System.IterationPath") && message.includes("Invalid tree name");
        const hasIterationPath = patchDocument.some((op) => op.path === "/fields/System.IterationPath");

        if (!isIterationPathError || !hasIterationPath) {
          throw error;
        }

        logger.warn("Invalid iteration path, retrying work item update without System.IterationPath", {
          project: update.project,
          workItemId: update.workItemId,
          iterationPath: update.iterationPath,
        });

        const fallbackPatchDocument = patchDocument.filter((op) => op.path !== "/fields/System.IterationPath");
        const workItem = await witApi.updateWorkItem(
          null,
          fallbackPatchDocument,
          update.workItemId,
          update.project,
          false
        );

        logger.info("Work item updated successfully using fallback without iteration path", { id: workItem.id });
        return workItem;
      }
    } catch (error) {
      logger.error("Failed to update work item", error);
      throw error;
    }
  }

  async addAcceptanceCriteria(project: string, userStoryId: number, criteria: string[]): Promise<WorkItem> {
    logger.info("Adding acceptance criteria", { project, userStoryId, count: criteria.length });
    
    try {
      const criteriaText = criteria.map((c) => `- ${c}`).join("\n");
      return this.updateWorkItem({
        project,
        workItemId: userStoryId,
        description: criteriaText,
      });
    } catch (error) {
      logger.error("Failed to add acceptance criteria", error);
      throw error;
    }
  }

  async addRelation(input: WorkItemRelationInput): Promise<void> {
    logger.info("Adding work item relation", {
      project: input.project,
      sourceWorkItemId: input.sourceWorkItemId,
      targetWorkItemId: input.targetWorkItemId,
      relationType: input.relationType,
    });

    try {
      const witApi = await this.getWitApi();
      const serverUrl = (this.webApi as unknown as { serverUrl: string }).serverUrl;
      const relationType = input.relationType ?? "System.LinkTypes.Related";

      const patchDocument: JsonPatchOperation[] = [
        {
          op: Operation.Add,
          path: "/relations/-",
          value: {
            rel: relationType,
            url: `${serverUrl}_apis/wit/workItems/${input.targetWorkItemId}`,
          },
        },
      ];

      await witApi.updateWorkItem(
        null,
        patchDocument,
        input.sourceWorkItemId,
        input.project,
        false
      );
    } catch (error) {
      logger.error("Failed to add work item relation", error);
      throw error;
    }
  }
}
