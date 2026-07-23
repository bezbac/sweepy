import { Context, Effect, Layer } from "effect";
import { Project, type ProjectOptions } from "ts-morph";

import { preserveSweepyError } from "./errors";

export class TsMorphProject extends Context.Service<TsMorphProject, Project>()(
  "sweepy/TsMorphProject",
) {
  static readonly layer = (options: ProjectOptions) =>
    Layer.effect(
      TsMorphProject,
      Effect.try({
        try: () => new Project(options),
        catch: preserveSweepyError,
      }),
    );
}
