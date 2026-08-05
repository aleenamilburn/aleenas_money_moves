// Authentication and vault-locking are separate states. A refresh for the same
// user must not interrupt an unlocked vault, but switching identities must clear
// all decrypted material before the next account is routed to its hosted row.
export function sessionUserId(session) {
  return typeof session?.user?.id === 'string' && session.user.id ? session.user.id : null;
}

export function mustClearUnlockedVault(previousSession, nextSession) {
  const previousUserId = sessionUserId(previousSession);
  const nextUserId = sessionUserId(nextSession);
  return Boolean(previousUserId && nextUserId && previousUserId !== nextUserId);
}
