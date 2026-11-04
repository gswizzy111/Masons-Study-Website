// The Postgres schema that holds every Mason's Study table and function.
// The app shares its Supabase project with another app that uses "public",
// so all clients (browser, server, admin) talk to "study" instead.
// Relative-import safe: the Netlify background function bundles this file.
export const DB_SCHEMA = "study" as const;
