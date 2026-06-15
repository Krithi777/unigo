export function isValidPhone(phone: string): boolean {
  // Indian mobile: 10 digits starting with 6-9
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));
}

export function isValidInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code.toUpperCase().trim());
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return phone;
}