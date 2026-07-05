import React from "react";
import type { ReactNode } from "react";

type LogoProps = {
  size?: number;
  className?: string;
  children?: ReactNode;
};

export function Logo({
  size = 16,
  className = "h-6 w-6",
  children,
}: LogoProps) {
  return (
    <svg className={className} width={size} height={size}>
      {children}
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
