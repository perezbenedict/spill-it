# Dashboard moderation revision fix

The dashboard Needs Review queue called `approve(id)` and `hide(id)` without the contribution revision. Those actions sent a PATCH without an integer `expectedRevision`, and the Worker correctly rejected it. The server-action wrapper then hid that validation failure behind a generic message.

The queue now passes the selected row's revision and uses a synchronous in-flight guard against duplicate clicks. A failed decision leaves the row visible. Stale, missing or invalid revisions request fresh dashboard data without silently retrying the decision against a newer contribution. Successful decisions retain the existing removal/count-refresh behavior and design.

Approve and Reject validate revisions before PATCH. Known Worker validation, authorization, missing-record and conflict errors now have useful feedback and refresh metadata. Unexpected server failures retain a generic message without exposing response details. The full moderation feed uses its captured row revision and refreshes promptly on revision-related errors after rolling back its optimistic display.

No Worker change, migration or data rewrite is needed. Existing server-side revision guards, moderation rules and audit writes remain authoritative. Tests use disposable local contributions; production verification must not approve or reject existing participant content.

## Verification

Lint, all 93 unit tests, ten isolated Playwright cases, `cf-build` and `cf-bundle` passed. Coverage includes dashboard Approve/Reject, missing/stale revisions, explicit retry after refresh, duplicate clicks, safe action feedback, full-feed moderation and admin/projector recovery. The bundled public assets contain no private credential values.

A fresh production D1 export was obtained through the connected Cloudflare API after the CLI export endpoint rejected its OAuth credentials. The export was restored privately: integrity OK and zero foreign-key violations. No credentials were rotated. See `artifacts/moderation-fix` for sanitized evidence and final deployment verification.
