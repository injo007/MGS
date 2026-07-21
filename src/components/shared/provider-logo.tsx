"use client";

import { useMemo, useState } from "react";
import { getProviderFaviconUrl, getProviderLogoUrl } from "@/lib/provider-utils";

type ProviderLogoProps = {
  name: string;
  website: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-7 w-7 rounded-[6px] text-[9px]",
  md: "h-8 w-8 rounded-[7px] text-[10px]",
  lg: "h-12 w-12 rounded-[10px] text-[16px]",
};

export function ProviderLogo({ name, website, size = "sm", className = "" }: ProviderLogoProps) {
  const sources = useMemo(() => [getProviderLogoUrl(website), getProviderFaviconUrl(website)].filter(Boolean) as string[], [website]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];
  const initials = name.slice(0, 2).toUpperCase();
  const sizeClass = SIZE_CLASS[size];

  if (!src) {
    return (
      <span className={`flex shrink-0 items-center justify-center bg-[#EEF2FF] font-bold text-[#4F46E5] ${sizeClass} ${className}`}>
        {initials}
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-[#E5E7EB] bg-white ${sizeClass} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain"
        onError={() => {
          if (sourceIndex < sources.length - 1) {
            setSourceIndex((value) => value + 1);
          } else {
            setSourceIndex(sources.length);
          }
        }}
      />
      {sourceIndex >= sources.length && (
        <span className={`flex h-full w-full items-center justify-center bg-[#EEF2FF] font-bold text-[#4F46E5] ${SIZE_CLASS[size]}`}>
          {initials}
        </span>
      )}
    </span>
  );
}
