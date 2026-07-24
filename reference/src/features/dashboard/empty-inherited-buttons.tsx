import React from "react";

import { EmptyInheritedAlias } from "../../components/ui/empty-inherited-alias";
import { EmptyInheritedInterface } from "../../components/ui/empty-inherited-interface";
import { EmptyInheritedOnly } from "../../components/ui/empty-inherited-only";

export function EmptyInheritedButtons() {
  return (
    <div>
      <EmptyInheritedAlias />
      <EmptyInheritedInterface />
      <EmptyInheritedOnly />
    </div>
  );
}
