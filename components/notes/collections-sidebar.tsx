"use client";

import { useState } from "react";

import type { Collection } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

export function CollectionsSidebar({
  collections,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  collections: Collection[];
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
      <h2 className="font-semibold text-sm text-muted-foreground">
        Collections
      </h2>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "text-left text-sm rounded-md px-3 py-1.5 hover:bg-accent",
            selectedId === null && "bg-accent font-medium",
          )}
        >
          All notes
        </button>
        {collections.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            isSelected={selectedId === collection.id}
            onSelect={() => onSelect(collection.id)}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <Input
          placeholder="New collection"
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
          {isCreating ? "Adding..." : "Add collection"}
        </Button>
      </form>
    </div>
  );
}

function CollectionRow({
  collection,
  isSelected,
  onSelect,
  onRename,
  onDelete,
}: {
  collection: Collection;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onRename(collection.id, name);
      setIsEditing(false);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete "${collection.name}"? Notes in it will become uncategorized.`,
      )
    )
      return;
    setIsDeleting(true);
    try {
      await onDelete(collection.id);
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
        {collection.name}
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
