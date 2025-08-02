import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";
import { ToolConfig, addCurrencyWarning, convertAmounts, parameters } from "./shared";

// Get budget month data
const getBudgetMonth = function (
  actualConnection: ActualConnection
): ToolConfig {
  return {
    name: "get_budget_month",
    description:
      "Get budget vs actual data for a specific month with all context",
    parameters: z.object({
      month: parameters.month("Month"),
    }),
    execute: async (args) => {
      await actualConnection.ensureBudgetLoaded();

      const [budget, categories, categoryGroups] = await Promise.all([
        api.getBudgetMonth(args.month),
        api.getCategories(),
        api.getCategoryGroups(),
      ]);

      // Convert budget amounts to decimal
      const convertedBudget = convertAmounts(budget);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                budget: convertedBudget,
                categories,
                categoryGroups,
                month: args.month,
              }),
              null,
              2
            ),
          },
        ],
      };
    },
  };
};

// Get multiple budget months for trend analysis
const getBudgetMonths = function (
  actualConnection: ActualConnection
): ToolConfig {
  return {
    name: "get_budget_months",
    description: "Get budget data for multiple months for trend analysis",
    parameters: z.object({
      startMonth: parameters.month("Start month"),
      endMonth: parameters.month("End month"),
    }),
    execute: async (args) => {
      await actualConnection.ensureBudgetLoaded();

      const [categories, categoryGroups] = await Promise.all([
        api.getCategories(),
        api.getCategoryGroups(),
      ]);

      // Generate month list
      const months = [];
      const start = new Date(args.startMonth + "-01");
      const end = new Date(args.endMonth + "-01");

      for (
        let date = new Date(start);
        date <= end;
        date.setMonth(date.getMonth() + 1)
      ) {
        months.push(date.toISOString().slice(0, 7));
      }

      // Get budget data for all months
      const budgetData: Record<string, any> = {};
      for (const month of months) {
        try {
          const budget = await api.getBudgetMonth(month);
          budgetData[month] = convertAmounts(budget);
        } catch (error) {
          budgetData[month] = null; // Month doesn't exist
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                budgetData,
                categories,
                categoryGroups,
                months,
                queryInfo: {
                  startMonth: args.startMonth,
                  endMonth: args.endMonth,
                  monthCount: months.length,
                },
              }),
              null,
              2
            ),
          },
        ],
      };
    },
  };
};

export function getBudgetTools(
  actualConnection: ActualConnection
): ToolConfig[] {
  return [
    getBudgetMonth(actualConnection),
    getBudgetMonths(actualConnection),
  ];
}
