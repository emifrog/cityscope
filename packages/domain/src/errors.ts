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
  constructor() {
    super('Cette action exige une authentification à deux facteurs.');
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
