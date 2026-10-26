import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  columnTableRelations,
  commentTableRelations,
  customFieldDefinitionTableRelations,
  customFieldValueTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  userTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
} from "./relations";
import { poolConnectionConfig } from "./pool-tls";
import { resolveDatabaseConfig } from "./resolve-database-url";
import {
  dataMigrationTable,
  storageCleanupTable,
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  billingEventTable,
  billingReminderSentTable,
  calendarFeedTable,
  columnTable,
  commentTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  deviceCodeTable,
  externalLinkTable,
  githubImportTable,
  githubIntegrationTable,
  importRunTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
  workspaceBillingTable,
  workspaceRoleTable,
  workspaceMemberAccessTable,
  workspaceMemberProjectTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

config();

export const schema = {
  dataMigrationTable,
  storageCleanupTable,
  accountTable,
  assetTable,
  activityTable,
  apikeyTable,
  billingReminderSentTable,
  billingEventTable,
  calendarFeedTable,
  workspaceBillingTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  externalLinkTable,
  githubIntegrationTable,
  githubImportTable,
  importRunTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  verificationTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceMemberAccessTable,
  workspaceMemberProjectTable,
  workspaceTable,
  workspaceUserTable,
  accountTableRelations,
  assetTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
  customFieldDefinitionTable,
  customFieldValueTable,
  customFieldDefinitionTableRelations,
  customFieldValueTableRelations,
};

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: DatabaseInstance | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    const config = resolveDatabaseConfig();
    pool = new Pool({
      // Tofu (2026-10-25): TLS follows the URL's sslmode (./pool-tls.ts), so
      // `?sslmode=require` works against a managed database's pooler.
      ...poolConnectionConfig(config.connectionString),
      // Fail fast when Railway's internal network is slow rather than hanging
      // indefinitely and blocking every API request.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: config.poolMax,
    });
  }

  return pool;
}

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDatabasePool(), {
      schema,
    });
  }

  return dbInstance;
}

// Tofu (2026-10-26): while a start runs its schema steps (./tofu-start-lock.ts),
// `db` is the transaction that holds the schema lock, so every step runs in it.
const schemaStep = new AsyncLocalStorage<DatabaseInstance>();

export function runInSchemaStep<T>(
  transaction: DatabaseInstance,
  step: () => Promise<T>,
): Promise<T> {
  return schemaStep.run(transaction, step);
}

const db = new Proxy({} as DatabaseInstance, {
  get(_target, property, receiver) {
    const database = schemaStep.getStore() ?? getDatabase();
    const value = Reflect.get(database, property, receiver);

    if (typeof value === "function") {
      return value.bind(database);
    }

    return value;
  },
});

export default db;
