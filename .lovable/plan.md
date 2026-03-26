

# Admin-Moderated Vendor Updates for Customer Visibility

## Summary
Vendors get the same production experience as admins (update stages, add images/notes/files, manage shipments). All vendor updates are "unpublished" by default. Admins review, optionally edit, then publish — only then do customers see the updates.

## Database Migration

**`production_stages` — add columns:**
- `published_status` (text, default 'pending') — what customers see
- `published_substages` (jsonb, nullable) — published substage snapshot
- `published_at` (timestamptz, nullable) — last publish time
- `published_notes` (text, nullable) — admin-curated note for customers

**`production_stage_updates` — add columns:**
- `is_published` (boolean, default false) — customer visibility flag
- `published_at` (timestamptz, nullable)
- `published_note_text` (text, nullable) — admin-edited version of note
- `published_image_url` (text, nullable) — admin can swap image

RLS: only `vibe_admin` can UPDATE `published_*` / `is_published` columns (via trigger or policy).

## File Changes

### 1. `src/pages/ProductionDetail.tsx`

**Vendor shipment access** — Change lines 1148-1153 to grant vendors shipment management (add/edit legs, upload attachments, update notes). Keep delete admin-only:
```
onStatusChange={isVibeAdmin || isVendor ? ... : undefined}
onAddLeg={isVibeAdmin || isVendor ? ... : undefined}
onAttachmentUpload={isVibeAdmin || isVendor ? ... : undefined}
onNotesChange={isVibeAdmin || isVendor ? ... : undefined}
onDeleteLeg={isVibeAdmin ? ... : undefined}
```

**Vendor file uploads** — Fix line 685 condition from `isVibeAdmin || isCustomer` to `isVibeAdmin || isVendor` so vendors can attach files to stage updates.

**Vendor delete updates** — Allow vendors to delete their own updates (line 1182): pass `handleDeleteUpdate` for vendors too.

**Admin publish controls** — Add a "Review & Publish" section:
- Per-stage: amber indicator when `status !== published_status` or unpublished updates exist
- "Publish" button per stage — syncs live status to `published_status`, marks selected updates as `is_published = true`
- Inline edit fields so admin can rewrite note text or swap images before publishing
- "Publish All" bulk button at top

**Fetch query** — Update the `production_stage_updates` select to include `is_published, published_note_text, published_image_url` and `production_stages` select to include `published_status, published_substages, published_at, published_notes`.

### 2. `src/components/ProductionStageTimeline.tsx`

**Customer view changes:**
- Read `published_status` instead of `status` for stage progress indicators
- Filter `production_stage_updates` to only show where `is_published = true`
- Display `published_note_text` when available (fallback to `note_text`)
- Display `published_image_url` when available (fallback to `image_url`)
- Hide substage buttons (already read-only for customers)

**Admin view additions:**
- Show amber dot / "Unpublished" badge on stages with pending vendor changes
- Show count of unpublished updates per stage
- Inline "Publish" / "Edit & Publish" controls in the expanded stage view

**Vendor view:**
- Same as admin view for updating stages (status, substages, notes, images, files)
- Show subtle "Pending review" badge on updates where `is_published = false`
- Cannot modify `published_*` fields

### 3. `src/components/ProductionStageTimeline.tsx` — Interfaces

Update `ProductionStage` and `StageUpdate` interfaces to include new published fields. Add new props:
- `onPublishStage?: (stageId: string, editedData: {...}) => Promise<void>`
- `onPublishUpdate?: (updateId: string, editedData: {...}) => Promise<void>`
- `onPublishAll?: () => Promise<void>`

## Security
- Only `vibe_admin` can write `published_*` and `is_published` columns
- Customers never see live `status` — only `published_status`
- Vendor names remain hidden from customer view
- No financial data exposed in any view
- Existing `isVibeAdmin` guards on internal notes, vendor assignment, progress slider remain unchanged

## No changes to
- Sidebar navigation (vendor "My Production" is sufficient)
- Route guards
- RLS on `production_stages` or `production_stage_updates` SELECT (both already allow vendor access for their assigned stages)

