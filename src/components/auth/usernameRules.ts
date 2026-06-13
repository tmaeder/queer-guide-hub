// v2 rules: 3-20 chars, lowercase a-z 0-9 _ ., letter start, alnum end,
// no consecutive separators. Mirrors the DB CHECK + username_available().
export const USERNAME_RE = /^[a-z][a-z0-9._]{1,18}[a-z0-9]$/;

export const usernameFormatError = (v: string): string | null => {
  if (v.length < 3) return 'At least 3 characters.';
  if (v.length > 20) return 'At most 20 characters.';
  if (!/^[a-z]/.test(v)) return 'Usernames start with a letter.';
  if (/[._]$/.test(v)) return 'Usernames end with a letter or number.';
  if (/[._]{2}/.test(v)) return 'No repeated dots or underscores.';
  if (!USERNAME_RE.test(v)) return 'Only lowercase letters, numbers, dots and underscores.';
  return null;
};
