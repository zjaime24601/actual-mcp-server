import { Collection } from 'mongodb';
import { EntityContext, ContextQuery, EntityType, ContextService } from './context';
import { MongoDbClient } from '../mongodb-client';

export class MongoDbContextService implements ContextService {
  private collection: Collection<EntityContext>;

  constructor(private mongoClient: MongoDbClient) {
    this.collection = this.mongoClient.getDb().collection<EntityContext>('entity_contexts');
    this.initializeIndexes();
  }

  private async initializeIndexes(): Promise<void> {
    try {
      await this.collection.createIndex(
        { entityType: 1, entityId: 1, budgetId: 1 }, 
        { unique: true }
      );
      await this.collection.createIndex({ budgetId: 1 });
      await this.collection.createIndex({ entityType: 1 });
      console.log('✅ Context service indexes created');
    } catch (error) {
      console.error('❌ Failed to create indexes:', error);
    }
  }

  async setContext(
    entityType: EntityType,
    entityId: string,
    budgetId: string,
    context: Record<string, any>
  ): Promise<EntityContext> {
    const now = new Date();
    const document = await this.collection.findOneAndUpdate(
      { entityType, entityId, budgetId },
      {
        $set: { context, updatedAt: now },
        $setOnInsert: { entityType, entityId, budgetId, createdAt: now }
      },
      { upsert: true, returnDocument: 'after' }
    );

    return document!;
  }

  async getContext(
    entityType: EntityType,
    entityId: string,
    budgetId: string
  ): Promise<EntityContext | null> {
    return await this.collection.findOne({
      entityType,
      entityId,
      budgetId
    });
  }

  async searchContext(query: ContextQuery): Promise<EntityContext[]> {
    const mongoQuery: any = {};
    
    if (query.entityType) mongoQuery.entityType = query.entityType;
    if (query.entityId) mongoQuery.entityId = query.entityId;
    if (query.budgetId) mongoQuery.budgetId = query.budgetId;
    
    // Allow searching by context fields using dot notation
    Object.keys(query).forEach(key => {
      if (!['entityType', 'entityId', 'budgetId'].includes(key)) {
        mongoQuery[`context.${key}`] = query[key];
      }
    });

    return await this.collection.find(mongoQuery).toArray();
  }

  async clearContext(
    entityType: EntityType,
    entityId: string,
    budgetId: string
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      entityType,
      entityId,
      budgetId
    });
    return result.deletedCount > 0;
  }
}