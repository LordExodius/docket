import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { markedHighlight } from 'marked-highlight'
import markedFootnote from 'marked-footnote'
import hljs from 'highlight.js/lib/core'
// Import supported code languages (for size purposes)
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'

hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('typescript', typescript)

// Marked object
const marked = new Marked(
    {
        gfm: true
    },
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang, info) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext'
          return hljs.highlight(code, { language }).value
        }
      }),
    markedFootnote()
);

const timeout = 0;

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
    uuid: string,
    title: string,
    body: string,
    lastUpdated: number,
    lastSynced?: number,
}

interface NoteStore {
    noteMap: Map<string, UserNote>,
    indexToUUID: Map<number, string>,
    UUIDToIndex: Map<string, number>,
    deletedNotes: Set<string>,
}

let docketInstance = {
    settings: {
        uiTheme: "light",
        codeStyle: "github"
    },
    tempProps: {
        draggedNote: null as HTMLLIElement | null,
    },
    activeNoteUUID: "",
    noteStore: {
        noteMap: new Map<string, UserNote>(),
        indexToUUID: new Map<number, string>(),
        UUIDToIndex: new Map<string, number>(),
        deletedNotes: new Set<string>(), // Store deleted notes for syncing later
    } as NoteStore,
    dbConnection: undefined as IDBDatabase | undefined,
}

/**
 * Decode HTML entities in a string back to their original characters.
 * This is useful for displaying HTML encoded strings in input boxes such as the title.
 * @param input HTML encoded string to decode
 * @returns Decoded string
 */
const htmlDecode = (input: string): string => {
  var doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent || "";
}


const loadActiveNoteFromStorage = () => {
    // Load active note from local storage
    chrome.storage.local.get("activeNoteUUID", (result) => {
        if (result.activeNoteUUID) {
            docketInstance.activeNoteUUID = result.activeNoteUUID;
            const activeNote = getNoteByUUID(docketInstance.activeNoteUUID);
            setActiveNote(activeNote);
        } else {
            // Set active note to the first note or create a new one if none exist
            if (docketInstance.noteStore.noteMap.size > 0) {
                setActiveNote(getNoteByIndex(0));
            } else {
                setActiveNote(createNote());
            }
        }
    });
}

const loadIndexedDbNotes = (db: IDBDatabase) => {
    // Load notes from indexedDB
    const transaction = db.transaction("notes", "readonly");
    const notesStore = transaction.objectStore("notes");
    const request = notesStore.getAll();
    request.onsuccess = (event) => {
        const notes = (event.target as IDBRequest).result;
        notes.forEach((note: UserNote) => {
            setNoteByUUID(note.uuid, note);
        });
        renderNoteList();
        loadActiveNoteFromStorage();
    };
}

const initDbConnection = async () => {
    const request = indexedDB.open("docketDB", 1);
    request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Create object store for notes
        if (!db.objectStoreNames.contains("notes")) {
            db.createObjectStore("notes", { keyPath: "uuid" });
            db.createObjectStore("noteOrder", { keyPath: "index" });
        }
        docketInstance.dbConnection = db;
        loadIndexedDbNotes(db);
    };
    request.onsuccess = (event) => {
        docketInstance.dbConnection = request.result;
        loadIndexedDbNotes(docketInstance.dbConnection);        
    };
    request.onerror = (event) => {
        console.error("Error opening indexedDB:", (event.target as IDBOpenDBRequest).error);
    }
};

/** 
 * Get editor text from HTML element
 **/ 
const getHTMLEditorText = () => {
    return (<HTMLInputElement>document.getElementById("mdEditor")).value || ""
}

/** 
 * Get note title from the HTML element
 **/
const getHTMLNoteTitle = () => {
    return (<HTMLElement>document.getElementById("noteTitle")).innerHTML || "unnamed"
}

/** 
 * Return a note object given its UUID. Create a new note if it doesn't exist.
 * @param uuid UUID of note to get
 **/
const getNoteByUUID = (uuid: string): UserNote => {
    
    return docketInstance.noteStore.noteMap.get(uuid) || createNote();
}

/**
 * Return a note object given its index in the note list. Create a new note if it doesn't exist.
 * @param index Index of note to get
 **/
const getNoteByIndex = (index: number): UserNote => {
    const uuid = docketInstance.noteStore.indexToUUID.get(index);
    return docketInstance.noteStore.noteMap.get(uuid!) || createNote();
}

/**
 * Set a note in the note store by UUID.
 * @param uuid UUID of note to set
 * @param note UserNote object to set
 */
const setNoteByUUID = (uuid: string, note: UserNote) => {
    if (!docketInstance.noteStore.noteMap.has(uuid)) {
        // If the note does not exist, add it to the store
        const index = docketInstance.noteStore.indexToUUID.size;
        docketInstance.noteStore.indexToUUID.set(index, uuid);
        docketInstance.noteStore.UUIDToIndex.set(uuid, index);
    }
    docketInstance.noteStore.noteMap.set(uuid, note);
}

/**
 * Delete a note from the note store.
 * @param uuid UUID of note to delete.
 */
const deleteNoteByUUID = (uuid: string) => {
    // Remove note from noteStore
    docketInstance.noteStore.noteMap.delete(uuid);

    // Delete note from indexedDB
    docketInstance.dbConnection?.transaction("notes", "readwrite")
        .objectStore("notes")
        .delete(uuid);

    // Add note to deleted notes set for syncing later
    docketInstance.noteStore.deletedNotes.add(uuid);
    
    // Remove note from indexToUUID and UUIDToIndex
    const index = docketInstance.noteStore.UUIDToIndex.get(uuid);
    if (index !== undefined) {
        docketInstance.noteStore.indexToUUID.delete(index);
        docketInstance.noteStore.UUIDToIndex.delete(uuid);

        // If there are notes after this one, decrement their indices and set the active note
        if (docketInstance.noteStore.indexToUUID.has(index + 1)) {
            for (let i = index + 1; i < docketInstance.noteStore.indexToUUID.size; i++) {
                const uuidAtIndex = docketInstance.noteStore.indexToUUID.get(i);
                if (uuidAtIndex) {
                    docketInstance.noteStore.UUIDToIndex.set(uuidAtIndex, i - 1);
                    docketInstance.noteStore.indexToUUID.set(i - 1, uuidAtIndex);
                }
            }
            setActiveNote(getNoteByIndex(index));
        } else if (docketInstance.noteStore.indexToUUID.has(index - 1)) {
            // If there are notes before this one, set the active note to the previous one
            setActiveNote(getNoteByIndex(index - 1));
        } else {
            // If no notes left, create a new note
            setActiveNote(createNote()); 
        }
    }
    renderNoteList();
}

/**
 * Move a note to a new index in the note list. This updates the location of all notes in the list to maintain order.
 * @param uuid UUID of the note to move
 * @param targetIndex The index to move the note to
 */
const moveNoteToIndex = (uuid: string, targetIndex: number) => {
    // Get the previous index of the note
    const prevIndex = docketInstance.noteStore.UUIDToIndex.get(uuid);
    if (prevIndex && prevIndex < targetIndex) {
        // If moving down the list (index increases), decrement all indices between prevIndex and targetIndex
        for (let i = prevIndex + 1; i <= targetIndex; i++) {
            const uuidAtIndex = docketInstance.noteStore.indexToUUID.get(i);
            if (uuidAtIndex) {
                docketInstance.noteStore.UUIDToIndex.set(uuidAtIndex, i - 1);
                docketInstance.noteStore.indexToUUID.set(i - 1, uuidAtIndex);
            }
        }
    } else if (prevIndex && prevIndex > targetIndex) {
        // If moving up the list (index decreases), increment all indices between targetIndex and prevIndex
        for (let i = prevIndex - 1; i > targetIndex; i--) {
            const uuidAtIndex = docketInstance.noteStore.indexToUUID.get(i);
            if (uuidAtIndex) {
                docketInstance.noteStore.UUIDToIndex.set(uuidAtIndex, i + 1);
                docketInstance.noteStore.indexToUUID.set(i + 1, uuidAtIndex);
            }
        }
    }
    // Update the note's index
    docketInstance.noteStore.UUIDToIndex.set(uuid, targetIndex);
    docketInstance.noteStore.indexToUUID.set(targetIndex, uuid);
    console.log(`Moved note ${uuid} to index ${targetIndex}`);
}

/**
 * Return the active note from the current docket instance. Returns `undefined` if no active note is set.
 * @returns `UserNote` object containing title and body of currently active note
 */
const getActiveNote = (): UserNote | undefined => {
    return getNoteByUUID(docketInstance.activeNoteUUID);
}

// Reformat inline code blocks (PLACEHOLDER UNTIL RENDERER TAGS IMPLEMENTED)
const formatInlineCode = () => {
    const codeBlocks = Array.from(document.getElementsByTagName("code"))
    codeBlocks.forEach((code: HTMLElement) => {
        const parent = <HTMLElement>code.parentElement
        code.setAttribute("data-theme", docketInstance.settings.uiTheme)
        if (parent.tagName != "PRE") {
            code.style.padding = ".2em .4em"
            code.style.borderRadius = "5px"
            code.classList.add("inline-code")
        } else {
            parent.setAttribute("data-theme", docketInstance.settings.uiTheme)
        }
    })
}

/**
 * Render markdown from the editor to preview panel.
 */
const renderMarkdown = () => {
    const mdRenderPanel = <HTMLElement>document.getElementById("mdRender")
    if (mdRenderPanel.style.display === "none") { return } // Prevent rendering when editor is minimized
    
    // Parse markdown and sanitize HTML output
    const editorText = getHTMLEditorText();
    mdRenderPanel.innerHTML = DOMPurify.sanitize(marked.parse(editorText) as keyof typeof String)  

    // Format inline code blocks
    formatInlineCode();
}

/**
 * Load active note from `noteList` by UUID to the editor.
 * @param uuid UUID of note to load
 */
const noteClickHandler = (uuid: string) => {
    const userNote = <UserNote>getNoteByUUID(uuid);
    setActiveNote(userNote);
}

/**
 * Update saved notes in the navbar.
 *
 * This function sorts the saved notes by their order and renders them as links in the navbar.
 * Also initializes drag-and-drop functionality for reordering notes.
 */
const renderNoteList = () => {
    console.log("Rendering note list...");
    // Load all saved notes to the navbar
    const noteListElement = document.getElementById("noteList");
    (<HTMLElement>noteListElement).innerHTML = "";
    docketInstance.noteStore.noteMap.forEach((note: UserNote, uuid: string) => {
        // Create a new list item for each note
        let noteElement: HTMLLIElement = document.createElement("li");
        noteElement.className = "noteListItem";
        noteElement.setAttribute("data-uuid", uuid);
        noteElement.draggable = true;

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
                docketInstance.tempProps.draggedNote = <HTMLLIElement>e.target;
                noteElement.classList.add("dragging");
            }
        });
        noteElement.addEventListener("dragend", () => {
            if (docketInstance.tempProps.draggedNote) {
                docketInstance.tempProps.draggedNote.classList.remove("dragging");
                docketInstance.tempProps.draggedNote = null;
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
            if (e.dataTransfer == undefined) { return; }
            const draggedUUID = e.dataTransfer.getData("text/plain");
            const targetUUID = (<HTMLLIElement>e.target).getAttribute("data-uuid");
            if (!draggedUUID || !targetUUID) { return; }
            const targetIndex = docketInstance.noteStore.UUIDToIndex.get(targetUUID);
            moveNoteToIndex(draggedUUID, targetIndex!);
            
            // Reparent the note list
            const parentElement = (<HTMLElement>e.target).parentElement;
            parentElement?.insertBefore(docketInstance.tempProps.draggedNote!, (<HTMLElement>e.target));

        });
        noteElement.addEventListener("click", noteClickHandler.bind(null, note.uuid));

        // Set note title and add to sidebar
        if (note.title.length > 24) {
            noteElement.innerHTML = (DOMPurify.sanitize(note.title)).substring(0, 25) + "...";
            noteElement.title = note.title; // Set full title as tooltip
        } else {
            noteElement.innerHTML = DOMPurify.sanitize(note.title);
        }
        (<HTMLElement>noteListElement).appendChild(noteElement);
    })
}

/** Save changes to the currently active note to note store and indexedDB. */
const saveActiveNote = () => {
    if (!docketInstance.dbConnection) {
        alert("Error: Database connection is not initialized. Note has not been saved.");
        return;
    }
    const userNote = getActiveNote()
    if (userNote) {
        docketInstance.noteStore.noteMap.set(userNote.uuid, userNote);
        // Update the note's title and body from the editor
        userNote.title = htmlDecode(getHTMLNoteTitle());
        userNote.body = htmlDecode(getHTMLEditorText());
        userNote.lastUpdated = Date.now();

        // Add or update the note in indexedDB
        const transaction = docketInstance.dbConnection.transaction("notes", "readwrite");
        const notesStore = transaction.objectStore("notes");
        notesStore.put(userNote);
    }
}

interface LastExecuted {
    msSinceLastInput: number,
    msSinceLastUpdate: number
}

/** Debounce rendering for final input detected. */
const debounce = (lastExecuted: LastExecuted) => {
    if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
        // console.log("Debounce")
        renderMarkdown()
        saveActiveNote()
        renderNoteList()
    }
}

/**
 * Input handler for updates to the markdown editor/title
 * @param lastExecuted LastExecuted object containing timestamps of last input and last update
 */
const handleInput = (lastExecuted: LastExecuted) => {
    let currTime = Date.now()
    // debounce final input
    lastExecuted.msSinceLastInput = currTime
    setTimeout(debounce, timeout, lastExecuted)

    // rerender every `timeout` ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown()
        saveActiveNote()
        renderNoteList()
        lastExecuted.msSinceLastUpdate = currTime
    }
}

/**
 * Save entire note store to indexedDB.
 */
const saveNoteStore = () => {
    if (!docketInstance.dbConnection) {
        alert("Error: Database connection is not initialized. Note store has not been saved.");
        return;
    }

    const transaction = docketInstance.dbConnection.transaction("notes", "readwrite");
    const notesStore = transaction.objectStore("notes");
    for (const note of docketInstance.noteStore.noteMap.values()) {
        notesStore.put(note);
    }
}

/**
 * Start a new note and add it to the note store and indexedDB.
 */
const createNote = (): UserNote => {
    // Create a new note object
    const newNote: UserNote = {
        uuid: crypto.randomUUID(),
        title: "New Note",
        body: "",
        lastUpdated: Date.now(),
    };
    
    // Add the new note to the note store
    setNoteByUUID(newNote.uuid, newNote);

    // Add new note to indexedDB
    docketInstance.dbConnection?.transaction("notes", "readwrite")
        .objectStore("notes")
        .add(newNote);
    
    // Render the updated note list
    renderNoteList();

    return newNote;
}

/**
 * Set active note to a `UserNote` object.
 * @param userNote UserNote object to set as active note
 */
const setActiveNote = (userNote: UserNote) => {
    // Set active note UUID
    docketInstance.activeNoteUUID = userNote.uuid;
    // Set active note in local storage
    chrome.storage.local.set({ activeNoteUUID: docketInstance.activeNoteUUID });
    const noteTitleElement = <HTMLElement>document.getElementById("noteTitle");
    const noteEditorElement = <HTMLInputElement>document.getElementById("mdEditor");
    noteTitleElement.innerHTML = docketInstance.noteStore.noteMap.get(userNote.uuid)!.title;
    noteEditorElement.value = docketInstance.noteStore.noteMap.get(userNote.uuid)!.body;
    saveActiveNote();
    renderMarkdown();
}

/**
 * Calls `deleteNoteByUUID` on `currentUUID` if user confirms deletion.
 */
const deleteActiveNote = () => {
    if(confirm("Are you sure you want to delete this note?")) {
        deleteNoteByUUID(docketInstance.activeNoteUUID);
    }
}

/**
 * Set theme for all elements with `data-theme` attribute.
 * @param theme name of theme to set
 */
const setTheme = (theme: string) => {
    chrome.storage.local.set(docketInstance.settings)
    const themedElements = document.querySelectorAll("[data-theme]")
    themedElements.forEach((element) => {
        element.setAttribute("data-theme", theme)
    })
}

/**
 * Toggle dark mode on or off depending on the state of the `darkModeSlider` checkbox.
 */
const updateDarkMode = () => {
    const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
    docketInstance.settings.uiTheme = darkModeSlider.checked ? "dark" : "light"
    setTheme(docketInstance.settings.uiTheme)
}

const testCodeBackground = (): string => {
    const hljsTemp = document.createElement("code") 
    hljsTemp.classList.add("hljs");
    document.body.appendChild(hljsTemp);
    const background = window.getComputedStyle(hljsTemp).getPropertyValue("background-color")
    document.body.removeChild(hljsTemp);
    return background
}

/**
 * This function matches the default code block background color to the current theme.
 * 
 * If you are having issues with this not working on older systems, try increasing `updateTimeout`.
 */
const updateCodeStyle = () => {
    const updateTimeout = 50;

    // clear old stylesheet if exists
    const oldStyleSheet = document.getElementById("codeStylesheet")
    if (oldStyleSheet) {
        oldStyleSheet.parentNode?.removeChild(oldStyleSheet) 
    }
    
    docketInstance.settings.codeStyle = (<HTMLSelectElement>document.getElementById("codeStyleDropdown")).value
    chrome.storage.local.set(docketInstance.settings)
    const codeStylesheetElement = document.createElement("link");
    codeStylesheetElement.rel = "stylesheet";
    codeStylesheetElement.href = `code_themes/${docketInstance.settings.codeStyle}.css`;
    codeStylesheetElement.id ="codeStylesheet"
    document.head.appendChild(codeStylesheetElement)
    
    // Set background color for code blocks
    if (docketInstance.settings.codeStyle === "github") { // Default code background for github theme, since the theme doesn't have a background color
        (<HTMLElement>document.querySelector(":root")).style.setProperty("--default-code-background", "#eff1f3");
    } else {
        setTimeout(() => {(<HTMLElement>document.querySelector(":root")).style.setProperty("--default-code-background", testCodeBackground());}, updateTimeout)
    }
}

/**
 * Set display of markdown renderer
 * @param display CSS display property
 */
const setMdRenderDisplay = (display: string) => {
    (<HTMLElement>document.getElementById("mdRender")).style.display = display
}

/**
 * Toggle markdown renderer display based on editor width or value of `mdRenderToggle` checkbox.
 */
const toggleMdRender = () => {
    const editorWidth = (<HTMLElement>document.getElementById("mdEditor")).offsetWidth
    const mdRenderSlider = <HTMLInputElement>document.getElementById("mdRenderSlider")
    if (editorWidth < 300 || !mdRenderSlider.checked) {
        setMdRenderDisplay("none")
    } else {
        setMdRenderDisplay("block")
    }
}

/**
 * Run all initialization functions to set up the Docket application.
 */
const initializeDocket = () => {
    // Sync notes from indexedDB
    console.log("Initializing IndexedDB connection...")
    initDbConnection();
    
    // Load settings from local storage
    chrome.storage.sync.get("settings", (result) => {
        docketInstance.settings.uiTheme = result.uiTheme || "light";
        docketInstance.settings.codeStyle = result.codeStyle || "github";

        const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
        darkModeSlider.checked = result.uiTheme === "dark";
        updateDarkMode();
    });
}

window.addEventListener("load", initializeDocket)

window.addEventListener("resize", toggleMdRender)

// CODESTYLE EVENT LISTENER
const codeStyleDropdown = <HTMLSelectElement>document.getElementById("codeStyleDropdown")
codeStyleDropdown.addEventListener("change", updateCodeStyle)

// DARKMODE EVENT LISTENER
const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
darkModeSlider.addEventListener("change", updateDarkMode)

const mdRenderSlider = <HTMLInputElement>document.getElementById("mdRenderSlider")
mdRenderSlider.addEventListener("change", toggleMdRender)

// DELETE NOTE EVENT LISTENER
const deleteNoteButton = <HTMLButtonElement>document.getElementById("deleteNoteButton")
deleteNoteButton.addEventListener("click", deleteActiveNote)

// NEWNOTE EVENT LISTENER
const newNoteButton = <HTMLButtonElement>document.getElementById("newNoteButton")
newNoteButton.addEventListener("click", createNote)

// EDITOR EVENT LISTENERS
const mdEditor = <HTMLInputElement>document.getElementById("mdEditor")
const mdTitle = <HTMLElement>document.getElementById("noteTitle")

/**
 * Resync notes when tab is hidden and made visible
 */
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        initializeDocket();
    }
})

/** 
 * Resync notes when window is focused
 */ 
window.addEventListener("focus", initializeDocket)

mdEditor.addEventListener("input", 
    handleInput.bind(undefined, {
        msSinceLastInput: Date.now(),
        msSinceLastUpdate: Date.now()
    })
)

mdTitle.addEventListener("input", 
    handleInput.bind(undefined, {
        msSinceLastInput: Date.now(),
        msSinceLastUpdate: Date.now()
    })
)

// Override default tab behaviour
mdEditor.addEventListener("keydown", 
    (e) => {
        if (e.key === "Tab") {
            e.preventDefault()
            mdEditor.setRangeText(
                "\t",
                mdEditor.selectionStart || 0,
                mdEditor.selectionEnd || 0,
                "end"
            )
        }
})