# Attachment Preview and Export Report Plan

## Goal

Add attachment preview and case-report export to the existing case-details modal. The implementation should work for comparison and non-comparison cases, preserve the current Supabase security model, and avoid exposing server-only credentials in the browser.

## Recommended user experience

### Preview attachments

Make each item in the **Attached files** list selectable. Selecting a file opens an attachment preview dialog.

| File type | Preview behaviour |
| --- | --- |
| PDF | Display in an embedded document viewer. |
| TXT and CSV | Display as escaped, readable text. |
| DOCX and XLSX | Display file details and a download action. Browsers do not provide reliable native previews for these formats. |

Every preview includes the filename, file type, loading and error states, a download action, and controls to close the dialog. The dialog closes with its close button, an outside click, or the Escape key.

### Export a report

Enable the existing **Export report** button in the case modal. It opens a print-ready report in a new window and starts the browser print dialog. Users can select **Save as PDF** to produce a PDF without adding a client-side PDF-generation dependency.

The exported report contains:

- DocWise branding and the generation timestamp.
- Case ID, sender, subject, category, and workflow status.
- Final verdict and review reason, when applicable.
- The attached-file list.
- The seven-field SI/BL comparison table, including mismatch highlighting, when comparison data exists.
- A note explaining that comparison outcomes are deterministic.

Non-comparison cases still export their case information and attachments; their reports omit the comparison table.

## Implementation steps

1. Preserve attachment metadata in the frontend data model.

   Update `fetchEmailDetail` in `frontend/src/api.ts` and the `EmailDetail` type so attachments retain their `name`, `path`, `content_type`, and `size_bytes` values. Continue supporting legacy records that store an attachment as a string path.

2. Add attachment-access helpers.

   Add helpers in `frontend/src/api.ts` that create a short-lived signed URL for a selected file and download an attachment as a browser `Blob`. Use the existing `case-attachments` bucket. Do not use `SUPABASE_SERVICE_ROLE_KEY` in the frontend.

3. Build an attachment preview component.

   Add `frontend/src/components/AttachmentPreviewModal.tsx`. It receives the selected attachment and uses the access helpers to render the appropriate preview or download fallback. Revoke any temporary object URL when the component closes or its attachment changes.

4. Update the case modal.

   In `frontend/src/components/CaseModal.tsx`, replace the plain attachment names with accessible preview buttons and manage the selected-attachment state. Enable **Export report** after case details load.

5. Add a report generator.

   Create `frontend/src/lib/caseReport.ts` to build a print-safe report from `EmailDetail`. Escape every user-controlled value before it is inserted into report HTML.

6. Trigger print-to-PDF export.

   On export, open a new window, write the report and its print styles, then call `window.print()`. If a popup is blocked, show a clear message in the application.

7. Test the feature.

   - Unit-test report generation and attachment-type routing.
   - Mock Supabase Storage signed-URL creation in API tests.
   - Manually test PDF, TXT/CSV, DOCX/XLSX fallback, download, and export.
   - Test comparison, non-comparison, missing-attachment, and failed-preview states.
   - Run the frontend build and review the affected flow in Playwright.

## Security and limitations

The `case-attachments` bucket is private. The frontend should use short-lived signed URLs created through the configured Supabase client, never a service-role key. The current workspace has shared unauthenticated access, so previews follow that same access model. When user authentication is added, Storage policies should restrict attachment access to authorized users.

DOCX and XLSX files deliberately use a download fallback. Adding a browser preview for these formats would require a converter or third-party document viewer and should be treated as a separate security and product decision.

## Future option: direct PDF download

If the product requires a PDF file to download immediately instead of using the native print dialog, add a PDF library such as `jspdf` with `jspdf-autotable`. That option should be evaluated separately because it adds a client dependency and requires additional layout testing.
