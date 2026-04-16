export class VaultError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = "VaultError";
  }
}

export class AuthError extends VaultError {
  constructor(msg = "authentication failed") {
    super(msg, 3);
    this.name = "AuthError";
  }
}

export class NotInitializedError extends VaultError {
  constructor() {
    super("no .risuvault found; run `risuvault init` first", 1);
    this.name = "NotInitializedError";
  }
}

export class UserError extends VaultError {
  constructor(msg: string) {
    super(msg, 1);
    this.name = "UserError";
  }
}
