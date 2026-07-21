"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Bell,
  Moon,
  Sun,
  Monitor,
  Menu,
  LogOut,
  ChevronRight,
  ChevronDown,
  Plus,
  Server,
  ListTodo,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  read: boolean;
  createdAt: string;
}

interface UrgentTask {
  id: string;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  priority: string;
  status: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  providers: "Providers",
  pipeline: "Pipeline",
  "follow-ups": "Follow-ups",
  outreach: "Contacts",
  tasks: "Tasks",
  servers: "Servers",
  sending: "Server Stats",
  campaigns: "Campaigns",
  reports: "Reports",
  imports: "Imports",
  exports: "Exports",
  users: "Team",
  audit: "Audit Log",
  settings: "Settings",
};

export function TopNav({
  onToggleSidebar,
  sidebarCollapsed: _sidebarCollapsed,
}: {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}) {
  void _sidebarCollapsed;
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  const unreadCount = notifications.filter((n) => !n.read).length + urgentTasks.length;
  const urgentTask = urgentTasks[0] || null;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data ?? []);
        setUrgentTasks(json.urgentTasks ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (notifications.length === 0) return;
    const ids = notifications.map((n) => n.id);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setNotifications([]);
      }
    } catch {
      // silently fail
    }
  };

  const userName = session?.user?.name ?? "Michael Scott";
  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as Record<string, unknown>)?.roleName as string | undefined;
  const initials = userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => ({
    label: routeLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <>
    {urgentTask && (
      <Link
        href="/tasks"
        className="flex min-h-[42px] items-center gap-3 border-b border-[#FCA5A5] bg-[#FEF2F2] px-5 text-[#991B1B] transition-colors hover:bg-[#FEE2E2]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DC2626] text-white">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">
            Urgent: {urgentTask.title}
          </p>
          <p className="truncate text-[12px] text-[#B91C1C]">
            {urgentTask.assignedUserId ? `Assigned to ${urgentTask.assignedUserName || "user"}` : "Public announcement"} · Open in Tasks
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
    )}
    <header className="h-[60px] border-b border-[#E5E7EB] bg-white flex items-center px-5 gap-4 shrink-0 z-30">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="shrink-0 h-8 w-8 text-[#6B7280] hover:text-[#111827]"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {crumb.isLast ? (
              <span className="text-[13px] font-semibold text-[#4F46E5]">{crumb.label}</span>
            ) : (
              <>
                <Link href={crumb.href} className="text-[13px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors">
                  {crumb.label}
                </Link>
                <ChevronRight className="h-3 w-3 text-[#D1D5DB]" />
              </>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 h-[38px] w-[350px] max-md:w-[200px] max-sm:w-[38px] max-sm:px-0 max-sm:justify-center rounded-[7px] border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-[13px] text-[#9CA3AF] hover:bg-[#F1F5F9] transition-colors cursor-pointer">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-sm:hidden">Search providers, contacts, servers...</span>
          <kbd className="hidden md:inline-flex ml-auto text-[10px] font-mono text-[#9CA3AF] bg-white border border-[#E5E7EB] rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>

        <div className="w-px h-5 bg-[#E5E7EB] mx-1 max-sm:mx-0" />

        {/* Add New Button */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="flex items-center gap-1.5 h-[38px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors cursor-pointer max-sm:px-2.5" />
          }>
            <Plus className="h-3.5 w-3.5" />
            <span className="max-sm:hidden">Add New</span>
            <ChevronDown className="h-3 w-3 opacity-70 max-sm:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem render={<Link href="/providers/new" className="flex items-center gap-2.5" />}>
              <Server className="h-3.5 w-3.5 text-[#6B7280]" />
              <span className="text-[13px]">Provider</span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/tasks" className="flex items-center gap-2.5" />}>
              <ListTodo className="h-3.5 w-3.5 text-[#6B7280]" />
              <span className="text-[13px]">Task</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-[#E5E7EB] mx-1" />

        {/* Notifications */}
        <Popover>
          <PopoverTrigger render={
            <button className="relative h-[38px] w-[38px] rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] transition-colors cursor-pointer" />
          }>
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#DC2626] flex items-center justify-center text-[9px] font-bold text-white px-1">
                {unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#111827]">Notifications</span>
                <button
                  className="text-[11px] text-[#6B7280] hover:text-[#4F46E5] transition-colors"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notificationsLoading ? (
                <div className="p-6 text-center text-[13px] text-[#6B7280]">Loading...</div>
              ) : notifications.length === 0 && urgentTasks.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-[#6B7280]">No new notifications</div>
              ) : (
                <>
                {urgentTasks.map((task) => (
                  <Link
                    key={`urgent-${task.id}`}
                    href="/tasks"
                    className="block border-b border-[#F1F5F9] bg-[#FEF2F2] p-3 transition-colors hover:bg-[#FEE2E2]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DC2626] text-white">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#991B1B]">{task.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[#B91C1C]">{task.description || (task.assignedUserId ? "Assigned urgent task" : "Public urgent announcement")}</p>
                        <p className="mt-1 text-[11px] text-[#DC2626]">
                          {mounted ? timeAgo(task.createdAt) : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {notifications.map((n, i) => (
                  <div
                    key={n.id}
                    className={cn(
                      "p-3 hover:bg-[#F9FAFB] transition-colors cursor-pointer",
                      i < notifications.length - 1 && "border-b border-[#F1F5F9]"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-blue-500" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#111827]">{n.title}</p>
                        <p className="text-[12px] text-[#6B7280] mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-[#9CA3AF] mt-1">
                          {mounted ? timeAgo(n.createdAt) : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="h-[38px] w-[38px] rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] transition-colors cursor-pointer" />
          }>
            {!mounted ? (
              <Monitor className="h-4 w-4" />
            ) : theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : theme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="h-3.5 w-3.5 mr-2" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="h-3.5 w-3.5 mr-2" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="h-3.5 w-3.5 mr-2" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-[#E5E7EB] mx-1" />

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="flex items-center gap-2.5 h-[38px] rounded-[7px] px-2 text-[#374151] hover:bg-[#F9FAFB] transition-colors cursor-pointer" />
          }>
            <div className="h-8 w-8 rounded-full bg-[#4F46E5] flex items-center justify-center">
              <span className="text-[11px] font-bold text-white">{initials}</span>
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-[13px] font-semibold text-[#111827] leading-none">{userName}</span>
              <span className="text-[11px] text-[#6B7280] mt-0.5">{userRole ?? "Admin"}</span>
            </div>
            <ChevronDown className="h-3 w-3 text-[#9CA3AF] ml-0.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-semibold text-[#111827]">{userName}</p>
              <p className="text-[12px] text-[#6B7280] mt-0.5">{userEmail}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" className="flex items-center gap-2.5" />}>
              <Settings className="h-3.5 w-3.5 text-[#6B7280]" />
              <span className="text-[13px]">Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[#DC2626] focus:text-[#DC2626]" onClick={() => signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-2.5" />
              <span className="text-[13px]">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}
