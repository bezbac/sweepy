import React from "react";
import type { ReactNode } from "react";
import { Icon, Icon as Mark, type IconProps } from "../../components/ui/icon";

function Wrapper({ size, children }: { size: 32; children: ReactNode }) {
  return <div data-size={size}>{children}</div>;
}

export function Icons({ className }: { className: IconProps["className"] }) {
  return (
    <div>
      <div className="h-8 w-8"><Icon>Featured</Icon></div>
      <div className="h-8 w-8"><Icon size={32} /></div>
      <div className="h-8 w-8"><Icon size={16} /></div>
      <Icon className={className} />
      <div className="h-8 w-8"><Mark /></div>
      <Icon className="h-6 w-6" />
    </div>
  );
}
