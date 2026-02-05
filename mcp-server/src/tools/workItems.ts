import { AzureDevOpsClient } from "../azureDevOpsClient.js";
import { logger } from "../logger.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const workItemTools: Tool[] = [
  {
    name: "list_epics",
    description: "List Epic work items in an Azure DevOps project with optional filters",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        state: {
          type: "string",
          description: "Filter by state (New, Active, Resolved, Closed)",
        },
        assignedTo: {
          type: "string",
          description: "Filter by assigned user",
        },
        top: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "list_features",
    description: "List Feature work items in an Azure DevOps project with optional filters",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        epic: {
          type: "number",
          description: "Filter by parent Epic ID",
        },
        state: {
          type: "string",
          description: "Filter by state (New, Active, Resolved, Closed)",
        },
        top: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "list_user_stories",
    description: "List User Story work items with optional filters for feature, state, or assignment",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        feature: {
          type: "number",
          description: "Filter by parent Feature ID",
        },
        state: {
          type: "string",
          description: "Filter by state (New, Active, Resolved, Closed)",
        },
        assignedTo: {
          type: "string",
          description: "Filter by assigned user",
        },
        top: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "get_user_story",
    description: "Get detailed information about a User Story including acceptance criteria and child tasks",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        userStoryId: {
          type: "number",
          description: "The User Story ID",
        },
      },
      required: ["project", "userStoryId"],
    },
  },
  {
    name: "add_acceptance_criteria",
    description: "Add acceptance criteria to a User Story",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        userStoryId: {
          type: "number",
          description: "The User Story ID",
        },
        criteria: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of acceptance criteria items (e.g., 'Given X, When Y, Then Z')",
        },
      },
      required: ["project", "userStoryId", "criteria"],
    },
  },
  {
    name: "list_tasks",
    description: "List Task work items, optionally filtered by parent User Story",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        userStory: {
          type: "number",
          description: "Filter by parent User Story ID",
        },
        state: {
          type: "string",
          description: "Filter by state (To Do, In Progress, Done)",
        },
        assignedTo: {
          type: "string",
          description: "Filter by assigned user",
        },
        top: {
          type: "number",
          description: "Maximum number of results to return (default: 50)",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "create_epic",
    description: "Create a new Epic in Azure DevOps",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        title: {
          type: "string",
          description: "Epic title",
        },
        description: {
          type: "string",
          description: "Epic description",
        },
        assignedTo: {
          type: "string",
          description: "User to assign the Epic to",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_feature",
    description: "Create a new Feature in Azure DevOps",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        title: {
          type: "string",
          description: "Feature title",
        },
        description: {
          type: "string",
          description: "Feature description",
        },
        epicId: {
          type: "number",
          description: "Parent Epic ID (optional)",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_user_story",
    description: "Create a new User Story in Azure DevOps",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        title: {
          type: "string",
          description: "User Story title",
        },
        description: {
          type: "string",
          description: "User Story description",
        },
        featureId: {
          type: "number",
          description: "Parent Feature ID (optional)",
        },
        acceptanceCriteria: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of acceptance criteria items",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_task",
    description: "Create a new Task in Azure DevOps",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        userStoryId: {
          type: "number",
          description: "Parent User Story ID",
        },
        assignedTo: {
          type: "string",
          description: "User to assign the Task to",
        },
      },
      required: ["project", "title", "userStoryId"],
    },
  },
  {
    name: "update_work_item",
    description: "Update a work item's state, assignment, or description",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name or ID",
        },
        workItemId: {
          type: "number",
          description: "The work item ID to update",
        },
        state: {
          type: "string",
          description: "New state (e.g., Active, Resolved, Closed)",
        },
        assignedTo: {
          type: "string",
          description: "User to assign to",
        },
        description: {
          type: "string",
          description: "Updated description",
        },
      },
      required: ["project", "workItemId"],
    },
  },
];

interface ToolInput {
  project: string;
  state?: string;
  assignedTo?: string;
  epic?: number;
  feature?: number;
  userStory?: number;
  top?: number;
  userStoryId?: number;
  title?: string;
  description?: string;
  epicId?: number;
  criteria?: string[];
  featureId?: number;
  acceptanceCriteria?: string[];
  workItemId?: number;
}

export async function handleWorkItemTool(
  client: AzureDevOpsClient,
  toolName: string,
  input: ToolInput
): Promise<string> {
  try {
    switch (toolName) {
      case "list_epics": {
        const epics = await client.listWorkItems({
          project: input.project,
          witType: "Epic",
          state: input.state,
          assignedTo: input.assignedTo,
          top: input.top,
        });
        const formatted = epics
          .map((e) => {
            const title = e.fields?.["System.Title"] ?? "Unknown";
            const state = e.fields?.["System.State"] ?? "Unknown";
            return `#${e.id}: ${title} [${state}]`;
          })
          .join("\n");
        return `Found ${epics.length} Epics:\n${formatted || "No epics found"}`;
      }

      case "list_features": {
        const features = await client.listWorkItems({
          project: input.project,
          witType: "Feature",
          state: input.state,
          parentId: input.epic,
          top: input.top,
        });
        const formatted = features
          .map((f) => {
            const title = f.fields?.["System.Title"] ?? "Unknown";
            const state = f.fields?.["System.State"] ?? "Unknown";
            return `#${f.id}: ${title} [${state}]`;
          })
          .join("\n");
        return `Found ${features.length} Features:\n${formatted || "No features found"}`;
      }

      case "list_user_stories": {
        const stories = await client.listWorkItems({
          project: input.project,
          witType: "User Story",
          state: input.state,
          assignedTo: input.assignedTo,
          parentId: input.feature,
          top: input.top,
        });
        const formatted = stories
          .map((s) => {
            const title = s.fields?.["System.Title"] ?? "Unknown";
            const state = s.fields?.["System.State"] ?? "Unknown";
            return `#${s.id}: ${title} [${state}]`;
          })
          .join("\n");
        return `Found ${stories.length} User Stories:\n${formatted || "No user stories found"}`;
      }

      case "get_user_story": {
        const story = await client.getWorkItem(input.project, input.userStoryId!);
        const tasks = await client.listWorkItems({
          project: input.project,
          witType: "Task",
          parentId: input.userStoryId!,
        });
        const taskList =
          tasks.length > 0
            ? `\n\nChild Tasks:\n${tasks.map((t) => {
                const title = t.fields?.["System.Title"] ?? "Unknown";
                return `  • #${t.id}: ${title}`;
              }).join("\n")}`
            : "";
        const storyTitle = story.fields?.["System.Title"] ?? "Unknown";
        const storyState = story.fields?.["System.State"] ?? "Unknown";
        const assignedTo = story.fields?.["System.AssignedTo"] ?? "Unassigned";
        const desc = story.fields?.["System.Description"] ?? "No description";
        return `User Story #${story.id}: ${storyTitle}\nState: ${storyState}\nAssigned To: ${assignedTo}\n\n${desc}${taskList}`;
      }

      case "add_acceptance_criteria": {
        const updated = await client.addAcceptanceCriteria(
          input.project,
          input.userStoryId!,
          input.criteria!
        );
        return `Added acceptance criteria to User Story #${updated.id}:\n${input.criteria!.map((c) => `• ${c}`).join("\n")}`;
      }

      case "list_tasks": {
        const tasks = await client.listWorkItems({
          project: input.project,
          witType: "Task",
          state: input.state,
          assignedTo: input.assignedTo,
          parentId: input.userStory,
          top: input.top,
        });
        const formatted = tasks
          .map((t) => {
            const title = t.fields?.["System.Title"] ?? "Unknown";
            const state = t.fields?.["System.State"] ?? "Unknown";
            return `#${t.id}: ${title} [${state}]`;
          })
          .join("\n");
        return `Found ${tasks.length} Tasks:\n${formatted || "No tasks found"}`;
      }

      case "create_epic": {
        const epic = await client.createWorkItem({
          project: input.project,
          witType: "Epic",
          title: input.title!,
          description: input.description,
          assignedTo: input.assignedTo,
        });
        const epicTitle = epic.fields?.["System.Title"] ?? input.title!;
        return `✓ Created Epic #${epic.id}: "${epicTitle}"`;
      }

      case "create_feature": {
        const feature = await client.createWorkItem({
          project: input.project,
          witType: "Feature",
          title: input.title!,
          description: input.description,
          parentId: input.epicId,
        });
        const featureTitle = feature.fields?.["System.Title"] ?? input.title!;
        return `✓ Created Feature #${feature.id}: "${featureTitle}"${input.epicId ? ` under Epic #${input.epicId}` : ""}`;
      }

      case "create_user_story": {
        const story = await client.createWorkItem({
          project: input.project,
          witType: "User Story",
          title: input.title!,
          description: input.description,
          parentId: input.featureId,
          acceptanceCriteria: input.acceptanceCriteria,
        });
        const storyTitle = story.fields?.["System.Title"] ?? input.title!;
        return `✓ Created User Story #${story.id}: "${storyTitle}"${input.featureId ? ` under Feature #${input.featureId}` : ""}`;
      }

      case "create_task": {
        const task = await client.createWorkItem({
          project: input.project,
          witType: "Task",
          title: input.title!,
          description: input.description,
          parentId: input.userStoryId!,
          assignedTo: input.assignedTo,
        });
        const taskTitle = task.fields?.["System.Title"] ?? input.title!;
        return `✓ Created Task #${task.id}: "${taskTitle}" for User Story #${input.userStoryId}`;
      }

      case "update_work_item": {
        const updated = await client.updateWorkItem({
          project: input.project,
          workItemId: input.workItemId!,
          state: input.state,
          assignedTo: input.assignedTo,
          description: input.description,
        });
        const updates = [];
        if (input.state) updates.push(`State: ${input.state}`);
        if (input.assignedTo) updates.push(`Assigned to: ${input.assignedTo}`);
        if (input.description) updates.push(`Description: updated`);
        return `✓ Updated work item #${updated.id}:\n${updates.join("\n")}`;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`Error handling tool ${toolName}`, error);
    if (error instanceof Error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
    throw new Error(`Tool execution failed: Unknown error`);
  }
}
