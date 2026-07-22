import React from "react";
import { Icon, Icon as Mark, type IconProps } from "../../components/ui/icon";

export function Icons({ className }: { className: IconProps["className"] }) {
  return (
    <div>
      <Icon className="h-8 w-8" />
      <Icon className="h-8 w-8" size={32} />
      <Icon className="h-8 w-8" size={16} />
      <Icon className={className} />
      <Mark className="h-8 w-8" />
      <Icon className="h-6 w-6" />
    </div>
  );
}
