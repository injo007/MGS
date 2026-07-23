import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const contactStatusEnum = pgEnum("contact_status", [
  "not_contacted",
  "ready_to_contact",
  "contacted",
  "follow_up_due",
  "closed",
]);

export const responseStatusEnum = pgEnum("response_status", [
  "not_sent",
  "no_response",
  "replied",
  "needs_follow_up",
]);

export const decisionEnum = pgEnum("decision", [
  "pending",
  "accepted",
  "denied",
  "prohibited_sending",
  "not_suitable",
]);

export const serverStatusEnum = pgEnum("server_status", [
  "pending",
  "active",
  "paused",
  "suspended",
  "cancelled",
  "expired",
  "public",
  "down",
  "port_closed",
  "ts04_error",
  "tss09_error",
  "bounce",
  "complaint",
]);

export const ipStatusEnum = pgEnum("ip_status", [
  "active",
  "unused",
  "warming",
  "paused",
  "blocked",
  "retired",
]);

export const port25StatusEnum = pgEnum("port25_status", [
  "available",
  "blocked",
  "unknown",
]);

export const ptrStatusEnum = pgEnum("ptr_status", [
  "configured",
  "not_configured",
  "unknown",
]);

export const contactChannelEnum = pgEnum("contact_channel", [
  "email",
  "support_ticket",
  "contact_form",
  "live_chat",
  "phone",
  "other",
]);

export const sendResultEnum = pgEnum("send_result", [
  "drafted",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "replied",
]);

export const responseTypeEnum = pgEnum("response_type", [
  "approved",
  "rejected",
  "needs_verification",
  "requires_deposit",
  "requires_kyc",
  "requires_support_request",
  "port25_blocked",
  "port25_available",
  "mail_servers_prohibited",
  "other",
]);

export const sendingStatusEnum = pgEnum("sending_status", [
  "normal",
  "watch",
  "paused",
  "stopped",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "inactive",
]);

export const billingMethodEnum = pgEnum("billing_method", [
  "hourly",
  "monthly",
  "annually",
  "one_time",
  "free",
]);

export const ipVersionEnum = pgEnum("ip_version", [
  "ipv4",
  "ipv6",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

// ─── Users & Auth ────────────────────────────────────────────────────────────

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  group: text("group").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("role_permissions_unique").on(t.roleId, t.permissionId),
  ]
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  hashedPassword: text("hashed_password"),
  image: text("image"),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  status: userStatusEnum("status").default("active").notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    uniqueIndex("accounts_provider_providerAccountId_unique").on(
      t.provider,
      t.providerAccountId
    ),
  ]
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("verification_tokens_identifier_token_unique").on(t.identifier, t.token)]
);

// ─── Providers ───────────────────────────────────────────────────────────────

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    supportEmail: text("support_email"),
    salesEmail: text("sales_email"),
    contactFormUrl: text("contact_form_url"),
    country: text("country"),
    region: text("region"),
    category: text("category"),
    contactStatus: contactStatusEnum("contact_status").default("not_contacted").notNull(),
    responseStatus: responseStatusEnum("response_status").default("not_sent").notNull(),
    decision: decisionEnum("decision").default("pending").notNull(),
    dateFirstContacted: timestamp("date_first_contacted", { withTimezone: true }),
    lastContactDate: timestamp("last_contact_date", { withTimezone: true }),
    nextFollowUpDate: timestamp("next_follow_up_date", { withTimezone: true }),
    port25Status: port25StatusEnum("port25_status").default("unknown"),
    ptrStatus: ptrStatusEnum("ptr_status").default("unknown"),
    ipv4Available: boolean("ipv4_available"),
    ipv6Available: boolean("ipv6_available"),
    mailServerAllowed: boolean("mail_server_allowed"),
    sendingRestrictions: text("sending_restrictions"),
    dailyLimit: integer("daily_limit"),
    hourlyLimit: integer("hourly_limit"),
    abusePolicyNotes: text("abuse_policy_notes"),
    startingPrice: numeric("starting_price", { precision: 12, scale: 2 }),
    currency: text("currency").default("USD"),
    billingMethod: billingMethodEnum("billing_method"),
    hourlyBilling: boolean("hourly_billing"),
    monthlyBilling: boolean("monthly_billing"),
    setupFee: numeric("setup_fee", { precision: 12, scale: 2 }),
    paymentMethod: text("payment_method"),
    refundPolicy: text("refund_policy"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: text("closed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("providers_name_idx").on(t.name),
    index("providers_decision_idx").on(t.decision),
    index("providers_contact_status_idx").on(t.contactStatus),
    index("providers_assigned_user_idx").on(t.assignedUserId),
    index("providers_country_idx").on(t.country),
    index("providers_next_follow_up_idx").on(t.nextFollowUpDate),
    uniqueIndex("providers_website_unique").on(t.website),
  ]
);

export const providerTags = pgTable(
  "provider_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [
    index("provider_tags_provider_idx").on(t.providerId),
    uniqueIndex("provider_tags_unique").on(t.providerId, t.tag),
  ]
);

export const providerContacts = pgTable(
  "provider_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    role: text("role"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("provider_contacts_provider_idx").on(t.providerId)]
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    loginUrl: text("login_url"),
    username: text("username"),
    encryptedPassword: text("encrypted_password"),
    ownerNote: text("owner_note"),
    notes: text("notes"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    updatedById: uuid("updated_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("provider_credentials_provider_idx").on(t.providerId),
  ]
);

// ─── Outreach ────────────────────────────────────────────────────────────────

export const outreachLogs = pgTable(
  "outreach_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).defaultNow().notNull(),
    channel: contactChannelEnum("channel").default("email").notNull(),
    recipient: text("recipient"),
    subject: text("subject"),
    message: text("message"),
    sentById: uuid("sent_by_id").references(() => users.id),
    sendResult: sendResultEnum("send_result").default("drafted"),
    responseDate: timestamp("response_date", { withTimezone: true }),
    responseSummary: text("response_summary"),
    nextAction: text("next_action"),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("outreach_logs_provider_idx").on(t.providerId),
    index("outreach_logs_date_idx").on(t.date),
    index("outreach_logs_follow_up_idx").on(t.followUpDate),
  ]
);

export const providerResponses = pgTable(
  "provider_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    responseDate: timestamp("response_date", { withTimezone: true }).defaultNow().notNull(),
    responseType: responseTypeEnum("response_type").notNull(),
    fullResponse: text("full_response"),
    summary: text("summary"),
    decisionRecommendation: text("decision_recommendation"),
    attachmentUrl: text("attachment_url"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("provider_responses_provider_idx").on(t.providerId),
  ]
);

// ─── Servers ─────────────────────────────────────────────────────────────────

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    plan: text("plan"),
    location: text("location"),
    operatingSystem: text("operating_system"),
    status: serverStatusEnum("status").default("pending").notNull(),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }),
    activationDate: timestamp("activation_date", { withTimezone: true }),
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    cpu: text("cpu"),
    ram: text("ram"),
    storage: text("storage"),
    bandwidth: text("bandwidth"),
    monthlyCost: numeric("monthly_cost", { precision: 12, scale: 2 }),
    hourlyCost: numeric("hourly_cost", { precision: 12, scale: 4 }),
    currency: text("currency").default("USD"),
    billingMethod: billingMethodEnum("billing_method"),
    paymentMethod: text("payment_method"),
    autoRenewal: boolean("auto_renewal").default(false),
    notes: text("notes"),
    dailySendLimit: integer("daily_send_limit"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("servers_provider_idx").on(t.providerId),
    index("servers_status_idx").on(t.status),
  ]
);

// ─── Server Users (many-to-many) ─────────────────────────────────────────────

export const serverUsers = pgTable(
  "server_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("server_users_server_idx").on(t.serverId),
    index("server_users_user_idx").on(t.userId),
  ]
);

// ─── IP Addresses ────────────────────────────────────────────────────────────

export const ipAddresses = pgTable(
  "ip_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    address: text("address").notNull(),
    ipVersion: ipVersionEnum("ip_version").default("ipv4").notNull(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    location: text("location"),
    status: ipStatusEnum("status").default("unused").notNull(),
    ptrConfigured: boolean("ptr_configured").default(false),
    ptrHostname: text("ptr_hostname"),
    port25Status: port25StatusEnum("port25_status").default("unknown"),
    assignedMailerId: uuid("assigned_mailer_id").references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ip_addresses_provider_idx").on(t.providerId),
    index("ip_addresses_server_idx").on(t.serverId),
    index("ip_addresses_status_idx").on(t.status),
    index("ip_addresses_assigned_mailer_idx").on(t.assignedMailerId),
    uniqueIndex("ip_addresses_unique").on(t.address),
  ]
);

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: campaignStatusEnum("status").default("draft").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("campaigns_status_idx").on(t.status)]
);

// ─── Daily Sending ───────────────────────────────────────────────────────────

export const sendingLogs = pgTable(
  "sending_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: timestamp("date", { withTimezone: true }).defaultNow().notNull(),
    mailerId: uuid("mailer_id")
      .notNull()
      .references(() => users.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id),
    ipAddressId: uuid("ip_address_id")
      .notNull()
      .references(() => ipAddresses.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    plannedSends: integer("planned_sends").default(0),
    actualSends: integer("actual_sends").default(0),
    successfulSends: integer("successful_sends").default(0),
    bounces: integer("bounces").default(0),
    complaints: integer("complaints").default(0),
    unsubscribes: integer("unsubscribes").default(0),
    deliveryNotes: text("delivery_notes"),
    operationalStatus: sendingStatusEnum("operational_status").default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sending_logs_date_idx").on(t.date),
    index("sending_logs_mailer_idx").on(t.mailerId),
    index("sending_logs_provider_idx").on(t.providerId),
    index("sending_logs_server_idx").on(t.serverId),
    index("sending_logs_ip_idx").on(t.ipAddressId),
  ]
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    priority: taskPriorityEnum("priority").default("medium").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: taskStatusEnum("status").default("open").notNull(),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tasks_assigned_user_idx").on(t.assignedUserId),
    index("tasks_status_idx").on(t.status),
    index("tasks_priority_idx").on(t.priority),
    index("tasks_due_date_idx").on(t.dueDate),
  ]
);

// ─── Notes ───────────────────────────────────────────────────────────────────

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    content: text("content").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    isInternal: boolean("is_internal").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notes_entity_idx").on(t.entityType, t.entityId),
    index("notes_author_idx").on(t.authorId),
  ]
);

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("attachments_entity_idx").on(t.entityType, t.entityId),
  ]
);

// ─── Imports ─────────────────────────────────────────────────────────────────

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").default("pending").notNull(),
    mode: text("mode").default("create_new"),
    totalRows: integer("total_rows").default(0),
    importedRows: integer("imported_rows").default(0),
    updatedRows: integer("updated_rows").default(0),
    skippedRows: integer("skipped_rows").default(0),
    failedRows: integer("failed_rows").default(0),
    errorLog: jsonb("error_log"),
    mappingConfig: jsonb("mapping_config"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("imports_created_by_idx").on(t.createdById),
  ]
);

// ─── Notifications ───────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").notNull(),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_read_idx").on(t.read),
  ]
);

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ]
);

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = pgTable(
  "settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// ─── Status Options (configurable by admins) ─────────────────────────────────

export const statusOptions = pgTable(
  "status_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group: text("group").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    color: text("color"),
    sortOrder: integer("sort_order").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("status_options_group_value_unique").on(t.group, t.value),
  ]
);
