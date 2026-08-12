"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { createNote, updateNote, deleteNote } from "@/lib/notes";
import {
  createCollection,
  renameCollection,
  deleteCollection,
} from "@/lib/collections";
import type { Note, Collection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CollectionsSidebar } from "@/components/notes/collections-sidebar";

const NO_COLLECTION = "none";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

export function NotesManager({
  initialNotes,
  initialCollections,
}: {
  initialNotes: Note[];
  initialCollections: Collection[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [collections, setCollections] =
    useState<Collection[]>(initialCollections);
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    number | null
  >(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newNoteCollection, setNewNoteCollection] = useState(NO_COLLECTION);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsCreating(true);
    setError(null);

    try {
      const note = await createNote(supabase, {
        title,
        body,
        collection_id:
          newNoteCollection === NO_COLLECTION
            ? null
            : Number(newNoteCollection),
      });
      setNotes((prev) => [note, ...prev]);
      setTitle("");
      setBody("");
      setNewNoteCollection(NO_COLLECTION);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveNote = async (
    id: number,
    updates: { title: string; body: string; collection_id: number | null },
  ) => {
    const supabase = createClient();
    const updated = await updateNote(supabase, id, updates);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  };

  const handleDeleteNote = async (id: number) => {
    const supabase = createClient();
    await deleteNote(supabase, id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleCreateCollection = async (name: string) => {
    const supabase = createClient();
    const collection = await createCollection(supabase, { name });
    setCollections((prev) =>
      [...prev, collection].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const handleRenameCollection = async (id: number, name: string) => {
    const supabase = createClient();
    const updated = await renameCollection(supabase, id, name);
    setCollections((prev) =>
      prev
        .map((c) => (c.id === id ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const handleDeleteCollection = async (id: number) => {
    const supabase = createClient();
    await deleteCollection(supabase, id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setNotes((prev) =>
      prev.map((n) =>
        n.collection_id === id ? { ...n, collection_id: null } : n,
      ),
    );
    setSelectedCollectionId((prev) => (prev === id ? null : prev));
  };

  const visibleNotes =
    selectedCollectionId === null
      ? notes
      : notes.filter((n) => n.collection_id === selectedCollectionId);

  return (
    <div className="flex flex-col sm:flex-row gap-8">
      <CollectionsSidebar
        collections={collections}
        selectedId={selectedCollectionId}
        onSelect={setSelectedCollectionId}
        onCreate={handleCreateCollection}
        onRename={handleRenameCollection}
        onDelete={handleDeleteCollection}
      />

      <div className="flex-1 flex flex-col gap-8 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New note</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="body">Body</Label>
                <Textarea
                  id="body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Collection</Label>
                <Select
                  value={newNoteCollection}
                  onValueChange={setNewNoteCollection}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COLLECTION}>
                      No collection
                    </SelectItem>
                    {collections.map((collection) => (
                      <SelectItem
                        key={collection.id}
                        value={String(collection.id)}
                      >
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Adding..." : "Add note"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {visibleNotes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedCollectionId === null
                ? "No notes yet."
                : "No notes in this collection."}
            </p>
          )}
          {visibleNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              collections={collections}
              onSave={handleSaveNote}
              onDelete={handleDeleteNote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  collections,
  onSave,
  onDelete,
}: {
  note: Note;
  collections: Collection[];
  onSave: (
    id: number,
    updates: { title: string; body: string; collection_id: number | null },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [collectionValue, setCollectionValue] = useState(
    note.collection_id === null ? NO_COLLECTION : String(note.collection_id),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionName = collections.find(
    (c) => c.id === note.collection_id,
  )?.name;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(note.id, {
        title,
        body,
        collection_id:
          collectionValue === NO_COLLECTION ? null : Number(collectionValue),
      });
      setIsEditing(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle(note.title);
    setBody(note.body);
    setCollectionValue(
      note.collection_id === null ? NO_COLLECTION : String(note.collection_id),
    );
    setError(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this note?")) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(note.id);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col gap-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Select value={collectionValue} onValueChange={setCollectionValue}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COLLECTION}>No collection</SelectItem>
              {collections.map((collection) => (
                <SelectItem key={collection.id} value={String(collection.id)}>
                  {collection.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{note.title}</CardTitle>
        {collectionName && <Badge variant="secondary">{collectionName}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-sm">{note.body}</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
