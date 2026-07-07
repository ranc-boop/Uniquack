# Entitlements And Monetization Plan

## 1. Executive Summary

EduStruct should use capabilities and entitlements, not hard-coded role assumptions, for pricing and product access.

Roles answer: who can access or edit a Library?

Capabilities answer: what can this user or plan do with the content?

This separation keeps the permission model simple while allowing different products:

- Free User
- Student Plus
- Teacher Pro
- School / Institution
- School Student Lite
- School Teacher
- Admin

## 2. Product Tiers

### Free User

The free user is a consumer self-study user.

Likely access:

- limited public Library browse/pull
- limited personal Library
- limited Practice quota
- basic Mistakes
- limited self-study feedback
- no classroom creation
- no AI Parsing or only very limited trial access

### Student Plus

Student Plus expands independent learning.

Likely access:

- expanded personal Library
- more Practice quota
- self-study feedback generation
- Study Groups
- shared mistakes
- advanced progress
- public Library pulls/forks
- personal import later, if safe

### Teacher Pro

Teacher Pro is the individual teacher product.

Likely access:

- AI Parsing quota
- Review Draft workflow
- private/shared Libraries
- Classrooms
- Publish
- Blueprint Library
- class Progress / Feedback
- larger Libraries
- collaboration with other teachers

### School / Institution

School plan is managed deployment.

Likely access:

- teacher seats
- managed student accounts
- Student Classroom Lite policy
- organization Libraries
- organization verified or approved content workflows
- admin governance
- higher AI and storage quotas
- SIS / Google / LTI later

### Student Classroom Lite

Student Classroom Lite is a school-connected student mode.

Likely access:

- assigned work only
- basic Practice
- basic teacher-visible progress
- basic feedback
- no full public Library unless school enables it
- no broad Study Groups unless school enables them
- no personal import unless school enables it
- academic integrity mode

## 3. Capability Matrix

| Capability | Free | Student Plus | Teacher Pro | School Student Lite | School Teacher | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Create personal Library | Limited | Yes | Yes | Policy-controlled | Yes | Yes |
| Pull public content | Limited | Yes | Yes | Policy-controlled | Yes | Yes |
| Fork public Library | Limited | Yes | Yes | Policy-controlled | Yes | Yes |
| Create Study Group | No or limited | Yes | Optional | Policy-controlled | Optional | No normal use |
| Generate self-study feedback | Limited | Yes | Optional | Policy-controlled | Optional | No normal use |
| Create classroom | No | No | Yes | No | Yes | Support/admin only |
| Publish assignment | No | No | Yes | No | Yes | Support/admin only |
| AI Parsing | No or trial | Future optional | Yes, quota-based | No unless school enables | Yes, quota-based | Governance/support |
| Blueprint generation later | No or trial | Future optional | Yes, review-gated | No unless school enables | Yes, review-gated | Governance/support |
| Class analytics | No | No | Yes | Own assigned work only | Yes | Support/admin |
| Manage verified/public review | No | No | Submit only | No | Submit only | Yes |
| Taxonomy request | Limited | Yes | Yes | Policy-controlled | Yes | Review/manage |
| Taxonomy review | No | No | No | No | No | Yes |
| Manage provider settings | No | No | No | No | No | Yes |

## 4. Entitlement Model

Use central capability helpers and plan flags.

Core entitlement dimensions:

- workspace access
- Library quota
- storage quota
- AI Parsing quota
- Practice quota
- feedback quota
- Study Group quota
- public discovery access
- school policy override
- verified review submission eligibility
- admin governance access

Example capability helper shape:

```text
can(user, "can_create_study_group", context)
can(user, "can_use_ai_parsing", context)
can(user, "can_publish_to_classroom", context)
```

The helper should consider:

- user profile role;
- organization membership;
- plan entitlement;
- school policy;
- Library membership;
- target workspace.

## 5. Avoid Overcomplication

Rules:

- Do not hard-code tier logic into every route.
- Do not create many membership roles when capability flags are enough.
- Keep visibility, membership role, and capability separate.
- Start with simple plan flags.
- Prefer central helpers over scattered `if teacher/student` checks.
- Avoid creating "student bank" and "teacher bank" tables if a universal Library model can support both safely.
- Do not let monetization logic weaken review gates.
- Do not let a paid plan bypass taxonomy governance or Verified review.

## 6. Paid Product Boundary Summary

| Product | Main Value | Boundary |
| --- | --- | --- |
| Free | Public study and light practice | limited quotas |
| Student Plus | self-study feedback, Study Groups, deeper practice | no teacher classroom control |
| Teacher Pro | private source import, review, classroom publish, evidence | no platform governance |
| School | managed teachers/students, policy, organization Libraries | school policy governs student features |
| Admin | governance, taxonomy, provider settings, verified review | not normal teaching/student flow |

The pricing model should make EduStruct feel like one universal learning content platform, with different workspaces and capabilities layered on top.
