"use client";

import { useState } from "react";

const CLAMP_THRESHOLD = 140; // rough chars-per-2-lines — below this, clamping wouldn't visibly cut anything

export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = text.length > CLAMP_THRESHOLD;

  return (
    <div>
      <p className={`${className ?? ""} ${expanded || !needsToggle ? "" : "line-clamp-2"}`}>
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-xs text-gray-500 underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
