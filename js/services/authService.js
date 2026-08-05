import {getSupabaseClient} from './supabaseClient.js';

// Add 'apple' here when Apple sign-in ships. No other code in this file changes —
// the sign-in button and the Supabase provider configuration are the only other
// places a new provider needs to be wired in.
export const AUTH_PROVIDERS = Object.freeze({
  google: 'google'
});

export class AuthServiceError extends Error {
  constructor(message = 'Sign-in could not be completed. Please try again.') {
    super(message);
    this.name = 'AuthServiceError';
    this.code = 'AUTH_FAILED';
  }
}

export async function signInWithProvider(providerKey, {redirectTo} = {}) {
  const provider = AUTH_PROVIDERS[providerKey];
  if (!provider) throw new AuthServiceError('This sign-in method is not available.');
  const supabase = getSupabaseClient();
  try {
    const {error} = await supabase.auth.signInWithOAuth({
      provider,
      options: {redirectTo: redirectTo || globalThis.location.origin}
    });
    if (error) throw new AuthServiceError();
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw new AuthServiceError();
  }
}

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  try {
    const {data, error} = await supabase.auth.getSession();
    if (error) throw new AuthServiceError();
    return data.session || null;
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw new AuthServiceError();
  }
}

export async function getCurrentUserId() {
  const session = await getCurrentSession();
  return session?.user?.id || null;
}

export function onAuthStateChange(callback) {
  const supabase = getSupabaseClient();
  const {data} = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  const supabase = getSupabaseClient();
  try {
    const {error} = await supabase.auth.signOut();
    if (error) throw new AuthServiceError('Sign-out could not be completed. Your vault remains locked in this browser.');
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw new AuthServiceError('Sign-out could not be completed. Your vault remains locked in this browser.');
  }
}
