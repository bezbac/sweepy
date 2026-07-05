import React from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

function getButtonClass() {
  return "bg-green-500";
}

export default function HomePage() {
  const isMobile = window.innerWidth < 768;
  return (
    <main>
      <Button className="bg-blue-500 text-white" size={32}>
        Get Started
      </Button>
      <Button className="rounded-md px-3">Learn More</Button>
      <Button className={getButtonClass()}>Submit</Button>
      {isMobile ? (
        <Logo size={16} className="h-6 w-6" />
      ) : (
        <Logo size={32} className="h-8 w-8" />
      )}
    </main>
  );
}
