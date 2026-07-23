"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { ChatProvider } from "@/components/ai/chat-provider";
import { LiveLogPanel } from "@/components/logs/live-log-panel";

const SIDEBAR_KEY = "cloudops-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored !== null) setCollapsed(stored === "true");
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {}
        return next;
      });
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={mounted ? collapsed : false} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 h-full w-[min(86vw,280px)]">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopNav
          onToggleSidebar={toggle}
          sidebarCollapsed={mounted ? collapsed : false}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="min-w-0 px-3 py-4 sm:px-6 sm:py-5">{children}</div>
        </main>
      </div>
      <LiveLogPanel />
      <ChatProvider />
    </div>
  );
}
