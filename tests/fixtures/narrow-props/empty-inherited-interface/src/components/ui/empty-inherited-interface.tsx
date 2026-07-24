import React from "react";

export interface EmptyInheritedInterfaceProps {
  active?: boolean;
}

export function EmptyInheritedInterface({
  active = false,
}: EmptyInheritedInterfaceProps) {
  return <button data-active={active} />;
}
