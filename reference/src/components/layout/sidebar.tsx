import React from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const SIDEBAR_CLASS = "text-sm";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside>
      <Button className={collapsed ? "hidden" : undefined}>Menu</Button>
      <Button className={SIDEBAR_CLASS}>Close</Button>
      <Logo className="h-8 w-8">
        <title>Menu Icon</title>
      </Logo>
    </aside>
  );
}
