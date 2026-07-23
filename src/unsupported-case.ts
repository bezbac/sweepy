export type UnsupportedReason =
  | { readonly kind: "prop-value-not-static" }
  | { readonly kind: "jsx-element-not-found"; readonly componentName: string }
  | { readonly kind: "target-prop-conflict"; readonly propName: string }
  | { readonly kind: "spread-props-not-static" }
  | { readonly kind: "component-props-not-static" }
  | { readonly kind: "props-type-not-resolved" }
  | { readonly kind: "props-interface-unsupported" }
  | { readonly kind: "props-type-unsupported" }
  | {
      readonly kind: "props-type-not-component";
      readonly propsTypeName: string;
    }
  | {
      readonly kind: "props-type-shared";
      readonly propsTypeName: string;
      readonly componentName: string;
    }
  | {
      readonly kind: "component-unsupported-reference";
      readonly componentName: string;
    };

export type UnsupportedCase =
  | {
      readonly kind: "usage";
      readonly filePath: string;
      readonly lineNumber: number;
      readonly source: string;
      readonly reason: UnsupportedReason;
    }
  | {
      readonly kind: "component";
      readonly filePath: string;
      readonly reason: UnsupportedReason;
    };

const assertUnreachable = (input: never): never => {
  throw new Error(`Unhandled unsupported reason: ${JSON.stringify(input)}`);
};

const formatUnsupportedReason = (reason: UnsupportedReason) => {
  if (reason.kind === "prop-value-not-static") {
    return "prop value cannot be statically evaluated";
  }
  if (reason.kind === "jsx-element-not-found") {
    return `could not find full ${reason.componentName} JSX element`;
  }
  if (reason.kind === "target-prop-conflict") {
    return `${reason.propName} already exists with a different value`;
  }
  if (reason.kind === "spread-props-not-static") {
    return "spread props cannot be statically enumerated";
  }
  if (reason.kind === "component-props-not-static") {
    return "component props usage cannot be statically enumerated";
  }
  if (reason.kind === "props-type-not-resolved") {
    return "props type could not be resolved";
  }
  if (reason.kind === "props-interface-unsupported") {
    return "props interface has unsupported members";
  }
  if (reason.kind === "props-type-unsupported") {
    return "props type has an unsupported union or member";
  }
  if (reason.kind === "props-type-not-component") {
    return `${reason.propsTypeName} is not the component's props type`;
  }
  if (reason.kind === "props-type-shared") {
    return `${reason.propsTypeName} is shared outside ${reason.componentName}`;
  }
  if (reason.kind === "component-unsupported-reference") {
    return `${reason.componentName} is referenced through an unsupported alias or wrapper`;
  }
  return assertUnreachable(reason);
};

export const formatUnsupportedCases = (
  unsupported: ReadonlyArray<UnsupportedCase>,
) =>
  unsupported
    .map((item) => {
      const reason = formatUnsupportedReason(item.reason);
      if (item.kind === "usage") {
        return `  ${item.filePath}:${item.lineNumber} ${item.source} (${reason})`;
      }
      return `  ${item.filePath}: ${reason}`;
    })
    .join("\n");
