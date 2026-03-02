

## Add Team Members, DMs, and @Mentions to Chat

### Current State
- Chat exists with channels, threads, file sharing -- all restricted to `vibe_admin` users
- Users display as email prefixes (e.g. "riley" from riley@company.com)
- `chat_channel_members` table exists but isn't used for DMs
- No concept of display names or @mentions

### What We'll Build

**1. Team member profiles with display names**
- Add a `display_name` column to `chat_channel_members` or use a lightweight approach: store display names directly on a new `chat_profiles` table (`user_id`, `display_name`, `avatar_color`) with RLS for vibe_admin only
- Seed Carrie, Jack, Justin as known team members so they show up with proper names instead of email prefixes

**2. Direct Messages section in sidebar**
- Add a "Direct Messages" section below Channels in the sidebar
- "New DM" button that shows a list of all vibe_admin team members to pick from
- Creates a DM channel (`is_dm = true`) between the two users
- DM channels show the other person's display name instead of a channel name

**3. @Mention support in messages**
- In the message composer, typing `@` triggers a popup showing team members
- Selecting a person inserts `@Name` into the message
- Mentioned names render as highlighted/bold text in messages
- Optional: notify mentioned users (future enhancement)

### Database Changes
- New table `chat_profiles` with columns: `id`, `user_id` (unique), `display_name`, `avatar_color`, `created_at`
- RLS: vibe_admin only for all operations
- Seed profiles for existing team members

### Frontend Changes (all in `src/pages/Chat.tsx`)
- Load chat profiles on mount to build a `userId -> displayName` map
- Replace email-based display with profile display names throughout
- Add "Direct Messages" section in sidebar with "New DM" dialog
- Add `@mention` autocomplete dropdown in message composer (triggered by `@` key)
- Render `@Name` mentions as styled spans in message text
- When creating a DM, check if one already exists between the two users before creating

### Technical Details

```text
Sidebar Layout:
┌──────────────────┐
│ Chat          [+] │
├──────────────────┤
│ CHANNELS         │
│ # general        │
│ # shipping       │
├──────────────────┤
│ DIRECT MESSAGES  │
│ 👤 Carrie        │
│ 👤 Jack          │
│ 👤 Justin        │
│ + New Message    │
└──────────────────┘
```

- @mention popup: positioned above cursor, filters as user types, Enter/click to select
- DM channel naming convention: store both user IDs, display the "other" user's name
- All changes stay within vibe_admin security boundary

