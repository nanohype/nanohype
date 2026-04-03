export class NanohypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NanohypeError';
  }
}

export class ManifestValidationError extends NanohypeError {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export class VariableResolutionError extends NanohypeError {
  constructor(message: string) {
    super(message);
    this.name = 'VariableResolutionError';
  }
}
