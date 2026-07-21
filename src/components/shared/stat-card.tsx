"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/5",
  loading = false,
  className,
}: {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("bg-white rounded-[10px] border border-[#E5E7EB] p-4 min-h-[115px]", className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-7 w-16 mb-1.5" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-[10px] border border-[#E5E7EB] p-4 min-h-[115px] hover:shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        {change !== undefined && (
          <div className={cn(
            "flex items-center gap-0.5 text-[11px] font-medium",
            change > 0 ? "text-emerald-600" : change < 0 ? "text-red-500" : "text-[#6B7280]"
          )}>
            {change > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : change < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <p className="text-[22px] font-bold tracking-tight text-[#111827]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-[12px] text-[#6B7280] mt-0.5">
        {changeLabel ?? title}
      </p>
    </div>
  );
}
