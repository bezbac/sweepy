import { Effect, Terminal } from "effect";

export const confirm = (message: string) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    yield* terminal.display(`${message} [y/N] `);
    const answer = yield* terminal.readLine;
    const normalizedAnswer = answer.trim().toLowerCase();
    return normalizedAnswer === "y" || normalizedAnswer === "yes";
  });
