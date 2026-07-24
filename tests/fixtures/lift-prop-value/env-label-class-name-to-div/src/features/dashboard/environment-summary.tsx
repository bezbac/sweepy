import React from "react";

import { EnvLabel } from "../../components/ui/env-label";

export function EnvironmentSummary() {
  return (
    <section aria-labelledby="environment-heading">
      <h2 id="environment-heading">Environment</h2>
      <div className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"><EnvLabel /></div>
    </section>
  );
}
