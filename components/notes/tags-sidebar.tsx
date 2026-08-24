"use client";

import { useState } from "react";

import type { Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getErrorMessage } from "@/lib/utils";

export function TagsSidebar({
  tags,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  tags: Tag[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    try {
      await onCreate(newName);
      setNewName("");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full sm:w-56 shrink-0">
      <h2 className="font-semibold text-sm text-muted-foreground">Tags</h2>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "text-left text-sm rounded-md px-3 py-1.5 hover:bg-accent",
            selectedId === null && "bg-accent font-medium",
          )}
        >
          All tags
        </button>
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            isSelected={selectedId === tag.id}
            onSelect={() => onSelect(tag.id)}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <Input
          placeholder="New tag"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isCreating}
        >
          {isCreating ? "Adding..." : "Add tag"}
        </Button>
      </form>
    </div>
  );
}

function TagRow({
  tag,
  isSelected,
  onSelect,
  onRename,
  onDelete,
}: {
  tag: Tag;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onRename(tag.id, name);
      setIsEditing(false);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(`Delete tag "${tag.name}"? It will be removed from all notes.`)
    )
      return;
    setIsDeleting(true);
    try {
      await onDelete(tag.id);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-sm"
          autoFocus
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          Save
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-accent",
        isSelected && "bg-accent font-medium",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 text-left text-sm truncate"
      >
        {tag.name}
      </button>
      <div className="hidden group-hover:flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
