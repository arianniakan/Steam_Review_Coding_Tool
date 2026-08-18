import Link from "next/link";

// A single, consistently-placed "go back one level" control — iOS-style
// chevron + parent screen name — distinct from Breadcrumbs, which shows the
// full path. Breadcrumbs answers "where am I"; this answers "where do I go
// back to." Omit on root-level pages (Games, Ingest), same as iOS omits a
// back button on a stack's root screen.
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 text-sm text-gray-600 hover:text-black"
    >
      <span aria-hidden className="text-base leading-none">
        ‹
      </span>
      {label}
    </Link>
  );
}
