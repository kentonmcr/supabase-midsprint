export interface Note {
  id: number;
  title: string;
  body: string;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: number;
  name: string;
  created_at: string;
}
