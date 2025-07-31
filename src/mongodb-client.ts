import { MongoClient, Db } from 'mongodb';

export class MongoDbClient {
  private client: MongoClient;
  private db: Db | null = null;
  private isConnected = false;

  constructor(connectionString: string, dbName: string = 'actual_context') {
    this.client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
    });
    this.dbName = dbName;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.isConnected = true;
      console.log(`✅ MongoDB connected to database: ${this.dbName}`);
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.close();
      this.isConnected = false;
      console.log('✅ MongoDB disconnected');
    } catch (error) {
      console.error('❌ MongoDB disconnect failed:', error);
      throw error;
    }
  }

  getDb(): Db {
    if (!this.isConnected || !this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  async ping(): Promise<boolean> {
    try {
      await this.getDb().admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  private dbName: string;
}