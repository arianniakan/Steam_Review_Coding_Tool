"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CodeRow {
  id: string;
  label: string;
  description: string;
  color: string;
  parentCodeId: string | null;
}

const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#0f172a",
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          className="h-6 w-6 rounded-full border-2"
          style={{ backgroundColor: c, borderColor: value === c ? "#000" : "transparent" }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
        className="h-6 w-6 rounded border border-gray-300"
      />
    </div>
  );
}

interface CodeFormValues {
  label: string;
  description: string;
  color: string;
  parentCodeId: string;
}

function CodeFormFields({
  values,
  onChange,
  codes,
  excludeCodeId,
}: {
  values: CodeFormValues;
  onChange: (values: CodeFormValues) => void;
  codes: CodeRow[];
  excludeCodeId?: string;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span>Label</span>
        <input
          required
          value={values.label}
          onChange={(e) => onChange({ ...values, label: e.target.value })}
          placeholder="e.g. performance_complaint"
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Description (when should this code apply?)</span>
        <textarea
          required
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          rows={2}
          placeholder="Reviewer mentions frame rate, stuttering, crashes, or load times as a reason for the score"
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-col gap-1">
          <span>Color</span>
          <ColorPicker
            value={values.color}
            onChange={(color) => onChange({ ...values, color })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span>Parent code (optional)</span>
          <select
            value={values.parentCodeId}
            onChange={(e) => onChange({ ...values, parentCodeId: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">None (top-level)</option>
            {codes
              .filter((c) => c.id !== excludeCodeId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
      </div>
    </>
  );
}

const EMPTY_FORM: CodeFormValues = {
  label: "",
  description: "",
  color: "#6b7280",
  parentCodeId: "",
};

export function CodeManager({
  codebookId,
  codes,
}: {
  codebookId: string;
  codes: CodeRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<CodeFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CodeFormValues>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/codebooks/${codebookId}/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label,
          description: form.description,
          color: form.color,
          parentCodeId: form.parentCodeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create code");
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(codeId: string) {
    setDeletingId(codeId);
    setError(null);
    try {
      const res = await fetch(`/api/codes/${codeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete code");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(code: CodeRow) {
    setEditingId(code.id);
    setEditError(null);
    setEditForm({
      label: code.label,
      description: code.description,
      color: code.color,
      parentCodeId: code.parentCodeId ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(codeId: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/codes/${codeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editForm.label,
          description: editForm.description,
          color: editForm.color,
          parentCodeId: editForm.parentCodeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update code");
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingEdit(false);
    }
  }

  function parentLabel(parentCodeId: string | null) {
    if (!parentCodeId) return null;
    return codes.find((c) => c.id === parentCodeId)?.label ?? null;
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {codes.map((code) =>
          editingId === code.id ? (
            <li key={code.id} className="rounded border border-gray-300 p-3 text-sm">
              <div className="flex flex-col gap-3">
                <CodeFormFields
                  values={editForm}
                  onChange={setEditForm}
                  codes={codes}
                  excludeCodeId={code.id}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(code.id)}
                    disabled={savingEdit}
                    className="self-start rounded bg-black px-4 py-1.5 text-white disabled:opacity-50"
                  >
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={cancelEdit} className="text-xs underline">
                    Cancel
                  </button>
                </div>
                {editError && <p className="text-red-600">{editError}</p>}
              </div>
            </li>
          ) : (
            <li
              key={code.id}
              className="flex items-start justify-between gap-3 rounded border border-gray-200 p-3 text-sm"
            >
              <div className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: code.color }}
                />
                <div>
                  <p className="font-medium">
                    {code.label}
                    {parentLabel(code.parentCodeId) && (
                      <span className="ml-2 text-xs text-gray-500">
                        under {parentLabel(code.parentCodeId)}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-600">{code.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <button onClick={() => startEdit(code)} className="text-xs underline">
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(code.id)}
                  disabled={deletingId === code.id}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  {deletingId === code.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ),
        )}
        {codes.length === 0 && (
          <li className="text-sm text-gray-500">No codes yet — add one below.</li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border border-gray-200 p-4 text-sm">
        <p className="font-medium">Add a code</p>
        <CodeFormFields values={form} onChange={setForm} codes={codes} />
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded bg-black px-4 py-1.5 text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add code"}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
    </div>
  );
}
