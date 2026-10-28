// Password rules for sign-up and reset. Supabase Auth enforces the same minimum length
// (Authentication → Providers → Email → Minimum password length = 10) and, with leaked-password
// protection on, refuses passwords found in breaches; this is guidance before the request.

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;
export const strengthLabels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

const COMMON =
  /^(password|qwerty|letmein|welcome|iloveyou|admin|abc123|123456|111111|monkey|dragon)/i;

export interface PasswordCheck {
  strength: PasswordStrength;
  /** Short suggestions, most useful first; empty when the password is strong. */
  hints: string[];
  /** True when the password meets the minimum and may be submitted. */
  acceptable: boolean;
}

/** Scores a password from length and variety, and penalises the email name or common words. */
export function checkPassword(password: string, email = ""): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      strength: 0,
      hints: [`Use at least ${MIN_PASSWORD_LENGTH} characters.`],
      acceptable: false,
    };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  let score = 1 + (password.length >= 14 ? 1 : 0) + (password.length >= 18 ? 1 : 0);
  score += classes.length >= 3 ? 1 : 0;
  const hints: string[] = [];
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  const lower = password.toLowerCase();
  if (
    (name.length >= 3 && lower.includes(name)) ||
    COMMON.test(password) ||
    /^(.)\1+$/.test(password)
  ) {
    score = 1;
    hints.push("Avoid your name, your email or common words.");
  }
  if (password.length < 14)
    hints.push("Longer is stronger: try a short phrase of four or more words.");
  if (classes.length < 3) hints.push("Mix upper and lower case, numbers or symbols.");
  const strength = Math.min(4, score) as PasswordStrength;
  return { strength, hints: strength === 4 ? [] : hints, acceptable: true };
}
