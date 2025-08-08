import { string, z } from "zod";
import { ActualConnection } from "../actual-connection";
import { ToolConfig, addCurrencyWarning, parameters } from "./shared";
import {
  integerToAmount,
  getBudgetMonth,
  BudgetMonth,
  getCategoryGroups,
  getCategories,
} from "../actual-api";
import { APICategoryGroupEntity } from "@actual-app/api/@types/loot-core/src/server/api-models";
import { ContextService } from "../context/context";

const mapResponseBudget = function (actualBudget: BudgetMonth): any {
  const modifiedTotalIncome =
    actualBudget.fromLastMonth +
    (actualBudget.totalIncome - actualBudget.forNextMonth);
  const categoryTotalsPairs = actualBudget.categoryGroups.flatMap((g) =>
    g.categories.map((c: any) => {
      return [
        c.id,
        {
          budgeted: integerToAmount(c.budgetted),
          spent: integerToAmount(c.spent),
          balance: integerToAmount(c.balance),
        },
      ] as [string, any];
    })
  );
  return {
    month: actualBudget.month,
    totals: {
      income: integerToAmount(modifiedTotalIncome),
      spent: integerToAmount(actualBudget.totalSpent),
      balance: integerToAmount(actualBudget.totalBalance),
      budgeted: integerToAmount(actualBudget.totalBudgeted),
      unbudgeted: integerToAmount(actualBudget.toBudget),
    },
    categoryTotals: Object.fromEntries(categoryTotalsPairs),
  };
};

const getCategoryContextsFromGroups = async function (
  budgetId: string,
  actualCategoryGroups: APICategoryGroupEntity[],
  contextService: ContextService
): Promise<Record<string, any>> {
  const categoryContext = await Promise.all(
    actualCategoryGroups
      .flatMap((g) => g.categories)
      .map(async (c) => {
        const context = await contextService.getContext(
          "category",
          c.id,
          budgetId
        );
        return [c.id, context] as [string, any];
      })
  );

  return Object.fromEntries(categoryContext);
};

const mapResponseCategoryGroups = function (
  actualCategoryGroups: APICategoryGroupEntity[],
  categoryContext: Record<string, any>
): any[] {
  return actualCategoryGroups.map((g) => {
    return {
      groupId: g.id,
      groupName: g.name,
      groupIsHidden: g.hidden,
      categories: g.categories.map((c) => {
        return {
          id: c.id,
          name: c.name,
          isIncome: c.is_income,
          isHidden: c.hidden,
          context: categoryContext[c.id],
        };
      }),
    };
  });
};

// Get budget month data
const getBudgetMonthTool = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "get_budget_month",
    description:
      "Get budget vs actual data for a specific month with all context",
    parameters: z.object({
      month: parameters.month("Month"),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const categoryGroups = await getCategoryGroups();
      const categoryContext = await getCategoryContextsFromGroups(
        loadedBudgetId,
        categoryGroups,
        contextService
      );

      const budget = await getBudgetMonth(args.month);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              addCurrencyWarning({
                budgetMonth: mapResponseBudget(budget),
                categoryDefinitions: mapResponseCategoryGroups(
                  categoryGroups,
                  categoryContext
                ),
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
const getBudgetMonthsTool = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  return {
    name: "get_budget_months",
    description: "Get budget data for multiple months for trend analysis",
    parameters: z.object({
      startMonth: parameters.month("Start month"),
      endMonth: parameters.month("End month"),
    }),
    execute: async (args) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const categoryGroups = await getCategoryGroups();
      const categoryContext = await getCategoryContextsFromGroups(
        loadedBudgetId,
        categoryGroups,
        contextService
      );

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
          const budget = await getBudgetMonth(month);
          budgetData[month] = mapResponseBudget(budget);
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
                budgetMonths: budgetData,
                categoryDefinitions: mapResponseCategoryGroups(
                  categoryGroups,
                  categoryContext
                ),
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

const setCategoryContexts = function (
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig {
  const setContextParametersSchema = z.object({
    contexts: z.array(
      z.object({
        categoryId: z.string().describe("Category ID"),
        context: z
          .record(z.any())
          .describe(
            "Context data as key-value pairs (e.g., {currency: 'GBP', accountType: 'ISA', notes: 'Emergency fund'})"
          ),
      })
    ),
  });
  type SetCategoryContextsArgs = z.infer<typeof setContextParametersSchema>;
  return {
    name: "set_category_contexts",
    description:
      "Set supplementary context against Categories for future reference. Always ask user to confirm data before setting.",
    parameters: setContextParametersSchema,
    execute: async (args: SetCategoryContextsArgs) => {
      const loadedBudgetId = await actualConnection.ensureBudgetLoaded();

      const existingCategories = await getCategories();
      const nonExistentCategories = args.contexts
        .filter(
          (ac) => !existingCategories.find((ec) => ec.id === ac.categoryId)
        )
        .map((c) => c.categoryId);
      if (nonExistentCategories.length > 0) {
        throw new Error(
          `Categories not found for ids: ${nonExistentCategories.join(", ")}`
        );
      }

      await Promise.all(
        args.contexts.map(async (c) =>
          contextService.setContext("category", c.categoryId, loadedBudgetId, c)
        )
      );

      return {
        content: [
          {
            type: "text",
            text: "Contexts stored successfully.",
          },
        ],
      };
    },
  };
};

export function getBudgetTools(
  actualConnection: ActualConnection,
  contextService: ContextService
): ToolConfig[] {
  return [
    getBudgetMonthTool(actualConnection, contextService),
    getBudgetMonthsTool(actualConnection, contextService),
    setCategoryContexts(actualConnection, contextService),
  ];
}
