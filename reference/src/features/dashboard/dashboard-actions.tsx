import React from "react";

import { DismissButton } from "../../components/ui/dismiss-button";
import { FilterToggle } from "../../components/ui/filter-toggle";
import { RefreshButton } from "../../components/ui/refresh-button";
import { SearchButton } from "../../components/ui/search-button";
import { SidebarToggle } from "../../components/ui/sidebar-toggle";

export function DashboardActions() {
  return (
    <nav aria-label="Dashboard actions">
      <FilterToggle />
      <SidebarToggle />
      <SearchButton />
      <RefreshButton />
      <DismissButton />
    </nav>
  );
}
