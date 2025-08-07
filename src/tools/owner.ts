import { z } from "zod";
import { ContextService } from "../context/context";
import { ToolConfig } from "./shared";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";

const syncData = function (
  actualConnection: ActualConnection,
): ToolConfig {
  return {
    name: "sync_data_context",
    description:
      "Sync budget data to make sure most recent data is presented in tooling",
    parameters: z.object({}),
    execute: async () => {
      await actualConnection.ensureBudgetLoaded();
      await api.sync();

      return {
        content: [
          {
            type: "text",
            text: "Data synced successfully.",
          },
        ],
      };
    },
  };
}

const getOwnerContext = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "get_owner_context",
    description:
      "Set AI context against the owner. For tracking things like overall goals, priorities and preferences. Always ask user to confirm data before setting.",
    parameters: z.object({}),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const aiContext = await contextService.getContext(
        "owner",
        "owner",
        loadedBudgetId
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(aiContext),
          },
        ],
      };
    },
  };
};

const setOwnerContext = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "set_owner_context",
    description:
      "Set AI context against the owner. For tracking things like overall goals, priorities and preferences. Always ask user to confirm data before setting.",
    parameters: z.object({
      context: z
        .record(z.any())
        .describe(
          "Context data as key-value pairs (e.g., {currency: 'GBP', accountType: 'ISA', notes: 'Emergency fund'})"
        ),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      await contextService.setContext(
        "owner",
        "owner",
        loadedBudgetId,
        args.context
      );

      return {
        content: [
          {
            type: "text",
            text: "Context stored successfully.",
          },
        ],
      };
    },
  };
};

export function getOwnerTools(
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig[] {
  return [
    syncData(actualConnection),
    getOwnerContext(actualConnection, contextService),
    setOwnerContext(actualConnection, contextService),
  ];
}
