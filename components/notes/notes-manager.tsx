"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { createNote, updateNote, deleteNote, searchNoteIds } from "@/lib/notes";
import {
  createCollection,
  renameCollection,
  deleteCollection,
  shareCollection,
  unshareCollection,
} from "@/lib/collections";
import {
  createTag,
  renameTag,
  deleteTag,
  setNoteTags,
} from "@/lib/tags";
import { uploadNoteImage, deleteNoteImage } from "@/lib/storage";
import type { Note, Collection, Tag, NoteTag } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TagsSidebar } from "@/components/notes/tags-sidebar";
import { NoteRow } from "@/components/notes/note-row";
import { NO_COLLECTION, toggleId } from "@/components/notes/note-form-utils";

function byName<T extends { name: string | null }>(a: T, b: T): number {
  return (a.name ?? "").localeCompare(b.name ?? "");
}

async function getCurrentUserId(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Not signed in");
  return data.claims.sub as string;
}

export function NotesManager({
  initialNotes,
  initialCollections,
  initialTags,
  initialNoteTags,
}: {
  initialNotes: Note[];
  initialCollections: Collection[];
  initialTags: Tag[];
  initialNoteTags: NoteTag[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [collections, setCollections] =
    useState<Collection[]>(initialCollections);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [noteTags, setNoteTagsState] = useState<NoteTag[]>(initialNoteTags);

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    number | null
  >(null);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIds, setSearchMatchIds] = useState<Set<number> | null>(
    null,
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      searchRequestIdRef.current += 1;
      setSearchMatchIds(null);
      setSearchError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      const requestId = ++searchRequestIdRef.current;
      const supabase = createClient();
      try {
        const ids = await searchNoteIds(supabase, trimmed);
        if (requestId !== searchRequestIdRef.current) return; // superseded by a newer search
        setSearchMatchIds(new Set(ids));
        setSearchError(null);
      } catch (err: unknown) {
        if (requestId !== searchRequestIdRef.current) return;
        setSearchMatchIds(new Set());
        setSearchError(getErrorMessage(err));
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newNoteCollection, setNewNoteCollection] = useState(NO_COLLECTION);
  const [newNoteTagIds, setNewNoteTagIds] = useState<number[]>([]);
  const [newNoteImageFile, setNewNoteImageFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTagIdsForNote = (noteId: number) =>
    noteTags.filter((nt) => nt.note_id === noteId).map((nt) => nt.tag_id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsCreating(true);
    setError(null);

    try {
      let image_path: string | null = null;
      if (newNoteImageFile) {
        const userId = await getCurrentUserId(supabase);
        image_path = await uploadNoteImage(supabase, userId, newNoteImageFile);
      }

      let note;
      try {
        note = await createNote(supabase, {
          title,
          body,
          collection_id:
            newNoteCollection === NO_COLLECTION
              ? null
              : Number(newNoteCollection),
          image_path,
        });
      } catch (err: unknown) {
        // The note row was never created, so the freshly uploaded image
        // would otherwise be orphaned in Storage forever.
        if (image_path) {
          await deleteNoteImage(supabase, image_path).catch(() => {});
        }
        throw err;
      }
      await setNoteTags(supabase, note.id, newNoteTagIds);
      setNotes((prev) => [note, ...prev]);
      setNoteTagsState((prev) => [
        ...prev,
        ...newNoteTagIds.map((tagId) => ({ note_id: note.id, tag_id: tagId })),
      ]);
      setTitle("");
      setBody("");
      setNewNoteCollection(NO_COLLECTION);
      setNewNoteTagIds([]);
      setNewNoteImageFile(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveNote = async (
    id: number,
    updates: {
      title: string;
      body: string;
      collection_id: number | null;
      tagIds: number[];
      imageFile: File | null;
      removeImage: boolean;
    },
  ) => {
    const supabase = createClient();
    const { tagIds, imageFile, removeImage, ...noteUpdates } = updates;
    const existing = notes.find((n) => n.id === id);
    const oldImagePath = existing?.image_path ?? null;
    let newImagePath = oldImagePath;

    if (imageFile) {
      const userId = await getCurrentUserId(supabase);
      newImagePath = await uploadNoteImage(supabase, userId, imageFile);
    } else if (removeImage) {
      newImagePath = null;
    }

    // Update the DB row (the source of truth) before touching the old
    // Storage object — if this throws, the note still correctly points at
    // whatever image actually still exists, nothing is left broken.
    const updated = await updateNote(supabase, id, {
      ...noteUpdates,
      image_path: newImagePath,
    });

    if (oldImagePath && oldImagePath !== newImagePath) {
      await deleteNoteImage(supabase, oldImagePath).catch(() => {});
    }

    await setNoteTags(supabase, id, tagIds);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    setNoteTagsState((prev) => [
      ...prev.filter((nt) => nt.note_id !== id),
      ...tagIds.map((tagId) => ({ note_id: id, tag_id: tagId })),
    ]);
  };

  const handleDeleteNote = async (id: number) => {
    const supabase = createClient();
    const existing = notes.find((n) => n.id === id);
    await deleteNote(supabase, id);
    if (existing?.image_path) {
      await deleteNoteImage(supabase, existing.image_path).catch(() => {});
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setNoteTagsState((prev) => prev.filter((nt) => nt.note_id !== id));
  };

  const handleCreateCollection = async (name: string) => {
    const supabase = createClient();
    const collection = await createCollection(supabase, { name });
    setCollections((prev) => [...prev, collection].sort(byName));
  };

  const handleRenameCollection = async (id: number, name: string) => {
    const supabase = createClient();
    const updated = await renameCollection(supabase, id, name);
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? updated : c)).sort(byName),
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

  const handleShareCollection = async (id: number) => {
    const supabase = createClient();
    const updated = await shareCollection(supabase, id);
    setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleUnshareCollection = async (id: number) => {
    const supabase = createClient();
    const updated = await unshareCollection(supabase, id);
    setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleCreateTag = async (name: string) => {
    const supabase = createClient();
    const tag = await createTag(supabase, { name });
    setTags((prev) => [...prev, tag].sort(byName));
  };

  const handleRenameTag = async (id: number, name: string) => {
    const supabase = createClient();
    const updated = await renameTag(supabase, id, name);
    setTags((prev) => prev.map((t) => (t.id === id ? updated : t)).sort(byName));
  };

  const handleDeleteTag = async (id: number) => {
    const supabase = createClient();
    await deleteTag(supabase, id);
    setTags((prev) => prev.filter((t) => t.id !== id));
    setNoteTagsState((prev) => prev.filter((nt) => nt.tag_id !== id));
    setSelectedTagId((prev) => (prev === id ? null : prev));
  };

  const visibleNotes = notes
    .filter(
      (n) =>
        selectedCollectionId === null || n.collection_id === selectedCollectionId,
    )
    .filter(
      (n) =>
        selectedTagId === null || getTagIdsForNote(n.id).includes(selectedTagId),
    )
    .filter((n) => searchMatchIds === null || searchMatchIds.has(n.id));

  return (
    <div className="flex flex-col sm:flex-row gap-8">
      <div className="flex flex-col gap-8 w-full sm:w-56 shrink-0">
        <CollectionsSidebar
          collections={collections}
          selectedId={selectedCollectionId}
          onSelect={setSelectedCollectionId}
          onCreate={handleCreateCollection}
          onRename={handleRenameCollection}
          onDelete={handleDeleteCollection}
          onShare={handleShareCollection}
          onUnshare={handleUnshareCollection}
        />
        <TagsSidebar
          tags={tags}
          selectedId={selectedTagId}
          onSelect={setSelectedTagId}
          onCreate={handleCreateTag}
          onRename={handleRenameTag}
          onDelete={handleDeleteTag}
        />
      </div>

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
              {tags.length > 0 && (
                <div className="grid gap-2">
                  <Label>Tags</Label>
                  <div className="flex flex-col gap-2">
                    {tags.map((tag) => (
                      <div key={tag.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`new-tag-${tag.id}`}
                          checked={newNoteTagIds.includes(tag.id)}
                          onCheckedChange={() =>
                            setNewNoteTagIds((prev) => toggleId(prev, tag.id))
                          }
                        />
                        <Label
                          htmlFor={`new-tag-${tag.id}`}
                          className="font-normal"
                        >
                          {tag.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="image">Image (optional)</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setNewNoteImageFile(e.target.files?.[0] ?? null)
                  }
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Adding..." : "Add note"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Input
            type="search"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search notes"
          />
          {searchError && (
            <p className="text-sm text-red-500">{searchError}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {visibleNotes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No notes match the current filters.
            </p>
          )}
          {visibleNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              collections={collections}
              tags={tags}
              noteTagIds={getTagIdsForNote(note.id)}
              onSave={handleSaveNote}
              onDelete={handleDeleteNote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
