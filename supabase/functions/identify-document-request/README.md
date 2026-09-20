# Identify document request

This Supabase Edge Function classifies one inbox record into:

- `comparison_request`
- `new_si_request`
- `invoice_query`
- `general_message`
- `spam`

Only `comparison_request` returns `continue_to_extraction: true`.

The deterministic rule pass reads the current subject and body. Attachment presence and attachment names are excluded from both rule scoring and the intent hash. Ambiguous inputs use the Email Classifier AI Stack in order: three Groq models, NVIDIA Nemotron, then Cerebras Qwen. The complete model response is stored with the final decision for audit.

## Environment

Set one or more of `GROQ_API_KEY`, `NVIDIA_API_KEY`, and `CEREBRAS_API_KEY` as Supabase function secrets. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function.

## Request

```json
{
  "email_id": "email_001",
  "from": "ops@example.com",
  "subject": "TO CONFIRM DOCS - OC 1001",
  "body": "Attached are the SI and draft BL. Please check and confirm.",
  "attachments": ["OC1001_SI.pdf", "OC1001_BL.pdf"],
  "metadata": { "received_at": "2026-09-19T09:00:00Z" }
}
```

Apply the migration, serve the function, and invoke `identify-document-request` through the Supabase client. Run the classifier regression suite from the repository root with `npm.cmd test` on Windows or `npm test` elsewhere.
