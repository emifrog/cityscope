/** Base class of expected business errors, each mapped to a stable API error code. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class Unauthenticated extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  constructor(message = 'Authentification requise.') {
    super(message);
    this.name = 'Unauthenticated';
  }
}

/** Too many requests of a kind in a window (SEC-03): retry after the given delay. */
export class RateLimited extends DomainError {
  readonly code = 'RATE_LIMITED';
  constructor(
    readonly retryAfterSeconds: number,
    /** First refusal of the window: the one worth tracing (the next ones would flood the audit). */
    readonly firstRefusal = false,
    message = 'Trop de requêtes : réessayez dans quelques minutes.',
  ) {
    super(message);
    this.name = 'RateLimited';
  }
}

export class AccessDenied extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor(message = 'Accès refusé.') {
    super(message);
    this.name = 'AccessDenied';
  }
}

export class TenantRequired extends DomainError {
  readonly code = 'TENANT_REQUIRED';
  constructor(message = 'Le SIS actif doit être précisé (en-tête X-Tenant-Id).') {
    super(message);
    this.name = 'TenantRequired';
  }
}

export class NotFound extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(message = 'Ressource introuvable.') {
    super(message);
    this.name = 'NotFound';
  }
}

export class InvalidTransition extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transition interdite : ${from} → ${to}.`);
    this.name = 'InvalidTransition';
  }
}

export class SelfApprovalForbidden extends DomainError {
  readonly code = 'SELF_APPROVAL_FORBIDDEN';
  constructor() {
    super('Le validateur ne peut pas valider une révision à laquelle il a contribué.');
    this.name = 'SelfApprovalForbidden';
  }
}

export class StrongAuthenticationRequired extends DomainError {
  readonly code = 'MFA_REQUIRED';
  constructor(message = 'Cette action exige une authentification à deux facteurs.') {
    super(message);
    this.name = 'StrongAuthenticationRequired';
  }
}

export class InvalidInput extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  constructor(
    message = 'Requête invalide.',
    readonly fields: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'InvalidInput';
  }
}

export class Conflict extends DomainError {
  readonly code = 'CONFLICT';
  constructor(message = 'Cette opération entre en conflit avec des données existantes.') {
    super(message);
    this.name = 'Conflict';
  }
}

/**
 * Two transactions crossed (serialization failure, deadlock): nothing was
 * written, the whole operation can be run again on fresh data.
 */
export class SerializationConflict extends Conflict {
  constructor() {
    super('Les données ont changé pendant l’opération : réessayez.');
    this.name = 'SerializationConflict';
  }
}

/** Optimistic concurrency: the record changed since the caller read it (HTTP 412). */
export class PreconditionFailed extends DomainError {
  readonly code = 'PRECONDITION_FAILED';
  constructor(message = 'Cette fiche a été modifiée entre-temps : rechargez-la avant d’enregistrer.') {
    super(message);
    this.name = 'PreconditionFailed';
  }
}

/** A modification must state the version it is based on (HTTP 428, header If-Match). */
export class PreconditionRequired extends DomainError {
  readonly code = 'PRECONDITION_REQUIRED';
  constructor(message = 'La version attendue doit être fournie (en-tête If-Match).') {
    super(message);
    this.name = 'PreconditionRequired';
  }
}

/** A dependency (object storage, identity provider...) is not configured or not reachable (HTTP 503). */
export class ServiceUnavailable extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  constructor(message = 'Service momentanément indisponible.') {
    super(message);
    this.name = 'ServiceUnavailable';
  }
}

/** The terminal is unknown in this SIS or its enrollment is not finished (OFF-04). */
export class DeviceNotEnrolled extends DomainError {
  readonly code = 'DEVICE_NOT_ENROLLED';
  constructor(message = 'Ce terminal n’est pas enrôlé dans votre SIS.') {
    super(message);
    this.name = 'DeviceNotEnrolled';
  }
}

/** The terminal was revoked: the server refuses it and the application purges its data (OFF-04). */
export class DeviceRevoked extends DomainError {
  readonly code = 'DEVICE_REVOKED';
  constructor(message = 'Ce terminal a été révoqué par votre SIS.') {
    super(message);
    this.name = 'DeviceRevoked';
  }
}

/** The request is not signed by the key of the terminal (or the signature is malformed). */
export class DeviceProofInvalid extends DomainError {
  readonly code = 'DEVICE_PROOF_INVALID';
  constructor(message = 'La preuve d’identité du terminal est invalide.') {
    super(message);
    this.name = 'DeviceProofInvalid';
  }
}

/** The clock of the terminal is too far from the server: the request cannot be dated. */
export class DeviceClockSkew extends DomainError {
  readonly code = 'DEVICE_CLOCK_SKEW';
  constructor(message = 'L’heure du terminal est trop éloignée de celle du serveur.') {
    super(message);
    this.name = 'DeviceClockSkew';
  }
}
