import React from "react";

import { ForwardRefButton } from "../../components/ui/forward-ref-button";

export function ForwardRefButtons() {
  return (
    <div>
      <ForwardRefButton className="primary" />
      <ForwardRefButton className="secondary" />
    </div>
  );
}
