/** Include an address still in the input when sending, without requiring Add/Enter. */
export function resolveEmailRecipients(emails: string[], pendingEmail: string): string[] {
  const recipients = [...emails, pendingEmail].map(email => email.trim().toLowerCase()).filter(Boolean);
  if (recipients.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Please enter a valid email address');
  }
  return [...new Set(recipients)];
}