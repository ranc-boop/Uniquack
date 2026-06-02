"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TagCheckboxOption = {
  id: string;
  name: string;
  status?: string | null;
  tag_type?: string | null;
};

type TagCheckboxListProps = {
  defaultValue?: string[];
  name?: string;
  tags: TagCheckboxOption[];
};

export function TagCheckboxList({
  defaultValue = [],
  name = "tag_ids",
  tags,
}: TagCheckboxListProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(defaultValue));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCount = useMemo(() => {
    if (!normalizedQuery) {
      return tags.length;
    }

    return tags.filter((tag) =>
      `${tag.name} ${tag.status ?? ""} ${tag.tag_type ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    ).length;
  }, [normalizedQuery, tags]);

  function toggleTag(tagId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(tagId);
      } else {
        next.delete(tagId);
      }

      return next;
    });
  }

  return (
    <div className="rounded-md border">
      <div className="border-b p-2">
        <Input
          aria-label="Search tags"
          placeholder="Search tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {selectedIds.size} selected · {visibleCount} shown
        </p>
      </div>
      <div className="max-h-52 overflow-y-auto p-2">
        {tags.map((tag) => {
          const matches =
            !normalizedQuery ||
            `${tag.name} ${tag.status ?? ""} ${tag.tag_type ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery);
          const checked = selectedIds.has(tag.id);

          return (
            <label
              key={tag.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted",
                !matches && "hidden",
              )}
            >
              <input
                type="checkbox"
                name={name}
                value={tag.id}
                checked={checked}
                onChange={(event) => toggleTag(tag.id, event.target.checked)}
                className="mt-1 size-4 rounded border"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tag.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {tag.tag_type ? (
                    <Badge variant="outline" className="text-[10px]">
                      {tag.tag_type}
                    </Badge>
                  ) : null}
                  {tag.status ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {tag.status}
                    </Badge>
                  ) : null}
                </span>
              </span>
            </label>
          );
        })}
        {!tags.length ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tags yet. Create tags first, then bind them here.
          </p>
        ) : null}
        {tags.length && !visibleCount ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tags match this search.
          </p>
        ) : null}
      </div>
    </div>
  );
}
