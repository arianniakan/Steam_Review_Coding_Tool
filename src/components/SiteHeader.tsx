import Link from "next/link";
import { ProjectFileControls } from "./ProjectFileControls";

export function SiteHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Steam Reviews Coding Tool
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <Link href="/games" className="hover:text-black hover:underline">
            Games
          </Link>
          <Link href="/ingest" className="hover:text-black hover:underline">
            Ingest
          </Link>
          <span className="text-gray-300">|</span>
          <ProjectFileControls />
        </nav>
      </div>
    </header>
  );
}
