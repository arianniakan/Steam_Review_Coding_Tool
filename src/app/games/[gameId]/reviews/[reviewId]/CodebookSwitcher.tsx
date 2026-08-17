"use client";

interface Codebook {
  id: string;
  name: string;
}

export function CodebookSwitcher({
  codebooks,
  activeCodebookId,
}: {
  codebooks: Codebook[];
  activeCodebookId: string;
}) {
  return (
    <form method="get" className="text-sm">
      <select
        name="codebookId"
        defaultValue={activeCodebookId}
        onChange={(e) => e.currentTarget.form?.submit()}
        className="rounded border border-gray-300 px-2 py-1"
      >
        {codebooks.map((cb) => (
          <option key={cb.id} value={cb.id}>
            {cb.name}
          </option>
        ))}
      </select>
    </form>
  );
}
