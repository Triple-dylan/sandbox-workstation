/** The invite token in a pasted link, or the token itself if that is what was pasted. */
export function inviteFrom(text: string) {
  const trimmed = text.trim();
  try {
    return new URL(trimmed).searchParams.get('invite') ?? '';
  } catch {
    return /^[\w-]{8,}$/.test(trimmed) ? trimmed : '';
  }
}
