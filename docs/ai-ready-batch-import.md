# AI-Ready Batch Import Contract

This MVP does not call AI APIs. Future AI parsing should produce normalized JSON
for the existing Batch Import review workflow instead of writing directly to
published content.

## Current Flow

```txt
Manual JSON Import now
-> Asset-aware import references
-> Tutor/admin review
-> Draft questions
-> Publish
```

Batch Import v2 accepts structured JSON only. It preserves asset references for
review, but it does not download, upload, or automatically attach binary files.

Current reserved asset fields:

- `image_urls`: external image URLs for review.
- `source_file_ids`: IDs of already-uploaded PDF source files.
- `question_asset_ids`: IDs of already-uploaded managed question images.

## Future Package Flow

```txt
Package import: questions.json + images + PDFs
-> Normalize records and map package files
-> Batch Import preview
-> Tutor/admin review
-> Draft questions
-> Publish
```

Future package fields:

- `image_files`: package-relative image paths, such as `images/q1001-figure1.png`.
- `source_files`: package-relative source files, such as `pdfs/ap-physics-set.pdf`.

The package importer should upload files through the same admin-authenticated
Storage/RLS paths used by the existing image and source-file panels. It should
then populate `question_asset_ids` and `source_file_ids` for review.

## Future AI Parser Output

AI parsing should output normalized JSON that feeds Batch Import. Expected fields:

- `code`
- `title`
- `type`
- `difficulty`
- `content_html`
- `solution_html`
- `tag_suggestions`
- `tag_names` or `tag_slugs` after human or system mapping
- `image_refs`
- `source_file_refs`
- `image_urls`
- `source_file_ids`
- `question_asset_ids`
- `confidence`
- `warnings`

AI output must remain draft-only. Tutor/admin review is required before publish.

## Safety Rules

- Do not publish AI output automatically.
- Do not bypass Supabase RLS with frontend service-role keys.
- Sanitize all `content_html` and `solution_html` before saving.
- Keep manually embedded `<img>` tags separate from managed question assets.
- Treat external image URLs as review references until an admin explicitly
  downloads/uploads or replaces them with managed assets.
