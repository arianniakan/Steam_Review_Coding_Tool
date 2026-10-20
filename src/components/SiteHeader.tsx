import Link from "next/link";
import { ProjectFileControls } from "./ProjectFileControls";

export function SiteHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Steam Reviews Coding Tool
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm text-gray-600 sm:gap-4">
          <Link href="/games" className="hover:text-black hover:underline">
            Games
          </Link>
          <Link href="/projects" className="hover:text-black hover:underline">
            Projects
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
