import React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

function getButtonClass() {
  return "bg-green-500";
}

export default function HomePage() {
  const isMobile = window.innerWidth < 768;
  return (
    <main>
      <Button variant="primary" className="bg-blue-500 text-white" size={32}>
        Get Started
      </Button>
      <Button
        variant={isMobile ? "compact" : "wide"}
        className={isMobile ? isMobile ? "base mobile compact" : "base mobile" : isMobile ? "base desktop compact" : "base desktop"}
      >
        Learn More
      </Button>
      <Button variant={getButtonClass()} className={getButtonClass()}>
        Submit
      </Button>
      <Card className="featured">Featured</Card>
      <Card className={isMobile ? "small" : "large"}>Responsive</Card>
      {isMobile ? (
        <Logo size={16} className="h-6 w-6" />
      ) : (
        <Logo size={32} className="h-8 w-8" />
      )}
    </main>
  );
}
