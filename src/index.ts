import { FastMCP  } from 'fastmcp';
import { authenticate } from './auth';
import { ActualConnection } from './actual-connection';
import { registerTools } from './tools';

const server = new FastMCP({
  name: 'actual-mcp-server',
  version: '1.0.0',
  oauth: {
    enabled: true,
    authorizationServer: {
      issuer: process.env.AUTH_ISSUER!,
      authorizationEndpoint: `${process.env.AUTH_ISSUER}/protocol/openid-connect/auth`,
      tokenEndpoint: `${process.env.AUTH_ISSUER}/protocol/openid-connect/token`,
      jwksUri: `${process.env.AUTH_ISSUER}/protocol/openid-connect/certs`,
      responseTypesSupported: ['code'],
      registrationEndpoint: `${process.env.AUTH_ISSUER}/clients-registrations/openid-connect`,
    },
    protectedResource: {
      resource: process.env.MCP_AUDIENCE!,
      authorizationServers: [process.env.AUTH_ISSUER!],
    },
  },
  authenticate: authenticate,
});

const actualConnection = new ActualConnection();

registerTools(server, actualConnection);

// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Cleanup on exit
process.on('SIGINT', async () => {
  await actualConnection.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await actualConnection.shutdown();
  process.exit(0);
});

// Start the server with HTTP streaming transport
server.start({
  transportType: 'httpStream',
  httpStream: { port: 3000 },
});

console.log('✅ Actual Budget Raw Data MCP server running at http://localhost:3000/mcp');
console.log('✅ MCP config enabled:', !!server['options']?.oauth?.enabled);
console.log('✅ Available tools:');
console.log('   - get_budgets: List all budgets');
console.log('   - load_budget: Load specific budget');
console.log('   - get_all_data: All accounts, categories, groups, payees');
console.log('   - get_transactions: Transactions with full context');
console.log('   - get_budget_month: Single month budget data');
console.log('   - get_budget_months: Multi-month budget trends');
console.log('   - get_year_data: Complete year of transactions + budgets');
console.log('   - get_account_balance_history: Account balance trends');