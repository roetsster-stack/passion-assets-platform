"use client";

import { useActionState } from "react";
import { requestLink, type SignInState } from "./actions";

const initial: SignInState = { sent: false };

export function SignInForm() {
  const [state, action, pending] = useActionState(requestLink, initial);

  if (state.sent) {
    return (
      <p className="text-pretty text-lg leading-relaxed text-ink">
        If that address is on the list, the link is on its way.
      </p>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col items-center gap-5">
      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        placeholder="your email"
        className="w-full border-0 border-b border-ink-faint bg-transparent px-1 py-2 text-center font-serif text-lg text-ink outline-none placeholder:text-ink-faint focus:border-ink-muted"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? "one moment" : "send me the link"}
      </button>
      {state.error ? <p className="text-sm text-ink-muted">{state.error}</p> : null}
    </form>
  );
}
