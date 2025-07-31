import { z } from "zod";
import { EntityContext } from "../context/context";

export const parameters = {
  budgetId: () =>
    z
      .string()
      .optional()
      .describe(
        "Budget ID to use (uses ACTUAL_BUDGET_ID env var if not provided)"
      ),
  month: (paramName: string) =>
    z.string().describe(`${paramName} in YYYY-MM format`),
  date: (paramName: string) =>
    z.string().describe(`${paramName} in YYYY-MM-DD format`),
};

export interface ToolConfig<TParams extends z.ZodSchema = z.ZodSchema> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>) => Promise<{
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
}

// Utility to convert amounts from Actual's integer format to decimal
// Note: Actual Budget treats all amounts as currency-agnostic numbers
export function convertAmounts(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(convertAmounts);
  }

  if (typeof obj === "object") {
    const converted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Convert amount fields from integer to decimal (divided by 100)
      // These are currency-agnostic - could be USD, GBP, EUR, etc.
      if (
        key === "amount" ||
        key === "balance" ||
        key === "budgeted" ||
        key === "spent"
      ) {
        converted[key] = typeof value === "number" ? value / 100 : value;
      } else {
        converted[key] = convertAmounts(value);
      }
    }
    return converted;
  }

  return obj;
}

// Add currency warning to response data
export function addCurrencyWarning(data: any) {
  return {
    IMPORTANT_CURRENCY_NOTE:
      "All amounts from Actual Bduget are currency-agnostic numbers. Unless specidied in stored AI context ask user to specify currencies for accurate financial analysis.",
    ...data,
  };
}

export function withAIContext(data: any, context: EntityContext) {
  return {
    AIContext: context.context,
    ...data,
  };
}

// Error handling decorator for tool functions
export function withErrorHandling<T extends z.ZodTypeAny>(toolConfig: {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<any>;
}) {
  return {
    ...toolConfig,
    execute: async (args: z.infer<T>) => {
      try {
        return await toolConfig.execute(args);
      } catch (error) {
        console.error(`Error in tool ${toolConfig.name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: `Failed to execute ${toolConfig.name}`,
                  message:
                    error instanceof Error ? error.message : String(error),
                  timestamp: new Date().toISOString(),
                  args: args,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    },
  };
}
