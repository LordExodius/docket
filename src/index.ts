import { Marked } from "marked";
import DOMPurify from "dompurify";
import { markedHighlight } from "marked-highlight";
import markedFootnote from "marked-footnote";
import markedAlert from "marked-alert";
import hljs from "highlight.js/lib/core";

import { UserNote, NoteStore } from "./definitions";

// Import supported code languages (for size purposes)
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";

// Register languages to highlight.js
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);

// Marked object
const marked = new Marked(
  {
    gfm: true,
  },
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  }),
  markedFootnote(),
  markedAlert()
);

const timeout = 0;

// Global states for docket
let docketProps = {
  settings: {
    uiTheme: "light",
    codeStyle: "github",
  },
  tempProps: {
    draggedNote: null as HTMLLIElement | null,
    viewMode: "center" as "editor" | "center" | "reader",
    popupMode: false,
  },
  activeNoteUUID: "",
  noteStore: {
    noteMap: new Map<string, UserNote>(),
    indexToUUID: new Map<number, string>(),
    UUIDToIndex: new Map<string, number>(),
    deletedNotes: new Set<string>(), // Store deleted notes for syncing later
  } as NoteStore,
  dbConnection: undefined as IDBDatabase | undefined,
};

/**
 * Decode HTML entities in a string back to their original characters.
 * This is useful for displaying HTML encoded strings in input boxes such as the title.
 * @param input HTML encoded string to decode
 * @returns Decoded string
 */
const htmlDecode = (input: string): string => {
  var doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent || "";
};

/**
 * Load active note UUID from local storage and set active note.
 * If no active note is set, set the active note to the first note in the note store or create a new one if none exist.
 */
const loadActiveNote = () => {
  chrome.storage.local.get("activeNoteUUID", (result) => {
    if (result.activeNoteUUID) {
      docketProps.activeNoteUUID = result.activeNoteUUID;
      const activeNote = getNoteByUUID(docketProps.activeNoteUUID);
      setActiveNote(activeNote);
    } else {
      // Set active note to the first note or create a new one if none exist
      if (docketProps.noteStore.noteMap.size > 0) {
        setActiveNote(getNoteByIndex(0));
      } else {
        setActiveNote(createNote());
      }
    }
  });
};

/**
 * Load notes from IndexedDB to the active note store.
 * @param db IndexedDB database connection
 */
const loadIndexedDbNotes = (db: IDBDatabase) => {
  const transaction = db.transaction("notes", "readonly");
  const notesStore = transaction.objectStore("notes");
  const request = notesStore.getAll();
  request.onsuccess = (event) => {
    const notes = (event.target as IDBRequest).result;
    notes.forEach((note: UserNote) => {
      setNoteByUUID(note.uuid, note);
    });
    renderNoteList();
    loadActiveNote();
  };
};

const initDbConnection = async () => {
  const request = indexedDB.open("docketDB", 1);
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    // Create object store for notes
    if (!db.objectStoreNames.contains("notes")) {
      db.createObjectStore("notes", { keyPath: "uuid" });
      db.createObjectStore("noteOrder", { keyPath: "index" });
    }
    docketProps.dbConnection = db;
  };
  request.onsuccess = (event) => {
    docketProps.dbConnection = request.result;
    loadIndexedDbNoteOrder(docketProps.dbConnection);
    loadIndexedDbNotes(docketProps.dbConnection);
  };
  request.onerror = (event) => {
    console.error("Error opening indexedDB:", (event.target as IDBOpenDBRequest).error);
  };
};

/**
 * Get editor text from HTML element
 **/
const getHTMLEditorText = () => {
  return (<HTMLInputElement>document.getElementById("markdownInput")).value || "";
};

/**
 * Get note title from the HTML element
 **/
const getHTMLNoteTitle = () => {
  return (<HTMLInputElement>document.getElementById("noteTitle")).value || "unnamed";
};

/**
 * Return a note object given its UUID. Create a new note if it doesn't exist.
 * @param uuid UUID of note to get
 **/
const getNoteByUUID = (uuid: string): UserNote => {
  return docketProps.noteStore.noteMap.get(uuid) || createNote();
};

/**
 * Return a note object given its index in the note list. Create a new note if it doesn't exist.
 * @param index Index of note to get
 **/
const getNoteByIndex = (index: number): UserNote => {
  const uuid = docketProps.noteStore.indexToUUID.get(index);
  return docketProps.noteStore.noteMap.get(uuid!) || createNote();
};

/**
 * Set a note in the note store by UUID.
 * @param uuid UUID of note to set
 * @param note UserNote object to set
 */
const setNoteByUUID = (uuid: string, note: UserNote) => {
  if (!docketProps.noteStore.UUIDToIndex.has(uuid)) {
    // If the note does not exist, add it to the store
    const index = docketProps.noteStore.indexToUUID.size;
    docketProps.noteStore.indexToUUID.set(index, uuid);
    docketProps.noteStore.UUIDToIndex.set(uuid, index);
  }
  docketProps.noteStore.noteMap.set(uuid, note);
};

/**
 * Delete a note from the note store.
 * @param uuid UUID of note to delete.
 */
const deleteNoteByUUID = (uuid: string) => {
  // Remove note from noteStore
  docketProps.noteStore.noteMap.delete(uuid);

  // Delete note from indexedDB
  docketProps.dbConnection?.transaction("notes", "readwrite").objectStore("notes").delete(uuid);

  // Add note to deleted notes set for syncing later
  docketProps.noteStore.deletedNotes.add(uuid);

  // Remove note from indexToUUID and UUIDToIndex
  const index = docketProps.noteStore.UUIDToIndex.get(uuid);
  if (index !== undefined) {
    // If there are notes after this one, decrement their indices and set the active note
    for (let i = index + 1; i < docketProps.noteStore.indexToUUID.size; i++) {
      let uuidAtIndex = docketProps.noteStore.indexToUUID.get(i);
      if (uuidAtIndex) {
        docketProps.noteStore.UUIDToIndex.set(uuidAtIndex, i - 1);
        docketProps.noteStore.indexToUUID.set(i - 1, uuidAtIndex);
      }
    }
    docketProps.noteStore.UUIDToIndex.delete(uuid);
    docketProps.noteStore.indexToUUID.delete(docketProps.noteStore.indexToUUID.size - 1);
    if (docketProps.noteStore.noteMap.size > 0) {
      // Go back to home note
      setActiveNote(getNoteByIndex(0));
    } else {
      // If no notes left, create a new note
      setActiveNote(createNote());
    }
  }
  saveNoteOrder();
  renderNoteList();
};

/**
 * Move a note to a new index in the note list. This updates the location of all notes in the list to maintain order.
 * @param uuid UUID of the note to move
 * @param targetIndex The index to move the note to
 */
const moveNoteToIndex = (uuid: string, targetIndex: number) => {
  // Get the previous index of the note
  const prevIndex = docketProps.noteStore.UUIDToIndex.get(uuid);
  if (prevIndex && prevIndex < targetIndex) {
    // If moving down the list (index increases), decrement all indices between prevIndex and targetIndex
    for (let i = prevIndex + 1; i <= targetIndex; i++) {
      let uuidAtIndex = docketProps.noteStore.indexToUUID.get(i);
      if (uuidAtIndex) {
        docketProps.noteStore.UUIDToIndex.set(uuidAtIndex, i - 1);
        docketProps.noteStore.indexToUUID.set(i - 1, uuidAtIndex);
      }
    }
  } else if (prevIndex && prevIndex > targetIndex) {
    // If moving up the list (index decreases), increment all indices between targetIndex and prevIndex
    for (let i = prevIndex - 1; i >= targetIndex; i--) {
      let uuidAtIndex = docketProps.noteStore.indexToUUID.get(i);
      if (uuidAtIndex) {
        docketProps.noteStore.UUIDToIndex.set(uuidAtIndex, i + 1);
        docketProps.noteStore.indexToUUID.set(i + 1, uuidAtIndex);
      }
    }
  }
  // Update the note's index
  docketProps.noteStore.UUIDToIndex.set(uuid, targetIndex);
  docketProps.noteStore.indexToUUID.set(targetIndex, uuid);
  saveNoteOrder(); // Update indexedDB entry for note order
  // console.log(`Moved note ${uuid} to index ${targetIndex}`);
};

/**
 * Return the active note from the current docket instance. Returns `undefined` if no active note is set.
 * @returns `UserNote` object containing title and body of currently active note
 */
const getActiveNote = (): UserNote | undefined => {
  return getNoteByUUID(docketProps.activeNoteUUID);
};

/**
 * Render markdown from the editor to preview panel.
 */
const renderMarkdown = () => {
  const markdownOutput = <HTMLElement>document.getElementById("markdownOutput");
  if (markdownOutput.style.display === "none") {
    return;
  } // Prevent rendering when editor is minimized

  // Parse markdown and sanitize HTML output
  const editorText = getHTMLEditorText();
  markdownOutput.innerHTML = DOMPurify.sanitize(marked.parse(editorText) as keyof typeof String);
};

/**
 * Load active note from `noteList` by UUID to the editor.
 * @param uuid UUID of note to load
 */
const noteClickHandler = (uuid: string) => {
  const userNote = <UserNote>getNoteByUUID(uuid);
  setActiveNote(userNote);
};

/**
 * Update saved notes in the navbar.
 *
 * This function sorts the saved notes by their order and renders them as links in the navbar.
 * Also initializes drag-and-drop functionality for reordering notes.
 */
const renderNoteList = () => {
  // console.log("Rendering note list...");
  // Load all saved notes to the navbar
  const noteListElement = document.getElementById("noteList");
  (<HTMLElement>noteListElement).innerHTML = "";
  let UUIDsByIndex = [...docketProps.noteStore.UUIDToIndex.entries()].sort((a, b) => a[1] - b[1]);
  // console.log(UUIDsByIndex)
  UUIDsByIndex.forEach((uuidAndIndex, _index) => {
    // Create a new list item for each note
    let uuid = uuidAndIndex[0];
    let note = docketProps.noteStore.noteMap.get(uuid);
    if (!note) {
      return;
    }
    let noteElement: HTMLLIElement = document.createElement("li");
    noteElement.classList.add("noteListItem");
    noteElement.id = uuid;
    noteElement.setAttribute("tabindex", "0");
    noteElement.title = note.title; // Set full title as tooltip
    noteElement.draggable = true;
    if (uuid === docketProps.activeNoteUUID) {
      noteElement.classList.add("active");
    }

    // Add event listeners for hover, drag, and click events
    noteElement.addEventListener("mouseover", (e) => {
      (<HTMLLIElement>e.target).classList.add("hover");
    });
    noteElement.addEventListener("mouseout", (e) => {
      (<HTMLLIElement>e.target).classList.remove("hover");
    });
    // Drag and drop functionality
    noteElement.addEventListener("dragstart", (e) => {
      if (e.dataTransfer != undefined) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", note.uuid);
        docketProps.tempProps.draggedNote = <HTMLLIElement>e.target;
        noteElement.classList.add("dragging");
      }
    });
    noteElement.addEventListener("dragend", () => {
      if (docketProps.tempProps.draggedNote) {
        docketProps.tempProps.draggedNote.classList.remove("dragging");
        docketProps.tempProps.draggedNote = null;
      }
    });
    noteElement.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer != undefined) {
        e.dataTransfer.dropEffect = "move";
        (<HTMLLIElement>e.target).classList.add("over");
      }
    });
    noteElement.addEventListener("dragleave", (e) => {
      (<HTMLLIElement>e.target).classList.remove("over");
    });
    noteElement.addEventListener("drop", (e) => {
      e.preventDefault();
      (<HTMLLIElement>e.target).classList.remove("over");
      // Move the note to the new index
      if (!(<HTMLElement>e.target).classList.contains("noteListItem")) {
        console.error("Target is not a noteListItem");
        return;
      }
      if (e.dataTransfer == undefined) {
        return;
      }
      const draggedUUID = e.dataTransfer.getData("text/plain");
      const targetUUID = (<HTMLLIElement>e.target).id;
      if (!draggedUUID || !targetUUID) {
        return;
      }
      const targetIndex = docketProps.noteStore.UUIDToIndex.get(targetUUID)!;

      // Reparent the note list
      const parentElement = (<HTMLElement>e.target).parentElement;
      if (targetIndex === docketProps.noteStore.noteMap.size) {
        parentElement?.insertBefore(docketProps.tempProps.draggedNote!, null);
      } else if (targetIndex > docketProps.noteStore.UUIDToIndex.get(draggedUUID)!) {
        parentElement?.insertBefore(docketProps.tempProps.draggedNote!, (<HTMLElement>e.target).nextElementSibling);
      } else {
        parentElement?.insertBefore(docketProps.tempProps.draggedNote!, <HTMLElement>e.target);
      }
      // Update note order in note store
      moveNoteToIndex(draggedUUID, targetIndex!);
    });
    noteElement.addEventListener("click", noteClickHandler.bind(null, note.uuid));

    // Set note title and add to sidebar
    noteElement.innerHTML = DOMPurify.sanitize(note.title);
    (<HTMLElement>noteListElement).appendChild(noteElement);
  });
};

/** Save changes to the currently active note to note store and indexedDB. */
const saveActiveNote = () => {
  if (!docketProps.dbConnection) {
    alert("Error: Database connection is not initialized. Note has not been saved.");
    return;
  }
  const userNote = getActiveNote();
  if (userNote) {
    docketProps.noteStore.noteMap.set(userNote.uuid, userNote);
    // Update the note's title and body from the editor
    userNote.title = htmlDecode(getHTMLNoteTitle());
    userNote.body = htmlDecode(getHTMLEditorText());
    userNote.lastUpdated = Date.now();

    // Add or update the note in indexedDB
    const transaction = docketProps.dbConnection.transaction("notes", "readwrite");
    const notesStore = transaction.objectStore("notes");
    notesStore.put(userNote);
  }
};

const saveNoteOrder = () => {
  const serialized = JSON.stringify(Array.from(docketProps.noteStore.indexToUUID));
  docketProps.dbConnection?.transaction("noteOrder", "readwrite").objectStore("noteOrder").put({ index: 1, order: serialized });
};

/**
 * The note order is stored as a single entry in the `noteOrder` object store with key `1`.
 * The value is a JSON string representing an array of <index, uuid> pairs.
 * This function retrieves that entry and reconstructs the `indexToUUID` and `UUIDToIndex` maps.
 */
const loadIndexedDbNoteOrder = (db: IDBDatabase) => {
  const request = db.transaction("noteOrder", "readonly").objectStore("noteOrder").getAll(1);
  request.onsuccess = (event) => {
    const serialized = (event.target as IDBRequest).result[0]["order"];
    const parsed = JSON.parse(serialized);

    docketProps.noteStore.indexToUUID = new Map(parsed);
    docketProps.noteStore.indexToUUID.forEach((uuid: string, index: number) => {
      docketProps.noteStore.UUIDToIndex.set(uuid, index);
    });
  };
};

interface LastExecuted {
  msSinceLastInput: number;
  msSinceLastUpdate: number;
}

/** Debounce rendering for final input detected. */
const debounce = (lastExecuted: LastExecuted) => {
  if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
    // console.log("Debounce")
    renderMarkdown();
    saveActiveNote();
    renderNoteList();
  }
};

/**
 * Input handler for updates to the markdown editor/title
 * @param lastExecuted LastExecuted object containing timestamps of last input and last update
 */
const handleInput = (lastExecuted: LastExecuted) => {
  let currTime = Date.now();
  // debounce final input
  lastExecuted.msSinceLastInput = currTime;
  setTimeout(debounce, timeout, lastExecuted);

  // rerender every `timeout` ms while typing
  if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
    renderMarkdown();
    saveActiveNote();
    renderNoteList();
    lastExecuted.msSinceLastUpdate = currTime;
  }
};

/**
 * Save entire note store to indexedDB.
 */
const saveNoteStore = () => {
  if (!docketProps.dbConnection) {
    alert("Error: Database connection is not initialized. Note store has not been saved.");
    return;
  }

  const transaction = docketProps.dbConnection.transaction("notes", "readwrite");
  const notesStore = transaction.objectStore("notes");
  for (const note of docketProps.noteStore.noteMap.values()) {
    notesStore.put(note);
  }
};

/**
 * Start a new note and add it to the note store and indexedDB.
 */
const createNote = (noteTemplate?: Partial<UserNote>): UserNote => {
  // Create a new note object
  const newNote: UserNote = {
    uuid: crypto.randomUUID(),
    title: noteTemplate?.title || "New Note",
    body: noteTemplate?.body || "",
    lastUpdated: Date.now(),
  };

  // Add the new note to the note store
  setNoteByUUID(newNote.uuid, newNote);

  // Add new note to indexedDB
  docketProps.dbConnection?.transaction("notes", "readwrite").objectStore("notes").add(newNote);

  // Render the updated note list
  renderNoteList();
  saveNoteOrder();
  return newNote;
};

/**
 * Set active note to a `UserNote` object.
 * @param userNote UserNote object to set as active note
 */
const setActiveNote = (userNote: UserNote) => {
  // Remove styling from previous active note
  const prevActiveNote = <HTMLLIElement>document.getElementById(docketProps.activeNoteUUID);
  prevActiveNote?.classList.remove("active");
  // Set active note UUID
  docketProps.activeNoteUUID = userNote.uuid;
  // Set active note in local storage
  chrome.storage.local.set({ activeNoteUUID: docketProps.activeNoteUUID });
  const noteTitleElement = <HTMLInputElement>document.getElementById("noteTitle");
  const noteEditorElement = <HTMLInputElement>document.getElementById("markdownInput");
  const noteListItem = <HTMLLIElement>document.getElementById(docketProps.activeNoteUUID);
  noteTitleElement.value = docketProps.noteStore.noteMap.get(userNote.uuid)!.title;
  noteEditorElement.value = docketProps.noteStore.noteMap.get(userNote.uuid)!.body;
  noteListItem?.classList.add("active");
  saveActiveNote();
  renderMarkdown();
};

const newNoteHandler = () => {
  setActiveNote(createNote());
};

/**
 * Calls `deleteNoteByUUID` on `currentUUID` if user confirms deletion.
 */
const deleteActiveNote = () => {
  if (confirm("Are you sure you want to delete this note?")) {
    deleteNoteByUUID(docketProps.activeNoteUUID);
  }
};

/**
 * Download the currently active note as a markdown file.
 */
const downloadActiveNote = () => {
  const activeNote = getActiveNote();
  if (!activeNote) {
    return;
  }
  const blob = new Blob([activeNote.body], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = activeNote.title + ".md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Set theme for all elements with `data-theme` attribute.
 * @param theme name of theme to set
 */
const setTheme = (theme: string) => {
  chrome.storage.local.set(docketProps.settings);
  const themedElements = document.querySelectorAll("[data-theme]");
  themedElements.forEach((element) => {
    element.setAttribute("data-theme", theme);
  });
};

/**
 * Toggle dark mode on or off depending on the state of the `darkModeSlider` checkbox.
 */
const toggleDarkMode = () => {
  const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider");
  docketProps.settings.uiTheme = darkModeSlider.checked ? "dark" : "light";
  // console.log(`Setting theme to ${docketInstance.settings.uiTheme}`)
  setTheme(docketProps.settings.uiTheme);
};

/**
 * Update code style based on selection from `codeStyleDropdown`.
 */
const updateCodeStyle = () => {
  // clear old stylesheet if exists
  const oldStyleSheet = document.getElementById("codeStylesheet");
  if (oldStyleSheet) {
    oldStyleSheet.parentNode?.removeChild(oldStyleSheet);
  }

  // set new stylesheet
  docketProps.settings.codeStyle = (<HTMLSelectElement>document.getElementById("codeStyleDropdown")).value;
  chrome.storage.local.set(docketProps.settings);
  const codeStylesheetElement = document.createElement("link");
  codeStylesheetElement.rel = "stylesheet";
  codeStylesheetElement.href = `code_themes/${docketProps.settings.codeStyle}.css`;
  codeStylesheetElement.id = "codeStylesheet";
  document.head.appendChild(codeStylesheetElement);
};

/** Open the markdown input panel. */
const openMarkdownInput = () => {
  const markdownInput = <HTMLInputElement>document.getElementById("markdownInput");
  const editorDivider = <HTMLElement>document.getElementById("editorDivider");
  markdownInput.style.display = "block";
  editorDivider.style.display = "block";
};
/** Close the markdown input panel. */
const closeMarkdownInput = () => {
  const markdownInput = <HTMLInputElement>document.getElementById("markdownInput");
  const editorDivider = <HTMLElement>document.getElementById("editorDivider");
  markdownInput.style.display = "none";
  editorDivider.style.display = "none";
};

/** Open the markdown output panel. */
const openMarkdownOutput = () => {
  const markdownOutput = <HTMLElement>document.getElementById("markdownOutput");
  markdownOutput.style.display = "block";
};
/** Close the markdown output panel. */
const closeMarkdownOutput = () => {
  const markdownOutput = <HTMLElement>document.getElementById("markdownOutput");
  markdownOutput.style.display = "none";
};

const editorMode = () => {
  docketProps.tempProps.viewMode = "editor";
  leftPaneRadio.checked = true;
  closeMarkdownOutput();
  openMarkdownInput();
};

const centerMode = () => {
  docketProps.tempProps.viewMode = "center";
  centerPaneRadio.checked = true;
  openMarkdownInput();
  openMarkdownOutput();
};

const readerMode = () => {
  docketProps.tempProps.viewMode = "reader";
  rightPaneRadio.checked = true;
  openMarkdownOutput();
  closeMarkdownInput();
};

const openSidebar = () => {
  const sidebar = <HTMLElement>document.getElementById("sidebar");
  sidebar.style.display = "flex";
};
const closeSidebar = () => {
  const sidebar = <HTMLElement>document.getElementById("sidebar");
  sidebar.style.display = "none";
};

/**
 * Toggle sidebar display on or off.
 */
const toggleSidebar = () => {
  const sidebar = <HTMLElement>document.getElementById("sidebar");
  if ((!sidebar.style.display && window.innerWidth < 768) || sidebar.style.display === "none") {
    openSidebar();
  } else {
    closeSidebar();
  }
};

// Media query listener for sidebar
const sidebarMediaQuery = window.matchMedia("(width > 48rem)");
sidebarMediaQuery.addEventListener("change", (e) => {
  if (e.matches) {
    openSidebar();
  } else {
    closeSidebar();
  }
});

/**
 * Run all initialization functions to set up the Docket application.
 */
const initializeDocket = () => {
  // Sync notes from indexedDB
  // console.log("Initializing IndexedDB connection...")
  initDbConnection();

  // Load settings from local storage
  chrome.storage.local.get(null, (result) => {
    docketProps.settings.codeStyle = result.codeStyle || "github";
    const codeStyleDropdown = <HTMLSelectElement>document.getElementById("codeStyleDropdown");
    codeStyleDropdown.value = docketProps.settings.codeStyle;
    updateCodeStyle();

    docketProps.settings.uiTheme = result.uiTheme || "light";
    const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider");
    darkModeSlider.checked = result.uiTheme === "dark";
    toggleDarkMode();
  });

  // Configure popup specific settings
  docketProps.tempProps.popupMode = window.location.search.includes("popup=true");
  if (docketProps.tempProps.popupMode) {
    // Display notes in reader mode by default
    document.getElementById("docketBody")?.classList.add("popup");
    readerMode();
  }
};

window.addEventListener("load", initializeDocket);

// SIDEBAR TOGGLE EVENT LISTENERS
const sidebarToggleButton = <HTMLButtonElement>document.getElementById("sidebarToggleButton");
sidebarToggleButton.addEventListener("click", toggleSidebar);
const insetSidebarToggleButton = <HTMLButtonElement>document.getElementById("sidebarToggleButtonInset");
insetSidebarToggleButton.addEventListener("click", toggleSidebar);

window.addEventListener("keydown", (e) => {
  if (e.key === "h" && e.ctrlKey) {
    e.preventDefault();
    toggleSidebar();
  }
});

// CODESTYLE EVENT LISTENER
const codeStyleDropdown = <HTMLSelectElement>document.getElementById("codeStyleDropdown");
codeStyleDropdown.addEventListener("change", updateCodeStyle);

// DARKMODE EVENT LISTENER
const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider");
darkModeSlider.addEventListener("change", toggleDarkMode);

/*
 * View setting event listeners
 **/
const leftPaneRadio = <HTMLInputElement>document.getElementById("leftPane");
const centerPaneRadio = <HTMLInputElement>document.getElementById("centerPane");
const rightPaneRadio = <HTMLInputElement>document.getElementById("rightPane");
leftPaneRadio.addEventListener("change", () => {
  if (leftPaneRadio.checked) {
    editorMode();
  }
});
centerPaneRadio.addEventListener("change", () => {
  if (centerPaneRadio.checked) {
    centerMode();
  }
});
rightPaneRadio.addEventListener("change", () => {
  if (rightPaneRadio.checked) {
    readerMode();
  }
});

// DELETE NOTE EVENT LISTENER
const deleteNoteButton = <HTMLButtonElement>document.getElementById("deleteNoteButton");
deleteNoteButton.addEventListener("click", deleteActiveNote);

// NEWNOTE EVENT LISTENER
const newNoteButton = <HTMLButtonElement>document.getElementById("newNoteButton");
newNoteButton.addEventListener("click", newNoteHandler);

// DOWNLOAD NOTE EVENT LISTENER
const downloadNoteButton = <HTMLButtonElement>document.getElementById("downloadNoteButton");
downloadNoteButton.addEventListener("click", downloadActiveNote);

// EDITOR EVENT LISTENERS
const markdownInput = <HTMLInputElement>document.getElementById("markdownInput");
const mdTitle = <HTMLElement>document.getElementById("noteTitle");

/**
 * Resync notes when tab is hidden and made visible
 */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    initializeDocket();
  }
});

/**
 * Resync notes when window is focused
 */
window.addEventListener("focus", initializeDocket);

markdownInput.addEventListener(
  "input",
  handleInput.bind(undefined, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now(),
  })
);

mdTitle.addEventListener(
  "input",
  handleInput.bind(undefined, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now(),
  })
);

// Override default tab behaviour
markdownInput.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    if (markdownInput.selectionStart === markdownInput.selectionEnd) {
      markdownInput.setRangeText("\t", markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0, "end");
    } else {
      // markdownInput.setRangeText(
      //   "\t" + markdownInput.value.slice(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0).replace("\n", "\n\t"),
      //   markdownInput.selectionStart || 0,
      //   markdownInput.selectionEnd || 0,
      //   "preserve"
      // );
    }
  }
  if (e.key === "b" && e.ctrlKey) {
    if (markdownInput.selectionStart !== markdownInput.selectionEnd) {
      e.preventDefault();
      markdownInput.setRangeText(
        "**" + markdownInput.value.substring(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0) + "**",
        markdownInput.selectionStart || 0,
        markdownInput.selectionEnd || 0,
        "select"
      );
    }
  }
  if (e.key === "i" && e.ctrlKey) {
    if (markdownInput.selectionStart !== markdownInput.selectionEnd) {
      e.preventDefault();
      markdownInput.setRangeText(
        "*" + markdownInput.value.substring(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0) + "*",
        markdownInput.selectionStart || 0,
        markdownInput.selectionEnd || 0,
        "select"
      );
    }
  }
  if (e.key === "~") {
    if (markdownInput.selectionStart !== markdownInput.selectionEnd) {
      e.preventDefault();
      markdownInput.setRangeText(
        "~~" + markdownInput.value.substring(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0) + "~~",
        markdownInput.selectionStart || 0,
        markdownInput.selectionEnd || 0,
        "select"
      );
    }
  }
  if (e.key === "`") {
    if (markdownInput.selectionStart !== markdownInput.selectionEnd) {
      e.preventDefault();
      markdownInput.setRangeText(
        "`" + markdownInput.value.substring(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0) + "`",
        markdownInput.selectionStart || 0,
        markdownInput.selectionEnd || 0,
        "select"
      );
    }
  }
  if (e.key === "l" && e.ctrlKey) {
    e.preventDefault();
    markdownInput.setRangeText(
      "[" + markdownInput.value.substring(markdownInput.selectionStart || 0, markdownInput.selectionEnd || 0) + "](url)",
      markdownInput.selectionStart || 0,
      markdownInput.selectionEnd || 0,
      "select"
    );
  }
  renderMarkdown();
  saveActiveNote();
});
