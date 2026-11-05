export type FormState =
  | { status: 'idle' }
  // `values` lets a form re-fill what the user typed: React resets forms after every submit.
  | { status: 'error'; message: string; values?: Record<string, string> }
  | { status: 'sent'; message: string };

export const idle: FormState = { status: 'idle' };

// Deliberately identical whether or not an account/invite exists (no account enumeration).
export const MESSAGES = {
  signUpSent:
    'If this email has a beta invitation, we have sent a link to finish creating your account. Please check your inbox (and spam folder).',
  magicLinkSent:
    'If an account exists for this email, we have sent a log-in link. Please check your inbox.',
  resetSent:
    'If an account exists for this email, we have sent a password reset link. Please check your inbox.',
  badLogin: 'Email or password is incorrect, or your email is not confirmed yet.',
  unavailable: 'Something went wrong on our side. Please try again in a few minutes.',
  emailFailed: 'We could not send the email right now. Please try again in a few minutes.',
  needFreshLink:
    'For your security, please use the link from a new "Forgot password" email to change your password.',
} as const;
