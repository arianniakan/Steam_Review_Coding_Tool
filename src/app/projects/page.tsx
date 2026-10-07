"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { listProjects, createProject, type ProjectWithCounts } from "@/lib/localDb/queries/projects";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithCounts[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await createProject(name);
      toast.success(`Created project "${created.name}"`);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={[{ label: "Projects" }]} />
      <div className="mt-2">
        <BackButton href="/" label="Home" />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">Projects</h1>
      <p className="mt-1 text-sm text-gray-500">
        A project groups several games under one shared codebook and analysis —
        for comparing coding across games rather than within just one.
      </p>

      {projects === null ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 text-sm hover:border-gray-400"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-gray-500">
                  {p.gameCount} game{p.gameCount === 1 ? "" : "s"} · {p.codebookCount}{" "}
                  codebook{p.codebookCount === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
          {projects.length === 0 && (
            <li className="text-sm text-gray-500">No projects yet — create one below.</li>
          )}
        </ul>
      )}

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name (e.g. Roguelike difficulty study)"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
    </main>
  );
}
