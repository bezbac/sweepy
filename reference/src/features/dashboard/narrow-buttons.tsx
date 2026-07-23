import React from "react";

import DefaultNarrowButton, * as NarrowButtonsNamespace from "../../components/ui/narrow-button";
import {
  NarrowButton,
  NarrowButton as Action,
} from "../../components/ui/narrow-button";
import { BarrelButton } from "../../components/ui/narrow-button-barrel";

const sharedButtonProps = {
  title: "Save changes",
  type: "button" as const,
};

export function NarrowButtons() {
  return (
    <div>
      <NarrowButton className="primary" {...sharedButtonProps}>
        Save
      </NarrowButton>
      <Action variant="secondary" aria-label="Cancel" />
      <DefaultNarrowButton name="default" />
      <NarrowButtonsNamespace.NarrowButton form="settings" />
      <BarrelButton autoFocus />
    </div>
  );
}
