import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-3">
        <Link href="/" className="text-sm font-semibold">
          Steam Reviews Coding Tool
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/games" className="underline">
            Games
          </Link>
          <Link href="/ingest" className="underline">
            Ingest
          </Link>
        </nav>
      </div>
    </header>
  );
}
