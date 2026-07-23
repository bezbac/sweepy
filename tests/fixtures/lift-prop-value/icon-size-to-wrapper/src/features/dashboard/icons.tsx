import React from "react";
import type { ReactNode } from "react";

import { Icon, Icon as Mark, type IconProps } from "../../components/ui/icon";

function Wrapper({ size, children }: { size: 32; children: ReactNode }) {
  return <div data-size={size}>{children}</div>;
}

export function Icons({ className }: { className: IconProps["className"] }) {
  return (
    <div>
      <Icon className="h-8 w-8">Featured</Icon>
      <Wrapper size={32}><Icon className="h-8 w-8" /></Wrapper>
      <Icon className="h-8 w-8" size={16} />
      <Icon className={className} />
      <Mark className="h-8 w-8" />
      <Icon className="h-6 w-6" />
    </div>
  );
}
