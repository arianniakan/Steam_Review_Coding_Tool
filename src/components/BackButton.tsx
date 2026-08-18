import Link from "next/link";

// A single, consistently-placed "go back one level" control — iOS-style
// chevron + parent screen name — distinct from Breadcrumbs, which shows the
// full path. Breadcrumbs answers "where am I"; this answers "where do I go
// back to." Every page has one, including Games/Ingest (→ Home) — an absent
// back button reads as broken, not as "you're at the top."
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
