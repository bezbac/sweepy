import React from "react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

function getDynamicClass() {
  return "text-pro" as const;
}

export function PlanCard({ isPro }: { isPro: boolean }) {
  return (
    <div>
      <Button className={isPro ? "rounded-lg border-gold" : "rounded-lg"}>
        Upgrade
      </Button>
      <Button className={getDynamicClass()}>Details</Button>
      <Logo
        size={32}
        className="hidden scale-120 group-data-[collapsible=icon]:block"
      />
    </div>
  );
}
