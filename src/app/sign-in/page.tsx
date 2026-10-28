import { SignInForm } from "./SignInForm";

/**
 * The door. One quiet screen: a hairline, a field, a button. No landing page, no sign-up.
 * "The door of a private members' club: no sign on the street, a name and you are in."
 */
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const notice = link === "expired" ? "That link has been used or has expired. Ask for another." : null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <p className="mb-10 h-px w-10 bg-ink-faint" aria-hidden="true" />
        {notice ? <p className="mb-8 text-pretty text-sm text-ink-muted">{notice}</p> : null}
        <SignInForm />
        <p className="mt-16 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">private</p>
      </div>
    </main>
  );
}
