import { Data } from "effect";

/** The explicit component file could not be loaded into the project. */
export class ComponentFileNotFoundError extends Data.TaggedError(
  "ComponentFileNotFoundError",
)<{ readonly filePath: string }> {}

/** No component with the requested name exists under the search root. */
export class ComponentNotFoundError extends Data.TaggedError(
  "ComponentNotFoundError",
)<{
  readonly componentName: string;
  readonly searchRoot: string;
}> {}

/** The explicit component file does not declare the requested component. */
export class ComponentNotFoundInFileError extends Data.TaggedError(
  "ComponentNotFoundInFileError",
)<{
  readonly componentName: string;
  readonly filePath: string;
}> {}

/** More than one component matches and an explicit file is required. */
export class AmbiguousComponentError extends Data.TaggedError(
  "AmbiguousComponentError",
)<{ readonly componentName: string }> {}

/** The configured search root contains no TypeScript source files. */
export class NoSourceFilesError extends Data.TaggedError("NoSourceFilesError")<{
  readonly searchRoot: string;
}> {}

/** The requested prop does not exist on the configured props declaration. */
export class PropNotFoundError extends Data.TaggedError("PropNotFoundError")<{
  readonly propName: string;
  readonly propsTypeName: string;
}> {}

/** A prop must have a finite literal type before it can be transformed. */
export class PropNotMaterializedError extends Data.TaggedError(
  "PropNotMaterializedError",
)<{
  readonly propName: string;
  readonly propsTypeName: string;
}> {}

/** A provided value is not a member of the prop's finite literal type. */
export class PropValueNotFoundError extends Data.TaggedError(
  "PropValueNotFoundError",
)<{
  readonly input: string;
  readonly propName: string;
  readonly allowedValues: ReadonlyArray<string | number>;
}> {}

/** Replace was configured with the same source and target prop. */
export class IdenticalSourceAndTargetPropError extends Data.TaggedError(
  "IdenticalSourceAndTargetPropError",
)<{ readonly propName: string }> {}

/** The component's props declaration could not be located. */
export class PropsTypeNotFoundError extends Data.TaggedError(
  "PropsTypeNotFoundError",
)<{ readonly propsTypeName: string }> {}

/** Inline props could not be extracted beside the component declaration. */
export class PropsExtractionFailedError extends Data.TaggedError(
  "PropsExtractionFailedError",
)<{
  readonly propsTypeName: string;
  readonly filePath: string;
}> {}

/** The component declaration is not one of the supported function forms. */
export class UnsupportedComponentDeclarationError extends Data.TaggedError(
  "UnsupportedComponentDeclarationError",
)<{ readonly componentName: string }> {}

/** Materialization found no statically supported values for the prop. */
export class NoSupportedPropValuesError extends Data.TaggedError(
  "NoSupportedPropValuesError",
)<{
  readonly componentName: string;
  readonly propName: string;
}> {}

/** A className concatenation unexpectedly contained a non-string fragment. */
export class InvalidClassNameFragmentsError extends Data.TaggedError(
  "InvalidClassNameFragmentsError",
)<{
  readonly left: string | number;
  readonly right: string | number;
}> {}

/** A changed file was unexpectedly absent from the in-memory project. */
export class ChangedSourceFileNotFoundError extends Data.TaggedError(
  "ChangedSourceFileNotFoundError",
)<{ readonly filePath: string }> {}

/** Reading the original source text for a dry-run diff failed. */
export class SourceFileReadFailedError extends Data.TaggedError(
  "SourceFileReadFailedError",
)<{
  readonly filePath: string;
  readonly cause: unknown;
}> {}

/** Generating a dry-run patch for a source file failed. */
export class DiffGenerationFailedError extends Data.TaggedError(
  "DiffGenerationFailedError",
)<{
  readonly filePath: string;
  readonly cause: unknown;
}> {}

/** Persisting the transformed ts-morph project failed. */
export class ProjectSaveFailedError extends Data.TaggedError(
  "ProjectSaveFailedError",
)<{ readonly cause: unknown }> {}

/** Reading the interactive confirmation failed. */
export class ConfirmationFailedError extends Data.TaggedError(
  "ConfirmationFailedError",
)<{ readonly cause: unknown }> {}

/** Mutually exclusive write-mode flags were supplied together. */
export class InvalidWriteModeError extends Data.TaggedError(
  "InvalidWriteModeError",
)<{
  readonly yes: boolean;
  readonly dryRun: boolean;
}> {}

/** An unexpected dependency failure escaped an operation. */
class UnexpectedFailureError extends Data.TaggedError(
  "UnexpectedFailureError",
)<{ readonly cause: unknown }> {}

export type SweepyError =
  | ComponentFileNotFoundError
  | ComponentNotFoundError
  | ComponentNotFoundInFileError
  | AmbiguousComponentError
  | NoSourceFilesError
  | PropNotFoundError
  | PropNotMaterializedError
  | PropValueNotFoundError
  | IdenticalSourceAndTargetPropError
  | PropsTypeNotFoundError
  | PropsExtractionFailedError
  | UnsupportedComponentDeclarationError
  | NoSupportedPropValuesError
  | InvalidClassNameFragmentsError
  | ChangedSourceFileNotFoundError
  | SourceFileReadFailedError
  | DiffGenerationFailedError
  | ProjectSaveFailedError
  | ConfirmationFailedError
  | InvalidWriteModeError
  | UnexpectedFailureError;

const sweepyErrorTags: Readonly<Record<SweepyError["_tag"], true>> = {
  ComponentFileNotFoundError: true,
  ComponentNotFoundError: true,
  ComponentNotFoundInFileError: true,
  AmbiguousComponentError: true,
  NoSourceFilesError: true,
  PropNotFoundError: true,
  PropNotMaterializedError: true,
  PropValueNotFoundError: true,
  IdenticalSourceAndTargetPropError: true,
  PropsTypeNotFoundError: true,
  PropsExtractionFailedError: true,
  UnsupportedComponentDeclarationError: true,
  NoSupportedPropValuesError: true,
  InvalidClassNameFragmentsError: true,
  ChangedSourceFileNotFoundError: true,
  SourceFileReadFailedError: true,
  DiffGenerationFailedError: true,
  ProjectSaveFailedError: true,
  ConfirmationFailedError: true,
  InvalidWriteModeError: true,
  UnexpectedFailureError: true,
};

export const isSweepyError = (cause: unknown): cause is SweepyError => {
  if (typeof cause !== "object" || cause === null || !("_tag" in cause)) {
    return false;
  }
  const tag = cause._tag;
  return typeof tag === "string" && tag in sweepyErrorTags;
};

export const preserveSweepyError = (cause: unknown): SweepyError =>
  isSweepyError(cause) ? cause : new UnexpectedFailureError({ cause });
