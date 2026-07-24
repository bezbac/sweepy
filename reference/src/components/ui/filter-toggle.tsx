import React from "react";

export type FilterToggleProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    selected?: boolean;
  };

export function FilterToggle({ selected = false }: FilterToggleProps) {
  return (
    <button type="button" aria-pressed={selected}>
      Filters
    </button>
  );
}
