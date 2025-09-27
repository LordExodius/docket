/**
 * UserNote interface representing a note saved by the user.
 *
 * @property uuid - Unique identifier for the note
 * @property title - Title of the note
 * @property body - Body of the note in markdown format
 * @property lastUpdated - Timestamp of the last update in milliseconds since epoch
 * @property lastSynced - Timestamp of the last sync with remote storage in milliseconds since epoch
 */
interface UserNote {
  uuid: string;
  title: string;
  body: string;
  lastUpdated: number;
  lastSynced?: number;
}

interface NoteStore {
  noteMap: Map<string, UserNote>;
  indexToUUID: Map<number, string>;
  UUIDToIndex: Map<string, number>;
  deletedNotes: Set<string>;
}

export { UserNote, NoteStore };