"use client";

import { useState } from "react";

import type { Note, Collection, Tag } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { NoteImage } from "@/components/notes/note-image";
import { NO_COLLECTION, toggleId } from "@/components/notes/note-form-utils";

export function NoteRow({
  note,
  collections,
  tags,
  noteTagIds,
  onSave,
  onDelete,
}: {
  note: Note;
  collections: Collection[];
  tags: Tag[];
  noteTagIds: number[];
  onSave: (
    id: number,
    updates: {
      title: string;
      body: string;
      collection_id: number | null;
      tagIds: number[];
      imageFile: File | null;
      removeImage: boolean;
    },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [collectionValue, setCollectionValue] = useState(
    note.collection_id === null ? NO_COLLECTION : String(note.collection_id),
  );
  const [tagIds, setTagIds] = useState<number[]>(noteTagIds);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionName = collections.find(
    (c) => c.id === note.collection_id,
  )?.name;
  const noteTagNames = tags.filter((t) => noteTagIds.includes(t.id));

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(note.id, {
        title,
        body,
        collection_id:
          collectionValue === NO_COLLECTION ? null : Number(collectionValue),
        tagIds,
        imageFile,
        removeImage,
      });
      setImageFile(null);
      setRemoveImage(false);
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
    setTagIds(noteTagIds);
    setImageFile(null);
    setRemoveImage(false);
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
          {tags.length > 0 && (
            <div className="flex flex-col gap-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`note-${note.id}-tag-${tag.id}`}
                    checked={tagIds.includes(tag.id)}
                    onCheckedChange={() =>
                      setTagIds((prev) => toggleId(prev, tag.id))
                    }
                  />
                  <Label
                    htmlFor={`note-${note.id}-tag-${tag.id}`}
                    className="font-normal"
                  >
                    {tag.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`note-${note.id}-image`}>Image</Label>
            {note.image_path && !removeImage && !imageFile && (
              <div className="flex items-center gap-2">
                <NoteImage path={note.image_path} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRemoveImage(true)}
                >
                  Remove image
                </Button>
              </div>
            )}
            <Input
              id={`note-${note.id}-image`}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setImageFile(e.target.files?.[0] ?? null);
                setRemoveImage(false);
              }}
            />
          </div>
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
        <div className="flex flex-wrap gap-1 justify-end">
          {collectionName && <Badge variant="secondary">{collectionName}</Badge>}
          {noteTagNames.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-sm">{note.body}</p>
        {note.image_path && <NoteImage path={note.image_path} />}
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
