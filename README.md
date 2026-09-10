# Carline Hold

Emergency dismissal display. **A separate service from the PreK parent
dashboard** — separate code, separate data, separate Railway app, separate
passwords. A bad deploy on one cannot take down the other.

## What it is

A redundancy for the loudspeaker, never a replacement. An announcement is said
once and gone; a child who looked away has no way to check. This is the
scrollback. If it fails, dismissal falls back to exactly how it works today.

## The four screens

| URL | Who | What |
|---|---|---|
| `/type` | staff | Numeric keypad. Two people can type into the same queue. |
| `/staff` | staff | Every teacher's phone. The running list, filtered to their class. |
| `/display` | display **or** staff | The gym screen. Read-only. |
| `/roster` | staff | Car number → class → children. |

**Two passwords on purpose.** The gym screen signs in with `DISPLAY_PASSWORD`,
which can read the queue and nothing else. A screen left running in a room full
of children holds a credential that cannot send anyone anywhere.

## Railway setup (one time)

1. New Railway service in the same project, from this GitHub repo.
2. Set the deploy branch to **`carline-hold`**.
3. Environment variables:
   - `STAFF_PASSWORD` — teachers and office
   - `DISPLAY_PASSWORD` — the gym screen only
   - Railway supplies `PORT`.
4. Add a volume mounted at `/app/data` so the roster survives a redeploy.
   Without it the roster resets on every deploy.

Check `/healthz` — `{"ok":true,"defaults":false}`. If `defaults` is `true`, the
passwords did not take and the app is running on `dev-staff` / `dev-display`.

## Deploying

```
bash carline-hold/deploy.sh "what changed"
```

Snapshot deploy: it ships the whole folder as it stands, so skipped deploys are
never lost. `data/hold.json` is excluded — a live hold is not source code.

## Deliberately not built

**No "collected" tracking.** Nobody marks children off as they get into cars.
That step gets skipped under stress, and a skipped checkoff makes the screen
confidently wrong instead of merely behind. Called-vs-not is knowable from one
input; collected-vs-not needs 300 reliable observations from people whose hands
are full. The teacher at the car is verifying the driver — that is the safety
mechanism, and a phone competes with it.

"Is anyone left?" is answered by a person looking around the gym at the end.
