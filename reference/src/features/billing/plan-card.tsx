import React from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

function getDynamicClass() {
  return "text-pro";
}

export function PlanCard({ isPro }: { isPro: boolean }) {
  return (
    <div>
      <Button className={`rounded-lg ${isPro ? "border-gold" : ""}`}>
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
