export const PERMISSIONS = {
  PROVIDERS: {
    VIEW: "providers.view",
    CREATE: "providers.create",
    EDIT: "providers.edit",
    DELETE: "providers.delete",
    ASSIGN: "providers.assign",
  },
  SERVERS: {
    VIEW: "servers.view",
    CREATE: "servers.create",
    EDIT: "servers.edit",
    DELETE: "servers.delete",
  },
  IP_ADDRESSES: {
    VIEW: "ip_addresses.view",
    CREATE: "ip_addresses.create",
    EDIT: "ip_addresses.edit",
    DELETE: "ip_addresses.delete",
  },
  OUTREACH: {
    VIEW: "outreach.view",
    CREATE: "outreach.create",
    EDIT: "outreach.edit",
  },
  RESPONSES: {
    VIEW: "responses.view",
    CREATE: "responses.create",
  },
  SENDING: {
    VIEW: "sending.view",
    CREATE: "sending.create",
    EDIT: "sending.edit",
  },
  TASKS: {
    VIEW: "tasks.view",
    CREATE: "tasks.create",
    EDIT: "tasks.edit",
  },
  USERS: {
    VIEW: "users.view",
    CREATE: "users.create",
    EDIT: "users.edit",
    DISABLE: "users.disable",
  },
  REPORTS: {
    VIEW: "reports.view",
  },
  IMPORTS: {
    CREATE: "imports.create",
  },
  EXPORTS: {
    CREATE: "exports.create",
  },
  AUDIT: {
    VIEW: "audit.view",
  },
  SETTINGS: {
    MANAGE: "settings.manage",
  },
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group)
);

export const DEFAULT_ROLES = {
  ADMIN: "admin",
  MAILER: "mailer",
} as const;

export const ADMIN_PERMISSIONS = ALL_PERMISSIONS;

export const MAILER_PERMISSIONS = [
  PERMISSIONS.PROVIDERS.VIEW,
  PERMISSIONS.SERVERS.VIEW,
  PERMISSIONS.IP_ADDRESSES.VIEW,
  PERMISSIONS.OUTREACH.VIEW,
  PERMISSIONS.OUTREACH.CREATE,
  PERMISSIONS.OUTREACH.EDIT,
  PERMISSIONS.RESPONSES.VIEW,
  PERMISSIONS.SENDING.VIEW,
  PERMISSIONS.SENDING.CREATE,
  PERMISSIONS.SENDING.EDIT,
  PERMISSIONS.TASKS.VIEW,
  PERMISSIONS.TASKS.CREATE,
  PERMISSIONS.TASKS.EDIT,
  PERMISSIONS.EXPORTS.CREATE,
];

export type Permission = (typeof ALL_PERMISSIONS)[number];

export function hasPermission(userPermissions: string[], permission: string): boolean {
  return userPermissions.includes(permission);
}

export function hasAnyPermission(
  userPermissions: string[],
  permissions: string[]
): boolean {
  return permissions.some((p) => userPermissions.includes(p));
}
