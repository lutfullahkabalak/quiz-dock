import i18next from 'i18next';

/**
 * Résout un **code d'erreur backend** (token, ex. `session.not_found`) en texte
 * lisible via le dictionnaire i18n `errors` (ADR 0001). `params` couvre les codes
 * interpolés (`quiz.transition_forbidden` → `{ from, target }`). Code inconnu →
 * message générique.
 */
export function errorText(code: string, params?: Record<string, unknown>): string {
  return i18next.t(`errors:${code}`, { ...params, defaultValue: i18next.t('errors:error') });
}

/** A domain error code: dotted lowercase words (`question.options.one_correct`). */
const DOMAIN_CODE = /^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/;

/**
 * The text of one validation code: a business rule's own (`errors`), else the
 * generic Zod code's (`validation`, ADR 0001).
 */
export function validationText(code: string): string {
  return DOMAIN_CODE.test(code)
    ? errorText(code)
    : i18next.t(`validation:${code}`, { defaultValue: i18next.t('validation:_default') });
}

/** Une erreur de validation par champ. */
export interface FieldError {
  field: string;
  message: string;
}

/** Traduit chaque issue de validation `{ field, code }` renvoyée par le backend. */
export function validationFieldErrors(errors: { field: string; code: string }[]): FieldError[] {
  return errors.map((e) => ({ field: e.field, message: validationText(e.code) }));
}
