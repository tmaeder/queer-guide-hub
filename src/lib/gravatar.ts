import CryptoJS from 'crypto-js';

/**
 * Generate a Gravatar URL from an email address
 * @param email - The email address
 * @param size - The size of the avatar (default: 200)
 * @param defaultType - The default avatar type if no Gravatar exists (default: 'mp')
 * @returns The Gravatar URL
 */
export function getGravatarUrl(
  email: string | null | undefined, 
  size: number = 200, 
  defaultType: string = 'mp'
): string | null {
  if (!email) return null;
  
  // Create MD5 hash of the email (lowercase and trimmed)
  const hash = CryptoJS.MD5(email.toLowerCase().trim()).toString();
  
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultType}`;
}

/**
 * Check if a Gravatar exists for an email address
 * @param email - The email address
 * @returns Promise that resolves to true if Gravatar exists
 */
export async function hasGravatar(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  
  const url = getGravatarUrl(email, 80, '404');
  if (!url) return false;
  
  try {
    const response = await fetch(url);
    return response.status === 200;
  } catch {
    return false;
  }
}