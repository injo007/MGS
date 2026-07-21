"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Server,
  Mail,
  BarChart3,
  FileSpreadsheet,
  Users,
  ScrollText,
  Settings,
  ChevronDown,
  Cloud,
  ListTodo,
  MessageSquare,
  Download,
  Upload,
  Activity,
  Workflow,
  HelpCircle,
  ExternalLink,
  Clock,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Providers", href: "/providers", icon: Server },
  { label: "Servers", href: "/servers", icon: Cloud },
  { label: "Server Stats", href: "/sending", icon: Activity },
  { label: "Pipeline", href: "/pipeline", icon: Workflow },
  { label: "Provider Responses", href: "/provider-responses", icon: MessageSquare },
  { label: "Follow-ups", href: "/follow-ups", icon: Clock },
  { label: "Email Inbox", href: "/email-inbox", icon: Mail },
  { label: "Contacts", href: "/outreach", icon: Users },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Team", href: "/users", icon: Users },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Audit Log", href: "/audit", icon: ScrollText },
  {
    label: "Import / Export",
    icon: FileSpreadsheet,
    children: [
      { label: "Imports", href: "/imports", icon: Upload },
      { label: "Exports", href: "/exports", icon: Download },
    ],
  },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [taskCount, setTaskCount] = useState<string | null>(null);
  const visibleNavigation = navigation.filter((item) => {
    if (["Pipeline", "Team", "Audit Log", "Import / Export", "Settings"].includes(item.label)) return isAdmin;
    return true;
  });

  useEffect(() => {
    fetch("/api/tasks?status=open&pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.total !== undefined) {
          setTaskCount(json.total > 99 ? "99+" : String(json.total));
        }
      })
      .catch(() => {});
  }, []);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isGroupActive = (item: NavItem) => {
    if (item.href) return isActive(item.href);
    return item.children?.some((child) => isActive(child.href)) ?? false;
  };

  const renderNavItem = (item: NavItem, depth = 0) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    const groupActive = isGroupActive(item);
    const expanded = expandedGroups.includes(item.label) || groupActive;
    const badge = item.label === "Tasks" && taskCount ? taskCount : item.badge;

    if (item.children) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleGroup(item.label)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-3 py-[11px] text-[13px] font-medium transition-all duration-150",
              collapsed ? "justify-center" : "",
              groupActive
                ? "bg-[#1E2A5E] text-white"
                : "text-[#CBD5E1] hover:bg-white/[0.06] hover:text-[#E2E8F0]"
            )}
          >
            <Icon className={cn("h-[19px] w-[19px] shrink-0", groupActive ? "text-[#6366F1]" : "")} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-50",
                    expanded ? "rotate-180" : ""
                  )}
                />
              </>
            )}
          </button>
          {!collapsed && expanded && (
            <div className="mt-0.5 ml-5 pl-4 border-l border-white/10 space-y-0.5">
              {item.children.map((child) => renderNavItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href!}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-[11px] text-[13px] font-medium transition-all duration-150",
          depth > 0 ? "py-[10px]" : "",
          collapsed ? "justify-center" : "",
          active
            ? "bg-[#1E2A5E] text-white"
            : "text-[#CBD5E1] hover:bg-white/[0.06] hover:text-[#E2E8F0]"
        )}
      >
        <Icon className={cn("h-[19px] w-[19px] shrink-0", active ? "text-[#6366F1]" : "")} />
        {!collapsed && (
          <>
            <span>{item.label}</span>
            {badge && (
              <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[#312E81] px-1.5 text-[10px] font-semibold text-[#E0E7FF]">
                {badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
      style={{
        background: "linear-gradient(180deg, #0F172A 0%, #0B1526 100%)",
      }}
    >
      {/* Sidebar Header */}
      <div className={cn(
        "flex items-center h-16 border-b border-white/10 shrink-0",
        collapsed ? "justify-center px-2" : "px-4"
      )}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#4F46E5] shrink-0">
            <Cloud className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[16px] font-bold text-white tracking-tight">ServerOps</span>
              <span className="text-[11px] text-[#818CF8] font-medium uppercase tracking-[0.08em]">
                CRM
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {visibleNavigation.map((item) => renderNavItem(item))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Help Section */}
          <div className="rounded-lg bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle className="h-3.5 w-3.5 text-[#818CF8]" />
              <span className="text-[11px] font-medium text-[#E2E8F0]">Need help?</span>
            </div>
            <button className="flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors">
              View documentation
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>

          <div className="h-px bg-white/10" />

          {/* Plan Info */}
          <div className="px-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-[#E2E8F0]">Pro Plan</span>
              <span className="text-[10px] text-[#94A3B8]">78%</span>
            </div>
            <p className="text-[10px] text-[#64748B] mb-2">Renews on Jun 30, 2025</p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#6366F1] rounded-full" style={{ width: "78%" }} />
            </div>
            <p className="text-[10px] text-[#64748B] mt-1.5">
              37 / 50 team members
            </p>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="px-3 pb-3">
          <div className="flex justify-center">
            <HelpCircle className="h-4 w-4 text-[#64748B]" />
          </div>
        </div>
      )}
    </aside>
  );
}
