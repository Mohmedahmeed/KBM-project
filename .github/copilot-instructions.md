# Workspace Guidance

- This is a Next.js 16 App Router project. Read the installed framework guides under `node_modules/next/dist/docs/` before changing Next.js APIs or conventions.
- Keep Supabase access behind row-level security. Do not add a service-role key to client code or `NEXT_PUBLIC_` environment variables.
- The dashboard currently displays sample data. Clearly identify sample data and never present it as live Supabase data.
- Apply SQL changes as ordered migrations in `supabase/migrations/`.
