import React from "react";
import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="border rounded shadow">{children}</div>;
}
