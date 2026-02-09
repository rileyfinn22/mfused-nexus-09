

## Add Project Documents Tab

### Problem
Attaching files via production notes fails because the storage policies restrict uploads to admin and vendor roles only. Rather than patching that workaround, we'll add a dedicated **Documents** tab to the Project Detail page where you (and admins) can upload multiple files -- product photos, reference docs, or anything else related to the project.

### What You'll Get
- A new **Documents** tab on the Project page (visible to all roles)
- Upload button supporting multiple files at once (images, PDFs, etc.)
- Each document shows a thumbnail (for images), file name, upload date, and size
- Download and delete actions per file
- Files organized by project, accessible to anyone with project access

---

### Technical Details

**1. Create a `project_documents` table**

New database table to store document metadata:
- `id` (UUID, primary key)
- `order_id` (UUID, references orders)
- `file_path` (text, storage path)
- `file_name` (text, original name)
- `file_type` (text, MIME type)
- `file_size` (integer, bytes)
- `description` (text, optional label)
- `uploaded_by` (UUID, references auth.users)
- `created_at` (timestamptz)

RLS policies:
- SELECT: Users with company access to the order, vendors assigned to stages, and Vibe Admins
- INSERT: Vibe Admins and users with company access
- DELETE: Vibe Admins only

**2. Create a storage bucket**

New `project-documents` storage bucket (public for read, authenticated upload with role checks):
- INSERT: Vibe Admins and authenticated users with company access
- SELECT: Public read (signed URLs not needed for images)

**3. Update `ProjectDetail.tsx`**

Add a new "Documents" tab alongside the existing tabs:
- Multi-file upload input with drag-and-drop style button
- Grid display of uploaded documents with image previews
- Download button per file
- Delete button (admin only)
- File count shown in the tab label

**4. Files Changed**
- New migration: Create `project_documents` table + storage bucket + RLS policies
- `src/pages/ProjectDetail.tsx`: Add Documents tab with upload/list/delete functionality

