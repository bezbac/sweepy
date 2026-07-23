import React from "react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const styles = {
  overviewButton: "bg-gray-100",
};

function getIconClass() {
  return "text-blue-500";
}

export function Overview() {
  return (
    <div>
      <Button className="flex items-center">Dashboard</Button>
      <Button size={24}>Refresh</Button>
      <Button className={styles.overviewButton}>Settings</Button>
      <Logo size={28} className="h-8 w-8" />
      <Logo size={24} className={getIconClass()} />
    </div>
  );
}
