export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  roleId: string;
  roleName: string;
  status: "active" | "suspended" | "inactive";
}

export interface Provider {
  id: string;
  name: string;
  website?: string | null;
  supportEmail?: string | null;
  salesEmail?: string | null;
  contactFormUrl?: string | null;
  country?: string | null;
  region?: string | null;
  category?: string | null;
  contactStatus: string;
  responseStatus: string;
  decision: string;
  dateFirstContacted?: Date | null;
  lastContactDate?: Date | null;
  nextFollowUpDate?: Date | null;
  port25Status?: string | null;
  ptrStatus?: string | null;
  ipv4Available?: boolean | null;
  ipv6Available?: boolean | null;
  mailServerAllowed?: boolean | null;
  sendingRestrictions?: string | null;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  abusePolicyNotes?: string | null;
  startingPrice?: string | null;
  currency?: string | null;
  billingMethod?: string | null;
  hourlyBilling?: boolean | null;
  monthlyBilling?: boolean | null;
  setupFee?: string | null;
  paymentMethod?: string | null;
  refundPolicy?: string | null;
  assignedUserId?: string | null;
  createdById: string;
  closedAt?: Date | null;
  closedReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Server {
  id: string;
  name: string;
  providerId: string;
  plan?: string | null;
  location?: string | null;
  operatingSystem?: string | null;
  status: string;
  purchaseDate?: Date | null;
  activationDate?: Date | null;
  expirationDate?: Date | null;
  cpu?: string | null;
  ram?: string | null;
  storage?: string | null;
  bandwidth?: string | null;
  monthlyCost?: string | null;
  hourlyCost?: string | null;
  currency?: string | null;
  billingMethod?: string | null;
  paymentMethod?: string | null;
  autoRenewal?: boolean | null;
  notes?: string | null;
  assignedMailerId?: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IpAddress {
  id: string;
  address: string;
  ipVersion: string;
  providerId: string;
  serverId: string;
  location?: string | null;
  status: string;
  ptrConfigured?: boolean | null;
  ptrHostname?: string | null;
  port25Status?: string | null;
  assignedMailerId?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutreachLog {
  id: string;
  providerId: string;
  date: Date;
  channel: string;
  recipient?: string | null;
  subject?: string | null;
  message?: string | null;
  sentById?: string | null;
  sendResult: string;
  responseDate?: Date | null;
  responseSummary?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendingLog {
  id: string;
  date: Date;
  mailerId: string;
  providerId: string;
  serverId: string;
  ipAddressId: string;
  campaignId?: string | null;
  plannedSends: number;
  actualSends: number;
  successfulSends: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
  deliveryNotes?: string | null;
  operationalStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  assignedUserId?: string | null;
  priority: string;
  dueDate?: Date | null;
  status: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdById: string;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  totalProviders: number;
  contactedProviders: number;
  awaitingContact: number;
  awaitingResponse: number;
  acceptedProviders: number;
  deniedProviders: number;
  prohibitedProviders: number;
  activeServers: number;
  activeIpAddresses: number;
  totalSendsToday: number;
  totalSendsThisMonth: number;
}
