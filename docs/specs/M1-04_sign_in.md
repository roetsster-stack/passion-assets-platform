# M1-04 — The door: sign-in and the security baseline

_Spec drafted 28 Oct 2026; Michael's "go on M1-04" given the same evening. Format: Feature Spec Kit v1.1._

## JOB
Nothing of the collection shows to anyone until they have proven, twice, that they are the person
invited — and once they have, the record is theirs to see and nobody else's.

## THE EXPERIENCE
I open the address. There is no landing page, no marketing, no "sign up": one quiet screen, a
hairline, a field for my email, one button. I enter my email; the screen says the link is on its
way. The email arrives; I tap the link; I am asked for the six-digit code from my authenticator
app — the first time, I am shown a code to scan to set it up. Then the wall: "The works have
arrived. 106 works · private." Sign out is in the corner, on intent, and nowhere else.

On the phone it is the same. If I am not signed in, every address I try shows only that one quiet
screen. If someone types an address that was never invited, they see the same "on its way" and no
email is sent — the screen gives nothing away. A link that has been used or has expired says so in
one quiet line and nothing more. A session lasts; I am not asked daily. (How long before an idle
session is asked again is a dashboard setting — Authentication → Sessions — not a promise of the code.)

## GOOD LOOKS LIKE
- Any address, opened without a session, renders the sign-in screen and nothing else — no count,
  no data, nothing of the collection in the page.
- An email that was never invited gets the same message as mine, and no email.
- A session that has passed only the first step (the email link) sees nothing: the second factor
  is enforced by the database itself, not only by the screens.
- Signed in as a member, the count on the wall is the number in the ingest report; signed in as
  someone who is not a member of the collection, it is 0.
- Sign out works, and the back button brings nothing back.

## OUT OF SCOPE
- Passwords. Social sign-in. Self-serve sign-up. Password reset (there is none to reset).
- An invitations screen: in V1 the founder invites by a command on Workshop (`npm run invite`).
- Roles beyond member and owner. Sharing of any kind.
- The gallery (M1-03). Image URLs (M1-02).

## TASTE ANCHOR
The door of a private members' club: no sign on the street, no menu in the window, a name and you
are in. Steal the quiet. Avoid the fortress — no red warnings, no captcha, no "security" copy.

## OPEN TRADE-OFFS — decided in the plan below (Michael: "go", 28 Oct)
1. Enforce the second factor in the database (row-level security requires it), not only in the app?
2. Magic link, or a six-digit email code? (Both can be sent; the link opens in whichever browser
   clicks it, a code can be typed anywhere.)
3. Invite by command on Workshop, or by hand in the Supabase dashboard?

---

## PLAN — proposed and taken, 28 Oct 2026

**Shape.** Supabase Auth, which the stack already includes: a magic link to an invited email, then
a time-based one-time code (TOTP) from an authenticator app, enrolled on first sign-in. One
middleware guards every route: no session → the sign-in screen; a session that has passed only
the link → the second-factor screen; otherwise through. Sign-out is a POST.

**Trade-offs taken.** 1 — yes: the membership check in the database now also requires the session's
assurance level to be `aal2`, so a half-signed-in session reads zero rows even if a later screen
forgets to check. 2 — magic link, because it works with Supabase's default email and needs no
template change; the handler also accepts the email-code form, so switching later is a dashboard
setting. 3 — by command (`npm run invite -- someone@example.com`), which both creates the user and
makes them a member of the collection in one step; the dashboard cannot do the second half.

**Pieces.** `src/middleware.ts` (the guard; its decision is a pure function, tested) · `/sign-in`
(the one screen; a server action requests the link and always says the same thing) ·
`/auth/confirm` (turns the link into a session) · `/mfa` (enrol or challenge) · `/sign-out` ·
a migration that requires `aal2` in the membership functions · `scripts/invite.ts`.

**Needs from Michael, in the Supabase dashboard (once), in this order:**
1. Authentication → **Sign In / Up** → *Allow new users to sign up* = **off**. (The screen never creates
   accounts, but the project's public key could be asked to directly; this closes that door.)
2. Authentication → **Email Templates** → *Invite user*: replace the link with
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` — and *Magic Link* with the same
   ending in `type=magiclink`. With the default templates an invitation lands on `/auth/session` instead,
   which also works, and a magic link only opens in the browser that asked for it; with these it works
   from any device.
3. Authentication → **URL Configuration** → Site URL = the Vercel production address; add
   `https://*-roetsster-stack.vercel.app/**` under Redirect URLs.
4. On Workshop: `npm run invite -- <your email> --owner`, then **tap the invitation before asking the
   sign-in screen for a link** — an invited address that has not yet tapped its invitation cannot be sent a
   magic link.

**If the authenticator is lost:** on Workshop, `npm run invite -- <email> --reset-authenticator`; the next
sign-in enrols afresh. There is no self-service recovery, by design.

---

## BUILT — 28 Oct 2026 (PR #2, branch `m1-04-sign-in`)

**Checked — 28 Oct, cold review by a separate Claude session against `AGENTS.md`** (it read Supabase's
auth server source to trace the link shapes). No blockers; twelve findings, ten fixed in the same PR:
an invitation sent with the default template arrives with its session in the address fragment, which
the server cannot see — a client handler (`/auth/session`) now turns it into a session, and the template
that avoids it is in the list above · self-serve sign-up closed at the dashboard (above) · the invite
command defaults to viewer, promotes only when a flag says so, and can reset a lost authenticator · a
used or expired link says so in one line · the server log keeps the reason for a swallowed sign-in error
(never the address) · the door's decision drops a parameter it never read · the middleware's reach has a
test · the second-factor screen has a way out and runs its set-up once · the migration carries today's
date. Answered, not changed: the nonce-based Content-Security-Policy comes with M1-02 (the comment now
says so); session length is a dashboard setting; the sign-in screen's timing difference between a known
and unknown address is real and impractical to exploit at this scale.

See the PR note. Verify on the preview: open any address signed out → the sign-in screen; invite
yourself from Workshop; sign in; enrol the authenticator; the wall with the count. Open the same
address in a private window → the sign-in screen.
