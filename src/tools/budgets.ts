import { z } from "zod";
import { ActualConnection } from "../actual-connection";
import * as api from "@actual-app/api";
import {
  ToolConfig,
  addCurrencyWarning,
  convertAmounts,
  parameters,
} from "./shared";
import { integerToAmount, getBudgetMonth } from "../actual-api";

// Get budget month data
const getBudgetMonthTool = function (
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
        getBudgetMonth(args.month),
        api.getCategories(),
        api.getCategoryGroups(),
      ]);

      const modifiedTotalIncome =
        budget.fromLastMonth + (budget.totalIncome - budget.forNextMonth);
      const response = {
        month: budget.month,
        totals: {
          income: integerToAmount(modifiedTotalIncome),
          spent: integerToAmount(budget.totalSpent),
          balance: integerToAmount(budget.totalBalance),
          budgeted: integerToAmount(budget.totalBudgeted),
          unbudgeted: integerToAmount(budget.toBudget),
        },
        categoryGroups: budget.categoryGroups.map((g) => {
          return {
            id: g.id,
            name: g.name,
            hidden: g.hidden,
            categories: g.categories.map((c: any) => {
              return {
                id: c.id,
                name: c.name,
                isIncome: c.is_income,
                isHidden: c.hidden,
                budgeted: integerToAmount(c.budgetted),
                spent: integerToAmount(c.spent),
                balance: integerToAmount(c.balance)
              };
            })
          };
        }),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning(response),
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
    getBudgetMonthTool(actualConnection),
    getBudgetMonths(actualConnection),
  ];
}
