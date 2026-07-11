import React from "react";
import type { ReactNode } from "react";

type CardProps = {
  className?: "card" | "featured" | "small" | "large";
  children: ReactNode;
};

export function Card({
  className = "card",
  children,
}: CardProps) {
  return <div className={className}>{children}</div>;
}
