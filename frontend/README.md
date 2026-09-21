# Using DocWise

DocWise is one shared workspace for intake and review. Everyone with access to the workspace sees the same cases and uploaded documents.

## As a user

1. Open **Overview** to see recent cases, or **Inbox** to find a case by its subject, sender, or ID. The **Received** column shows when the case entered the inbox; select its heading to switch between newest-first and oldest-first.
2. Select **New case**, enter the sender, subject, and email message, and attach the SI/BL files when available. Select **Create case**. The case is saved to the shared Supabase database and the files go to its private `case-attachments` bucket.
3. Open the case to see the classifier result and, for SI/BL comparison requests, the completed seven-field deterministic comparison. Attachments can be previewed when supported or downloaded.
4. Use **Review queue** for cases that need a human resolution. Add a resolution note and resolve the item; it remains visible in the shared workspace.
5. Open **Reports** for completed discrepancy reports and reviewer history. **Analytics** summarizes the cases that have comparison results.

## Workspace setup

The Vercel frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Its server-side `/api/compare` function also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to read private attachments and store comparison results. The Supabase project needs the migrations in `supabase/migrations/`, the `identify-document-request` Edge Function, and one or more Edge Function secrets: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `CEREBRAS_API_KEY`. Never put a service-role or model key in a `VITE_` variable.

The current workspace is intentionally shared and has no sign-in. Anyone who can reach the app can submit cases and access shared case files. Set up the required Supabase migrations and function before using New case.
