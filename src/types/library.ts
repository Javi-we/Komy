export type WorkType = "MANGA" | "BOOK" | "LIGHT_NOVEL" | "COMIC";
export type WorkStatus = "READING" | "PLAN_TO_READ" | "COMPLETED" | "ON_HOLD";
export type ReadingMode = "MANGA_RTL" | "BOOK_LTR" | "WEBTOON_VERTICAL";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  googleId?: string | null;
  role?: "ADMIN" | "USER";
}

export interface ChapterItem {
  id: string;
  volumeId: string;
  chapterNumber: number;
  title: string;
  startPage: number;
  fileUrl?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface BookmarkItem {
  id: string;
  workId: string;
  volumeId: string;
  pageNumber: number;
  label?: string | null;
  createdAt: string;
}

export interface VolumeItem {
  id: string;
  workId: string;
  volumeNumber: number;
  sortOrder: number;
  title: string;
  synopsis?: string | null;
  coverUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize: number;
  totalPages: number;
  currentPage: number;
  isCompleted: boolean;
  lastReadAt?: string | null;
  createdAt: string;
  updatedAt: string;
  chapters?: ChapterItem[];
  bookmarks?: BookmarkItem[];
}

export interface CollectionData {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  sortOrder: number;
  items?: {
    id: string;
    collectionId: string;
    workId: string;
  }[];
}

export interface WorkItem {
  id: string;
  userId?: string | null;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  releaseYear?: number | null;
  language?: string | null;
  description?: string | null;
  type: WorkType;
  status: WorkStatus;
  readingMode: ReadingMode;
  coverUrl?: string | null;
  isFavorite: boolean;
  rating: number;
  tags: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  volumes: VolumeItem[];
  bookmarks?: BookmarkItem[];
  collectionItems?: {
    id: string;
    collectionId: string;
    workId: string;
    collection: CollectionData;
  }[];
}
