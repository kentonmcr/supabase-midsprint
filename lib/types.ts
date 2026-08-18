export interface Note {
  id: number;
  user_id: string;
  title: string;
  body: string;
  collection_id: number | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: number;
  user_id: string;
  name: string;
  share_token: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

export interface NoteTag {
  note_id: number;
  tag_id: number;
}
