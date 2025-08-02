import * as api from "@actual-app/api";
import fs from "fs";
import { promisify } from "util";

const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

const DATA_PATH = process.env.ACTUAL_DATA_DIR ?? "/data/actual";

async function ensureDataDirectoryExists() {
  try {
    await access(DATA_PATH, fs.constants.F_OK);
    console.log(`✅ Data directory already exists: ${DATA_PATH}`);
  } catch {
    await mkdir(DATA_PATH, { recursive: true });
    console.log(`📁 Created data directory: ${DATA_PATH}`);
  }
}

export class ActualConnection {
  private isInitialized = false;
  private currentBudgetId: string | null = null;

  async ensureConnection() {
    if (!this.isInitialized) {
      console.info("Initialising Actual connection");
      await ensureDataDirectoryExists();
      await api.init({
        serverURL: process.env.ACTUAL_SERVER_URL || "http://localhost:5006",
        password: process.env.ACTUAL_SERVER_PASSWORD || "",
        dataDir: DATA_PATH,
      });
      this.isInitialized = true;
      console.info("Actual connection initialised");
    }
  }

  async ensureBudgetLoaded(budgetId?: string) {
    await this.ensureConnection();

    // Use provided budgetId, or fall back to environment variable
    const targetBudgetId = budgetId || process.env.ACTUAL_BUDGET_ID;

    if (!targetBudgetId) {
      throw new Error(
        "No budget ID provided. Set ACTUAL_BUDGET_ID environment variable or pass budgetId parameter. You can find your budget ID in Actual Budget > Settings > Advanced."
      );
    }

    if (targetBudgetId !== this.currentBudgetId) {
      console.log(`Loading budget ${targetBudgetId}`);

      try {
        // Try downloading the budget (this works for both local and remote)
        await api.downloadBudget(targetBudgetId );
        this.currentBudgetId = targetBudgetId;
        console.log(`Successfully loaded budget ${targetBudgetId}`);
      } catch (error) {
        console.error(`Failed to load budget ${targetBudgetId}:`, error);
        throw new Error(
          `Failed to load budget ${targetBudgetId}. Check that the budget ID is correct and accessible. You can find your budget ID in Actual Budget > Settings > Advanced.`
        );
      }
    } else {
      console.log(`Budget ${this.currentBudgetId} already loaded`);
    }
    return this.currentBudgetId;
  }

  async shutdown() {
    if (this.isInitialized) {
      console.info("Shutting down Actual API connection");
      await api.shutdown();
      this.isInitialized = false;
      this.currentBudgetId = null;
    }
  }
}