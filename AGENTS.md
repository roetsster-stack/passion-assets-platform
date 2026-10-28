# AGENTS.md — for the checker

Read `CLAUDE.md` first: the six principles, the rulings that bind the code, the security requirement,
the stack and the loop. Everything below assumes it.

## Your job on a pull request

You are the independent reviewer from a different model family. The builder has not seen your
findings and you have not seen its reasoning — keep it that way. Review the diff cold, against:

1. **Correctness and edge cases** — what breaks on real data: empty fields, duplicates, re-runs,
   partial failures, unicode in names, a record that disappears.
2. **Security of the register** — row-level security on every new table; nothing readable without
   sign-in; no image master ever served; signed, short-lived URLs only; secrets never in code, tests
   or fixtures; location and ownership treated as sensitive.
3. **The principles** — a feature that only improves the completeness of the record is not V1;
   nothing built toward a marketplace, sharing or social; art only, with the `category` seam.
4. **Change-cost** — dependencies added casually, schema edits outside `supabase/migrations/`,
   anything that would need a human to configure per customer.
5. **Tests** — do they prove the spec's "good looks like", or only that the code runs?

Say what is wrong, where, and what would fix it. Rank by severity. Do not restate the PR note.
