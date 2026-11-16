-- ---------------------------------------------------------------------------
-- Allow the reader to keep its manifest in Storage.
--
-- Why
--   The prepared pages of an issue live in the private bucket so that every
--   instance of the site (and every serverless function) can serve them
--   without rendering the PDF again. The manifest (page count, size and the
--   searchable text) is a JSON file, and the bucket only accepted the MIME
--   types of the editorial files: application/pdf and the image types.
--
-- What this migration does
--   Adds application/json and text/plain to the allowed MIME types of the
--   "newspaper" bucket. Nothing else changes: the bucket stays private and
--   the editorial files keep their own types.
--
-- Apply it manually (never executed automatically by this repository):
--   Supabase dashboard -> SQL Editor -> paste this file -> Run
-- ---------------------------------------------------------------------------

begin;

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/json',
     'text/plain',
     'image/jpeg',
     'image/png',
     'image/webp',
     'image/gif'
   ]
 where id = 'newspaper';

commit;
