# Clean Supabase Local Seed Drafts

These seed files are local/dev-only drafts for a disposable clean Supabase database.

They are not production bootstrap scripts, and they do not contain production secret material, real provider credentials, real user credentials, or real school/client content.

Production bootstrap should use one of these safe paths:

- Supabase Dashboard invite flow
- Supabase Admin API
- a service-role-only bootstrap script that is disabled after first use

Do not create production `auth.users` by normal client SQL. The local bootstrap seed only inserts `profiles` and `organization_members` rows when matching placeholder `auth.users.id` rows already exist.

Apply order for local experiments only:

1. `0001_local_bootstrap_organization.sql`
2. `0002_local_taxonomy_seed.sql`
3. `0003_local_demo_content_seed.sql`

Required storage buckets are not created by these SQL drafts:

- `ai-import-sources` - private source PDFs for AI import
- `question-assets` - approved question assets that may be student-visible
- `question-source-files` - private source/reference files for question editing

Provider setup policy:

- `0001_local_bootstrap_organization.sql` creates one disabled provider metadata placeholder.
- It intentionally does not store usable provider credentials.
- Real provider setup should happen through the app's server-only provider settings flow or a reviewed service-role-only setup script.

Rows seeded for smoke readiness:

- anonymous/public question read smoke: published local questions and approved taxonomy assignments
- admin review smoke: one pending review batch and draft item
- teacher import/course builder smoke: local framework and optional teacher-owned course run if the placeholder teacher profile exists
- student practice smoke: optional completed practice session if the placeholder student profile exists
- blueprint smoke: one folder, one approved blueprint, and one blueprint example

Before applying these drafts anywhere beyond a disposable local database:

- review every row
- replace placeholder identities through an approved auth bootstrap path
- create storage buckets and policies intentionally
- keep legacy analytics/IP/page-visit data out
- keep historical tag compatibility data out unless a future product decision explicitly reactivates it
