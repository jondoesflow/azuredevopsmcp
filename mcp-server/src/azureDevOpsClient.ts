import { getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";
import { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
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
}

export class AzureDevOpsClient {
  private readonly webApi: WebApi;
  private witApi: IWorkItemTrackingApi | null = null;

  constructor(config: Config) {
    const authHandler = getPersonalAccessTokenHandler(config.azureDevOpsPat);
    this.webApi = new WebApi(config.azureDevOpsUrl, authHandler);
    logger.info("Azure DevOps client initialized", {
      org: config.azureDevOpsOrg,
      url: config.azureDevOpsUrl,
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
      const patchDocument: any[] = [];

      // Add fields
      patchDocument.push({
        op: "add",
        path: "/fields/System.Title",
        value: input.title,
      });

      if (input.description) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.Description",
          value: input.description,
        });
      }

      if (input.iterationPath) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.IterationPath",
          value: input.iterationPath,
        });
      }

      if (input.areaPath) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.AreaPath",
          value: input.areaPath,
        });
      }

      if (input.assignedTo) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.AssignedTo",
          value: input.assignedTo,
        });
      }

      if (input.state) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.State",
          value: input.state,
        });
      }

      // Add parent link if this is a child work item
      if (input.parentId) {
        patchDocument.push({
          op: "add",
          path: `/relations/-`,
          value: {
            rel: "System.LinkTypes.Hierarchy-reverse",
            url: `${(this.webApi as any).serverUrl}_apis/wit/workItems/${input.parentId}`,
          },
        });
      }

      // Add acceptance criteria for user stories
      if (input.witType === "User Story" && input.acceptanceCriteria && input.acceptanceCriteria.length > 0) {
        const criteriaText = input.acceptanceCriteria.map((c) => `${c}<br/>`).join("");
        patchDocument.push({
          op: "add",
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: criteriaText,
        });
      }

      if (input.priority) {
        patchDocument.push({
          op: "add",
          path: "/fields/Microsoft.VSTS.Common.Priority",
          value: input.priority,
        });
      }

      if (input.tags) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.Tags",
          value: input.tags,
        });
      }

      if (input.moscow) {
        patchDocument.push({
          op: "add",
          path: "/fields/Custom.MoSCoW",
          value: input.moscow,
        });
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
      
      // Build WIQL query
      let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.WorkItemType], [System.Description] FROM WorkItems WHERE [System.TeamProject] = '${filter.project}' AND [System.WorkItemType] = '${filter.witType}'`;

      if (filter.state) {
        wiql += ` AND [System.State] = '${filter.state}'`;
      }

      if (filter.assignedTo) {
        wiql += ` AND [System.AssignedTo] = '${filter.assignedTo}'`;
      }

      // For child items, filter by parent
      if (filter.parentId) {
        wiql += ` AND [System.Parent] = ${filter.parentId}`;
      }

      wiql += " ORDER BY [System.Id] DESC";

      const teamContext = { projectId: filter.project };
      const queryResult = await witApi.queryByWiql({ query: wiql }, teamContext as any);
      
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
      const patchDocument: any[] = [];

      if (update.title) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.Title",
          value: update.title,
        });
      }

      if (update.state) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.State",
          value: update.state,
        });
      }

      if (update.assignedTo) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.AssignedTo",
          value: update.assignedTo,
        });
      }

      if (update.description) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.Description",
          value: update.description,
        });
      }

      if (update.iterationPath) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.IterationPath",
          value: update.iterationPath,
        });
      }

      if (update.areaPath) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.AreaPath",
          value: update.areaPath,
        });
      }

      if (update.acceptanceCriteria && update.acceptanceCriteria.length > 0) {
        const criteriaText = update.acceptanceCriteria.map((c) => `${c}<br/>`).join("");
        patchDocument.push({
          op: "replace",
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: criteriaText,
        });
      }

      if (update.moscow) {
        patchDocument.push({
          op: "replace",
          path: "/fields/Custom.MoSCoW",
          value: update.moscow,
        });
      }

      if (update.tags) {
        patchDocument.push({
          op: "replace",
          path: "/fields/System.Tags",
          value: update.tags,
        });
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
}
