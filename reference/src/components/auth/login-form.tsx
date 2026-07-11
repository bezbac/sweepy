import React from "react";
import { Button as SubmitButton } from "@/components/ui/button";

export function LoginForm() {
  return (
    <form>
      <SubmitButton className="px-4 py-2 w-full">Sign In</SubmitButton>
    </form>
  );
}
