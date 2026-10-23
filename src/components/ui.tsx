import type { ComponentProps, ReactNode } from "react";

import { formatMoney } from "@/lib/money";

/**
 * The primitives every screen is built from, kept flat and compact on
 * purpose: see globals.css. Each one is a plain server component.
 */

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-3 flex items-center gap-2">
      <h1 className="text-lg font-semibold tracking-tight">{children}</h1>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A labelled band across the list, like a group of envelopes. */
export function Section({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="flex items-baseline border-b border-rule px-1 pb-1 text-xs font-semibold uppercase tracking-wide opacity-70 dark:border-white/15">
        <span>{title}</span>
        {aside ? <span className="num ml-auto">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "quiet" | "danger";
  /** `field` matches an input's height, for a button beside one. */
  size?: "sm" | "field" | "md";
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-ink text-paper hover:opacity-90 dark:bg-paper dark:text-ink",
    quiet: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
    danger: "bg-short text-white hover:opacity-90",
  }[variant];
  const sizes = { sm: "h-8 px-2.5 text-sm", field: "h-10 px-2.5 text-sm", md: "h-10 px-4 text-sm" }[size];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded font-medium disabled:opacity-50 ${sizes} ${styles} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-xs font-medium opacity-80">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-xs opacity-60">{hint}</span> : null}
    </label>
  );
}

/**
 * A control with no width of its own. Widths are added per use rather than
 * overridden: two Tailwind width classes on one element do not cascade in
 * the order written, so `w-full w-28` is not a narrow box. Height
 * likewise.
 */
export const controlClass =
  "rounded border border-black/20 bg-white px-2 " +
  "dark:border-white/20 dark:bg-panel dark:text-paper";

export const inputClass = `${controlClass} h-10 w-full`;

/** A narrow amount box that still keeps the 16px no-zoom floor. */
export const amountClass = `${controlClass} num h-10 w-28`;

export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  if (!children) return null;
  const styles =
    kind === "error"
      ? "border-short/40 bg-short/10 text-short dark:text-red-300"
      : "border-good/40 bg-good/10 text-good dark:text-green-300";
  return (
    <p role="status" className={`rounded border px-2 py-1.5 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-b border-rule px-1 py-3 text-sm opacity-60 dark:border-white/10">{children}</p>;
}

/**
 * An amount in cents. Negative is the one thing always shown in colour:
 * an overspent envelope or an overdrawn account needs to be seen first.
 */
export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return (
    <span className={`num ${cents < 0 ? "text-short dark:text-red-400" : ""} ${className}`}>
      {formatMoney(cents)}
    </span>
  );
}

/** One compact list row: label on the left, figures on the right. */
export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-h-9 items-center gap-2 border-b border-rule px-1 text-sm dark:border-white/10 ${className}`}
    >
      {children}
    </div>
  );
}
