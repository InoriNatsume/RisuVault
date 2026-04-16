import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { UserError } from "./errors.js";

export async function acquirePassphrase(): Promise<string> {
  const fromEnv = process.env.RISUVAULT_PASSPHRASE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!stdin.isTTY) {
    throw new UserError(
      "no passphrase: set RISUVAULT_PASSPHRASE or run interactively"
    );
  }
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const pw = await rl.question("Vault passphrase: ");
    if (!pw) throw new UserError("empty passphrase");
    return pw;
  } finally {
    rl.close();
  }
}
