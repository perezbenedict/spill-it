# Light theme, public polish and bulk management

Dark remains the default. A compact public/admin toggle saves an explicit `spill_theme` cookie for a year. The root layout reads the cookie during server rendering, so initial HTML and client state agree. No system preference silently changes the default.

Light uses ivory foundations, lavender surfaces, deep plum text, violet accents, semantic border/shadow/overlay tokens and shared form, dialog, status and voting styles. Audience projectors, QR invitations and print presentations intentionally retain their moderator-controlled dark atmosphere; personal preferences cannot recolor a live stage. Light projector selection is not offered in this release. Existing seven atmospheres remain available, with light counterparts in ordinary previews.

The homepage seam came from ambient layers clipped by the same narrow container used for text. Atmosphere now fills the viewport while an inner wrapper constrains content. The participant introduction uses the existing viewport background instead of a narrow clipped glow. Topic lighting stays within its rounded surface; the detached stripe/outer glow was removed. Category, nickname and navigation hovers keep stable borders; keyboard focus remains explicit.

Standalone and voting collections share explicit selection, Select displayed, Deselect all, a counter and a password-confirmed dialog. Only loaded visible records are selected, up to 50. Selection retains captured revisions across paging/refresh; newly loaded records are never implicitly selected. Individual deletion remains available. Discussion bulk management remains the existing implementation, with a Manage Discussions shortcut from Discussion Stage.

Bulk endpoints require a full administrator, valid password, confirmation, distinct valid IDs and revisions, and a bounded batch. Guarded deletes and protected audit inserts run in one D1 transaction. Per-item results distinguish deleted and rejected records; SQL failures roll back the transaction. Changed or missing stages are rejected. Stage deletion warns about projected content and invalidates its link without touching discussions or referenced voting data.

Voting deletion rejects open events, non-hidden presentation and any saved stage reference, including return-to-previous content. Close, hide and detach before retrying. The same protections apply to individual deletion. Stage projection and deletion use transaction-time eligibility/reference checks to prevent a dangling event reference during concurrent operations. Deleting eligible voting events removes their own dependent ballots/rounds through the existing schema, while audit records and other resources remain.

No migration is required. Backups and release verification are kept outside public assets; sanitized results and synthetic screenshots are under `artifacts/theme-bulk`. Destructive tests use disposable loopback D1 fixtures only. Production verification must be read-only and preserve open/live state.

## Verification

See `artifacts/theme-bulk/release.json` for actual final results and release identifiers. The initial run caught a NOT NULL audit insert failure (transaction rolled back), missing category focus styling, and light-only contrast issues; these were corrected. Older visual baselines require approved updates for the new toggle and requested atmosphere/participant changes. Golden screenshot updates alone are not treated as visual approval; rendered screenshots are reviewed separately.

Automated accessibility is scoped evidence, not complete WCAG certification. Physical projector/color calibration and manual assistive-technology review remain outside these automated checks.
