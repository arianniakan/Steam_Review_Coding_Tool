"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { exportProject, importProject } from "@/lib/localDb/projectFile";

export function ProjectFileControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      await exportProject();
      toast.success("Project saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setBusy(false);
    }
  }

  function handleOpenClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (
      !confirm(
        `Open "${file.name}"? This replaces everything currently in this browser with the opened project.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await importProject(file);
      toast.success("Project loaded — reloading…");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open project");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm text-gray-600">
      <button type="button" onClick={handleExport} disabled={busy} className="hover:text-black hover:underline disabled:opacity-50">
        Save project
      </button>
      <button type="button" onClick={handleOpenClick} disabled={busy} className="hover:text-black hover:underline disabled:opacity-50">
        Open project
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".tar.gz,application/gzip"
        onChange={handleFileSelected}
        className="hidden"
      />
    </div>
  );
}
