# What these are

The shop's schema lives in the hosted Supabase project, not in this repository,
so a change made there leaves no trace here. These files are the SQL that was
actually applied, kept so the change is reviewable and so the next person can
see why it exists.

They are a record, not a runner. Nothing in the site executes them; they were
applied through the Supabase SQL editor (or the equivalent) and are already
live. Re-running them is safe — each one is written to be idempotent — but it
is not something the site does for you.
