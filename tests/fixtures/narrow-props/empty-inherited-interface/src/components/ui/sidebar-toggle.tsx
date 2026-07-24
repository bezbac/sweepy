import React from "react";

export interface SidebarToggleProps {
  expanded?: boolean;
}

export function SidebarToggle({ expanded = false }: SidebarToggleProps) {
  return (
    <button type="button" aria-expanded={expanded}>
      Navigation
    </button>
  );
}
