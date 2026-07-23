import React from "react";
import type { ReactNode } from "react";

import { Icon, Icon as Mark, type IconProps } from "../../components/ui/icon";

function Wrapper({ size, children }: { size: 32; children: ReactNode }) {
  return <div data-size={size}>{children}</div>;
}

export function Icons({ className }: { className: IconProps["className"] }) {
  return (
    <div>
      <Icon size={32}>Featured</Icon>
      <Icon size={32} />
      <Icon className="h-8 w-8" size={16} />
      <Icon className={className} />
      <Mark size={32} />
      <Icon className="h-6 w-6" />
    </div>
  );
}
