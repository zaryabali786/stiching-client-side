/** Common destinations for the Pakistani diaspora (+ Pakistan). "Other" reveals a free-text field. */
export const COUNTRIES = [
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'United Arab Emirates',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Germany',
  'France',
  'Netherlands',
  'Norway',
  'Sweden',
  'Denmark',
  'Ireland',
  'Italy',
  'Spain',
  'Malaysia',
  'Singapore',
  'Pakistan',
  'Other',
] as const;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '' };
  let score = 1;
  if (pw.length >= 8) {
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
  }
  const clamped = Math.min(4, score) as PasswordStrength['score'];
  return { score: clamped, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][clamped] };
}
