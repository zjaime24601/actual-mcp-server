import { FastMCP } from "fastmcp";
import { authenticate } from "./auth";
import { ActualConnection } from "./actual-connection";
import { registerTools } from "./tools";
import { MongoDbClient } from "./mongodb-client";
import { MongoDbContextService } from "./context/mongodb-context-service";

(async () => {
  const server = new FastMCP({
    name: "actual-mcp-server",
    version: "1.0.0",
    oauth: {
      enabled: true,
      authorizationServer: {
        issuer: process.env.AUTH_ISSUER!,
        authorizationEndpoint: `${process.env.AUTH_ISSUER}/protocol/openid-connect/auth`,
        tokenEndpoint: `${process.env.AUTH_ISSUER}/protocol/openid-connect/token`,
        jwksUri: `${process.env.AUTH_ISSUER}/protocol/openid-connect/certs`,
        responseTypesSupported: ["code"],
        registrationEndpoint: `${process.env.AUTH_ISSUER}/clients-registrations/openid-connect`,
      },
      protectedResource: {
        resource: process.env.MCP_AUDIENCE!,
        authorizationServers: [process.env.AUTH_ISSUER!],
      },
    },
    authenticate: authenticate,
  });

  const mongoClient = new MongoDbClient(
    process.env.MONGO_CONNECTION_STRING!,
    "actual-mcp-context"
  );

  async function initializeServices() {
    try {
      // Connect to MongoDB first
      await mongoClient.connect();

      // Initialize services that need MongoDB
      const contextService = new MongoDbContextService(mongoClient);

      console.log("✅ All services initialized");
      return { contextService };
    } catch (error) {
      console.error("❌ Service initialization failed:", error);
      process.exit(1);
    }
  }

  // Initialize before registering tools
  const { contextService } = await initializeServices();

  const actualConnection = new ActualConnection();
  const registeredTools = registerTools(server, actualConnection, contextService);

  // Global error handlers to prevent server crashes
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    // Don't exit the process, just log the error
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Don't exit the process, just log the error
  });

  // Cleanup on exit
  async function shutdown(signal: string) {
    console.log(`${signal} received, shutting down...`);

    try {
      await Promise.all([
        actualConnection.shutdown(),
        mongoClient.disconnect(),
      ]);
      console.log("✅ Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }

  process.on("SIGINT", async () => {
    await shutdown("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await shutdown("SIGTERM");
    process.exit(0);
  });

  // Start the server with HTTP streaming transport
  server.start({
    transportType: "httpStream",
    httpStream: { port: 3000 },
  });

  console.log(
    "✅ Actual Budget Raw Data MCP server running at http://localhost:3000/mcp"
  );
  console.log("✅ MCP config enabled:", !!server["options"]?.oauth?.enabled);
  console.log('✅ Available tools:');
  registeredTools.forEach((toolConfig) => {
    console.log(`   - ${toolConfig.name}: ${toolConfig.description}`);
  });
})().catch((error) => {
  console.error("❌ Startup failed:", error);
  process.exit(1);
});
