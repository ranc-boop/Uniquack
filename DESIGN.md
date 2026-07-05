# EduStruct Design System Notes

## Design Principles

EduStruct UI should feel:

- calm
- serious
- education/productivity oriented
- evidence-first
- role-clear
- private-bank-first for teachers

Avoid:

- flashy AI magic
- wearable or health-dashboard feel in MVP
- hidden routes as primary product
- presentation-only demo UI in normal workflow

## Information Architecture

Teacher should see:

- Banks / Library
- Imports
- Review Drafts
- Classrooms
- Assignments
- Progress
- Course Builder

Student should see:

- My Classes
- My Work
- Practice
- Mistakes / Review

Admin should see:

- provider settings
- global taxonomy
- public/global bank
- support/review tools

## Layout Conventions

Use dashboard hubs before deep routes.

Use cards for summary and action groups.

Use tables for rosters, banks, questions, and progress.

Use status badges for state and ownership.

Use source and visibility labels near content actions.

Use safety callouts for review gates and privacy boundaries.

Use empty states with a next action.

## Status And Visibility Badges

Standard labels:

- Private
- Shared
- Organization
- Public
- Draft
- In Review
- Approved
- Published
- Assigned
- Assignment-only
- Owner
- Editor
- Viewer

Badges should be short and scannable. Long policy explanations belong in help text, not inside the main workflow.

## Teacher Bank UI

Teacher bank pages should clearly show:

- bank name
- visibility
- owner and members
- share code/access
- question count
- import actions
- Review Draft actions
- pull from public
- submit/promote to public
- use in assignment

Teacher bank pages should make raw IDs secondary. Human labels, titles, source names, and visibility should be primary.

## Error And Empty States

All empty states must answer:

- what happened
- why it matters
- next action

Examples:

- "No questions in this bank yet. Import source material or pull from the public library."
- "No Review Drafts ready. Run an import or create a manual draft first."
- "This assignment has no selected bank questions yet. Choose approved questions from a bank."

## Accessibility

Required:

- semantic headings
- readable contrast
- keyboard-reachable actions
- clear form labels
- clear errors
- mobile-safe cards and tables

Avoid horizontal overflow. IDs, paths, and long source names must wrap or move into secondary details.

