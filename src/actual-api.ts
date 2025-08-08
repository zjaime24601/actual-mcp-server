import * as api from "@actual-app/api";
import type { APIAccountEntity, APIPayeeEntity, APICategoryGroupEntity, APICategoryEntity } from "@actual-app/api/@types/loot-core/src/server/api-models";
import type { TransactionEntity } from "@actual-app/api/@types/loot-core/src/types/models";

export interface BudgetMonth {
    month: string;
    incomeAvailable: number;
    lastMonthOverspent: number;
    forNextMonth: number;
    totalBudgeted: number;
    toBudget: number;
    fromLastMonth: number;
    totalIncome: number;
    totalSpent: number;
    totalBalance: number;
    categoryGroups: any[];
}

export function integerToAmount(amount: number, currencyCode?: string) {
  // TODO check currency code for code that are not 2 dp
  return api.utils.integerToAmount(amount);
}

export async function getAccounts(): Promise<APIAccountEntity[]> {
  return api.getAccounts();
};

export async function getAccountBalance(accountId : string, cutoff?: Date): Promise<number> {
  return api.getAccountBalance(accountId, cutoff);
};

export async function getTransactions(accountId : string, startDate: Date, endDate: Date): Promise<TransactionEntity[]> {
  return api.getTransactions(accountId, startDate, endDate);
};

export async function getPayees(): Promise<APIPayeeEntity[]> {
  return api.getPayees();
};

export async function getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
  return api.getCategoryGroups();
};

export async function getCategories(): Promise<APICategoryEntity[]> {
  return api.getCategories();
};

export async function getBudgetMonth(month: any): Promise<BudgetMonth> {
  var rawResponse = await api.getBudgetMonth(month);
  return {
    month: rawResponse.month,
    incomeAvailable: rawResponse.incomeAvailable,
    lastMonthOverspent: rawResponse.lastMonthOverspent,
    forNextMonth: rawResponse.forNextMonth,
    totalBudgeted: rawResponse.totalBudgeted,
    toBudget: rawResponse.toBudget,
    fromLastMonth: rawResponse.fromLastMonth,
    totalIncome: rawResponse.totalIncome,
    totalSpent: rawResponse.totalSpent,
    totalBalance: rawResponse.totalBalance,
    categoryGroups: rawResponse.categoryGroups as any[],
  };
}