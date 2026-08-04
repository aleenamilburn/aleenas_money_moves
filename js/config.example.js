// Copy this file to js/config.js (already gitignored — never commit real values here)
// and fill in your Supabase project's public URL and anon key, from
// Project Settings -> API in the Supabase dashboard.
//
// The anon key is not a secret in the way a password is: it identifies the project
// to Supabase's public API and is meant to ship in client code. Row-Level Security,
// configured by the SQL migration in supabase/migrations/, is what actually restricts
// access to one row per signed-in user. See docs/engineering/HOSTED_STORAGE_SETUP.md.
window.MONEY_MOVES_SUPABASE_CONFIG = {
  url: '',
  anonKey: ''
};
