export type EntityType = 'owner' | 'account' | 'budget' | 'transaction' | 'category';

export interface EntityContext {
  _id?: string;
  entityType: EntityType;
  entityId: string;
  budgetId: string;
  context: Record<string, any>; // Completely flexible
  createdAt: Date;
  updatedAt: Date;
}

export interface ContextQuery {
  entityType?: EntityType;
  entityId?: string;
  budgetId?: string;
  [key: string]: any; // Allow querying by context fields
}

export interface ContextService {
  /**
   * Set or update context data for an entity
   * @param entityType Type of entity (e.g., 'account', 'budget', 'transaction', 'category')
   * @param entityId Unique identifier for the entity
   * @param budgetId Budget scope for the context
   * @param context Arbitrary context data as key-value pairs
   * @returns The created or updated context document
   */
  setContext(
    entityType: EntityType,
    entityId: string,
    budgetId: string,
    context: Record<string, any>
  ): Promise<EntityContext>;

  /**
   * Get context data for a specific entity
   * @param entityType Type of entity
   * @param entityId Unique identifier for the entity
   * @param budgetId Budget scope for the context
   * @returns The context document or null if not found
   */
  getContext(
    entityType: EntityType,
    entityId: string,
    budgetId: string
  ): Promise<EntityContext | null>;

  /**
   * Clear all context data for a specific entity
   * @param entityType Type of entity
   * @param entityId Unique identifier for the entity
   * @param budgetId Budget scope for the context
   * @returns True if context was deleted, false if not found
   */
  clearContext(
    entityType: string,
    entityId: string,
    budgetId: string
  ): Promise<boolean>;

  /**
   * Search for entities based on context criteria
   * @param query Search criteria including entity filters and context field matches
   * @returns Array of matching context documents
   */
  searchContext(query: ContextQuery): Promise<EntityContext[]>;
}