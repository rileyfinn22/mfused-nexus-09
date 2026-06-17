# ADR-003 — Artboard coordinate system + legacy migration

## Status
Accepted

## Context
Persisted `canvas_data` objects are currently in **print-area** coordinates (origin at the bleed corner; scene == template). The rework introduces a large **artboard** space and a movable frame. We must not break existing saved templates (NFR3) and must not change `INTERNAL_DPI` (would rescale all saved coords).

## Decision
- **Artboard space = the existing scene space at `INTERNAL_DPI=150`, just unbounded.** Object coords keep the same units/origin; the pasteboard is simply scene area outside the frame. No DPI change → saved coords remain valid.
- Persist a **dieline-frame transform** + small **artboard metadata** (print DPI, optional pasteboard hint). Store either as new `print_templates` columns or an `artboard` JSON blob (decide in plan; lean: a `dieline_frame` key inside `canvas_data` so it travels with the design and needs no migration).
- **Legacy load:** a template with no `dieline_frame` is migrated on open by **synthesizing a frame from the old print area**: `left=0, top=0, widthIn=width_inches, heightIn=height_inches, bleedIn=bleed_inches, scaleX=scaleY=1`. Existing objects are already in that coordinate space, so they appear unchanged. The HTML overlay is replaced by the new frame object at the identical region → **no visual regression**.
- New templates start with the frame centered in a generous artboard and may place art freely around it.

## Consequences
- Zero data migration job; legacy templates open identically and gain a movable frame.
- The frame transform lives with the design (`canvas_data`) → simplest persistence, survives round-trips already handled by the editor's serialize whitelist (extend it for `dieline_frame`).
- Export reads the frame transform from `canvas_data` (ADR-004).
