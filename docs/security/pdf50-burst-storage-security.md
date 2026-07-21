# PDF50 Burst Storage Security

## Trust boundaries

- The browser may receive one short-lived signed upload grant for one server-reserved object path.
- The browser cannot choose the bucket path, Bank linkage, organization, creator, import batch, asset, or job identity.
- Only active teacher/admin profiles who can manage the target Bank may reserve or finalize.
- Viewers and students cannot reserve, finalize, cancel, list, read, update, or delete burst sources.
- The service role is used only in server actions, finalization, and the trusted worker admission pump.

## Private Storage contract

Bucket: `ai-import-sources`

- `public = false`;
- PDF MIME only;
- 50 MB object limit;
- no permanent public URLs;
- object names must match a pending reserved `import_batch_assets.object_path` and burst item;
- authenticated Storage policies allow only exact reserved paths whose active Bank the teacher/admin can manage;
- worker/finalization reads use the service role and revalidate the database linkage first.

Signed grants are transient responses. They are never written to tables, summaries, logs, telemetry, or UI text.

## Server validation

Finalization rechecks:

1. authenticated active teacher/admin profile;
2. burst/item/Bank/organization relationship;
3. owner/editor Bank capability;
4. immutable reserved path and pending source asset;
5. exact object existence;
6. verified byte count within 1-50 MB;
7. expected and detected PDF MIME/signature;
8. parseable page count within the product limit;
9. duplicate-finalize/job linkage.

Only one PDF is downloaded into server memory during validation. A batch is never proxied or buffered by a Server Action.

## RLS and capability matrix

| Actor | Read safe burst state | Reserve/finalize/cancel | Source object access |
|---|---|---|---|
| Bank owner/editor teacher | Yes | Yes | Exact linked path only |
| Admin who is an active Bank owner/editor | Yes | Yes | Exact linked path only |
| Bank viewer | No | No | No |
| Student | No | No | No |
| Unrelated organization | No | No | No |
| Trusted worker/service role | Exact execution use | Admission release/status sync | Exact linked source |

## Failure handling

User-visible failures use fixed categories such as invalid file, file too large, page limit, upload missing, authorization changed, or temporary admission wait. Do not expose SQL, Storage paths, signed tokens, provider errors, headers, IDs, or stack traces.

Cancellation preserves already uploaded private sources, queued jobs, completed jobs, and Review Drafts. Cleanup is a separate audited retention operation, not cancellation behavior.

## Security validation

Focused smokes must prove exact-path reservation, immutable object names, viewer/student/cross-organization denial, private bucket configuration, no public URL generation, no raw File Server Action, service-role-only admission RPCs, Bank-scoped drafts, and unchanged active execution limits.
