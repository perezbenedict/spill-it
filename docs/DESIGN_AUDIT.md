# SPILL Design Audit

## 1. What makes GNWY's visual identity distinctive

- **Atmospheric depth over flatness**: GNWY layers soft radial gradients (gold + very subtle crimson) and a faint noise texture behind a midnight background. The glow feels like ambient light, not decorative blobs.
- **Typography with personality**: Playfair Display for headings creates an expressive, editorial feel. Instrument Sans keeps body text crisp and modern. The contrast is intentional.
- **Gold as the hero accent**: Gold is used for emphasis, selected states, and the primary CTA. It never competes with content. Crimson appears only as a restrained accent.
- **Motion with purpose**: Staggered entrance animations, spring-based button feedback, and subtle card selection states. Nothing bounces or pulses without reason. `prefers-reduced-motion` is respected.
- **Restraint**: Borders are subtle, cards are used sparingly for grouping, and decorative elements stay at low opacity.

## 2. Which design decisions should carry over to SPILL

- Midnight background with soft gold/crimson ambient lighting.
- Playfair Display + Instrument Sans typography pairing.
- Gold gradient primary buttons with a restrained sheen animation.
- Option cards with gold selection borders, subtle scale animations, and clear hover states.
- Staggered screen transitions in the participant flow.
- Atmospheric background emblem/brand mark at very low opacity.
- Consistent focus rings, reduced-motion support, and safe-area spacing.

## 3. Which GNWY patterns should be adapted rather than copied directly

- **Brand identity**: Replace the church emblem with a SPILL-specific mark (abstract circular motif or wordmark treatment).
- **Participant flow**: GNWY's rating/feedback form maps to SPILL's nickname → category → composer → success flow. The structure is similar but the copy, categories, and interaction patterns must feel conversational, not formal.
- **Admin dashboard**: GNWY's "Response Vault" has analytics/overview/responses sections. SPILL needs a tighter session-management + moderation-queue layout suited to discussion sessions, not survey responses.
- **Projector view**: GNWY doesn't have a public projector display. SPILL needs a dedicated fullscreen "Conversation Room" with large readable type, not just the admin dashboard without a sidebar.

## 4. What is currently making SPILL look generic, unfinished, or visually weak

- **GNWY logo in SPILL**: The app uses `/gnwy-logo.png` as its brand mark. It needs its own identity.
- **Purple-based palette**: SPILL's current tokens (`--color-purple`, `--color-purple-deep`, etc.) drift away from the midnight/gold/crimson foundation.
- **Flat button system**: Buttons lack the premium gold gradient and restrained sheen that make GNWY's CTAs feel designed.
- **Missing atmosphere**: The background has basic radial glows but no noise texture, no SPILL brand watermark, and no subtle crimson depth.
- **Generic admin layout**: The admin top bar and dashboard cards look like a standard SaaS template rather than a polished control centre.
- **Option card treatment**: Category cards use a thick 4px border on selection instead of the more refined gold halo + subtle scale used in GNWY.

## 5. Proposed SPILL design system and routes/components that need redesigning

### Design system
- **Palette**: Midnight `#0B0E13`, surface `#121722`, gold `#E8C77A`/`#F5DFA6`, crimson `#B3223A`, primary text `#EDEFF3`, muted text `#9AA3B2`.
- **Typography**: Playfair Display for expressive headings. Instrument Sans for body, forms, buttons, and dashboard UI.
- **Surfaces**: `rounded-xl` cards, subtle `border-white/10`, dark surfaces.
- **Buttons**: Gold gradient primary, ghost/secondary, danger. Focus rings in gold.
- **Atmosphere**: Ambient radial lighting, faint SPILL emblem watermark, very subtle noise texture.
- **Motion**: Framer Motion for transitions. Staggered entrances, spring taps, `prefers-reduced-motion` respected.

### Routes/components to redesign
- `app/layout.js` — fonts, root classes
- `app/globals.css` — tokens, atmosphere, base styles, animations
- `app/page.js` — home / code entry with SPILL brand
- `app/join/[sessionCode]/page.js` — participant entry states
- `components/participant/JoinExperience.js` — step transitions, copy, animation
- `components/participant/NicknamePicker.js` — selection styling
- `components/participant/CategoryCards.js` — option card treatment
- `components/participant/SubmissionForm.js` — composer styling
- `components/ui/Button.js` — gold gradient, variants
- `components/ui/Card.js` — refined surfaces
- `components/ui/Badge.js` — gold/crimson accents
- `components/ui/Input.js` / `Textarea.js` — focus rings, surface
- `components/admin/(dashboard)/layout.js` — top bar with SPILL mark
- `components/admin/dashboard/SummaryCards.js` — stat card treatment
- `components/admin/sessions/...` — session management, status controls
- `components/moderation/SubmissionFeed.js` — moderation card styling
- `components/room/RoomDisplay.js` — projector typography, atmosphere
- `components/room/RoomControls.js` — control bar styling
- `app/admin/login/page.js` — branded login
