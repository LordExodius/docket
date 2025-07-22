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

let darkMode = false;
let uiTheme = "light"
let codeStyle = "github"

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
 * @property listOrder - Order in the savedNotes array
 * @property noteTitle - Title of the note
 * @property noteBody - Body of the note in markdown format
 * @property lastUpdated - Timestamp of the last update in milliseconds since epoch
 */
interface UserNote {
    uuid: string,
    listOrder: number,
    noteTitle: string,
    noteBody: string,
    lastUpdated: number
}

let noteList: UserNote[] = [];
let currentUUID: string;

/** 
 * Get editor text from HTML element
 **/ 
const getEditorText = () => {
    return (<HTMLInputElement>document.getElementById("mdEditor")).value || ""
}

/** 
 * Get note title from the HTML element
 **/
const getNoteTitle = () => {
    return (<HTMLElement>document.getElementById("fileName")).innerHTML || "unnamed"
}

/**
 * Get the list order of a note by uuid from `savedNotes`
 * @param uuid UUID of the note to get the list order for
 * @returns List order of the current note
 */
const getNoteListOrder = (uuid: string): number => {
    for (let i = 0; i < noteList.length; i++) {
        if (noteList[i].uuid === uuid) {
            return i
        }
    }
    return noteList.length; // ERROR: Note not found in savedNotes
}

/**
 * Get the active note from `savedNotes`
 * @returns `UserNote` object containing title and body of currently active note
 */
const getActiveNote = (): UserNote => {
    const noteTitle = getNoteTitle()
    const noteBody = getEditorText()
    const uuid = currentUUID || self.crypto.randomUUID()
    const listOrder = getNoteListOrder(uuid)
    return {
        uuid: uuid,
        listOrder: listOrder,
        noteTitle: noteTitle,
        noteBody: noteBody,
        lastUpdated: Date.now()
    }
}

/** 
 * Get note from `savedNotes` by UUID
 * @param uuid UUID of note to get
 **/
const getNoteByUUID = (uuid: string) => {
    // console.log("scanning notes")
    for (let i = 0; i < noteList.length; i++) {
        if (noteList[i].uuid == uuid) {
            return noteList[i]
        }
    }
}

/**
 * Force update the list order of all notes in `savedNotes` for backwards compatibility.
 * This function sets the `listOrder` property of each note to its index in the `noteList` array.
 */
const forceUpdateNoteListOrder = () => {
    // console.log("force update note list order")
    noteList.forEach((note: UserNote, index: number) => {
        note.listOrder = index;
        setNoteByUUID(note.uuid, note);
    })
}

/**
 * Render markdown from the editor to preview panel.
 */
const renderMarkdown = () => {
    // Prevent rendering when editor is minimized
    const mdRender = <HTMLElement>document.getElementById("mdRender")
    if (mdRender.style.display === "none") { return }
    
    const editorText = getEditorText();

    // Parse markdown and sanitize HTML output
    (<HTMLElement>document.getElementById("mdRender")).innerHTML = DOMPurify.sanitize(marked.parse(editorText) as keyof typeof String)
    
    // Reformat inline code blocks (PLACEHOLDER UNTIL RENDERER TAGS IMPLEMENTED)
    const codeBlocks = Array.from(document.getElementsByTagName("code"))
    codeBlocks.forEach((code: HTMLElement) => {
        const parent = <HTMLElement>code.parentElement
        code.setAttribute("data-theme", uiTheme)
        if (parent.tagName != "PRE") {
            code.style.padding = ".2em .4em"
            code.style.borderRadius = "5px"
            code.classList.add("inline-code")
        } else {
            parent.setAttribute("data-theme", uiTheme)
        }
        
    })
}

/** 
 * Update note content in `savedNotes` by UUID
 * @param uuid UUID of note to set
 * @param note UserNote object to set
 **/
const setNoteByUUID = (uuid: string, note: UserNote) => {
    // console.log(`setting note with uuid ${uuid}`)
    for (let i = 0; i < noteList.length; i++) {
        if (noteList[i].uuid == uuid) {
            noteList[i] = note;
            return; 
        }
    }
    noteList.push(note);
}

/** 
 * Delete note from savedNotes by UUID
 * @param uuid UUID of note to delete
 **/
const deleteNoteByUUID = (uuid: string) => {
    const remaining = noteList.filter((note: UserNote) => {
        if (note.uuid == uuid) {
            // console.log("remove this one")
            return false
        } return true
    })
    noteList = remaining;
    upsertNoteList();
    // Automatically open the next available note, else create a new note
    if(noteList.length > 0) {
        setActiveNote(noteList[0]);
    } else {
        newNote();
    }
}

/**
 * Load active note from `noteList` by UUID to the editor.
 * @param uuid UUID of note to load
 */
const noteListHandler = (uuid: string) => {
    const userNote = <UserNote>getNoteByUUID(uuid);
    setActiveNote(userNote);
}

// REORDER NOTES
let currentlyDragging: HTMLLIElement | null = null;

const initOrderNotes = () => {
    noteList.sort((a, b) => {
        return getNoteListOrder(a.uuid) - getNoteListOrder(b.uuid)
    });
}

const insertNoteBefore = (newElement: HTMLElement, referenceElement: HTMLElement) => {
    const parent = referenceElement.parentNode;
    if (parent) {
        parent.insertBefore(newElement, referenceElement);
        // Update the list order of the notes
        const newElementUUID = newElement.getAttribute("data-uuid");
        const referenceElementUUID = referenceElement.getAttribute("data-uuid");
        if (newElementUUID && referenceElementUUID) {
            const newNote = getNoteByUUID(newElementUUID);
            const referenceNote = getNoteByUUID(referenceElementUUID);
            if (newNote && referenceNote) {
                newNote.listOrder = referenceNote.listOrder;
                // Update the list order of the reference note and all subsequent notes
                for (let i = newNote.listOrder + 1; i < noteList.length; i++) {
                    const subsequentNote = noteList[i];
                    subsequentNote.listOrder++;
                    setNoteByUUID(subsequentNote.uuid, subsequentNote);
                }
                referenceNote.listOrder++;
                setNoteByUUID(referenceNote.uuid, referenceNote);

                // Finally, set the new note
                setNoteByUUID(newNote.uuid, newNote);
            }
        }
    } else {
        console.error("Reference element has no parent node.");
    }
}


/**
 * Update saved notes in the navbar.
 *
 * This function sorts the saved notes by their order and renders them as links in the navbar.
 */
const renderNoteList = () => {
    // Log the note list for debugging
    // noteList.forEach((note: UserNote) => {
    //     console.log(`Note: ${note.noteTitle}, UUID: ${note.uuid}, Order: ${note.listOrder}`);
    // })

    // Load all saved notes to the navbar
    const noteListElement = document.getElementById("noteList");
    (<HTMLElement>noteListElement).innerHTML = "";
    noteList.forEach((note: UserNote) => {
        // Create a new list item for each note
        let noteElement: HTMLLIElement = document.createElement("li");
        noteElement.className = "noteListItem";
        noteElement.setAttribute("data-uuid", note.uuid);
        noteElement.draggable = true;

        // Add event listeners for hover, drag, and click events
        noteElement.addEventListener("mouseover", (e) => {
            (<HTMLLIElement>e.target).classList.add("hover");
        });
        noteElement.addEventListener("mouseout", (e) => {
            (<HTMLLIElement>e.target).classList.remove("hover");
        });
        noteElement.addEventListener("dragstart", (e) => {
            if (e.dataTransfer != undefined) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", note.uuid);
                currentlyDragging = <HTMLLIElement>e.target;
                noteElement.classList.add("dragging");
            }
        });
        noteElement.addEventListener("dragend", () => {
            if (currentlyDragging) {
                currentlyDragging.classList.remove("dragging");
                currentlyDragging = null;
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
            insertNoteBefore(currentlyDragging!, <HTMLLIElement>e.target);

        });
        noteElement.addEventListener("click", noteListHandler.bind(null, note.uuid));

        // Set note title and add to sidebar
        noteElement.innerHTML = note.noteTitle;
        
        (<HTMLElement>noteListElement).appendChild(noteElement);
    })
}

/**
 * Save active note to chrome local storage
 */
const saveActiveNote = () => {
    const userNote = getActiveNote()
    chrome.storage.local.set({activeNote: userNote})
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
        upsertActiveNote()
        upsertNoteList()
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

    // rerender every 500ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown()
        saveActiveNote()
        upsertActiveNote()
        upsertNoteList()
        lastExecuted.msSinceLastUpdate = currTime
    }
}

/**
 * Upsert `savedNotes` to local storage. 
 * 
 * Note: this is a full overwrite of local storage `savedNotes`
 */
const upsertNoteList = () => {
    chrome.storage.local.set({savedNotes: noteList}, () => {
        renderNoteList();
    })
}

/**
 * Upsert currently active note to `savedNotes` and `localStorage`
 */
const upsertActiveNote = () => {
    setNoteByUUID(currentUUID, getActiveNote())
    upsertNoteList();
}

/**
 * Get all note names from `savedNotes`
 * @returns Promise resolving to an array of note names
 */
const getNoteNames = (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get("savedNotes", (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          const noteNames = result.savedNotes?.map((note: UserNote) => note.noteTitle) || [];
          resolve(noteNames);
        }
      });
    });
  };

/**
 * Start a new note
 */
const newNote = () => {
    getNoteNames().then((notes) => {
        let newNoteName = "new note";
        // console.log('note names:', notes, notes.includes(newNoteName));
        let i = 0;
        while (notes.includes(newNoteName)) {
            i++;
            newNoteName = `new note (${i})`;
            // console.log('new note name:', newNoteName, notes.includes(newNoteName));
        }
        setActiveNote({
            uuid: self.crypto.randomUUID(), 
            noteTitle: newNoteName, 
            listOrder: noteList.length,
            noteBody: "", 
            lastUpdated: Date.now()});
    });
}

// AUTOLOADING

/**
 * Set active note to a `UserNote` object.
 * @param userNote UserNote object to set as active note
 */
const setActiveNote = (userNote: UserNote) => {
    currentUUID = userNote.uuid;
    (<HTMLElement>document.getElementById("fileName")).innerHTML = userNote.noteTitle;
    (<HTMLInputElement>document.getElementById("mdEditor")).value = userNote.noteBody;
    saveActiveNote();
    upsertActiveNote();
    renderMarkdown();
}

/**
 * Calls `deleteNoteByUUID` on `currentUUID` if user confirms deletion.
 */
const deleteActiveNote = () => {
    if(confirm("Are you sure you want to delete this note?")) {
        deleteNoteByUUID(currentUUID)
    }
}

/**
 * Set theme for all elements with `data-theme` attribute.
 * @param theme name of theme to set
 */
const setTheme = (theme: string) => {
    const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
    darkModeSlider.checked = darkMode
    const themedElements = document.querySelectorAll("[data-theme]")
    themedElements.forEach((element) => {
        element.setAttribute("data-theme", theme)
    })
}

/**
 * Toggle dark mode on or off depending on the state of the `darkModeSlider` checkbox.
 */
const toggleDarkMode = () => {
    const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
    darkMode = darkModeSlider.checked
    chrome.storage.sync.set({darkMode: darkMode})
    uiTheme = darkMode ? "dark" : "light"
    setTheme(uiTheme)
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
    
    codeStyle = (<HTMLSelectElement>document.getElementById("codeStyleDropdown")).value
    chrome.storage.local.set({codeStyle: codeStyle})
    const codeStylesheetElement = document.createElement("link");
    codeStylesheetElement.rel = "stylesheet";
    codeStylesheetElement.href = `code_themes/${codeStyle}.css`;
    codeStylesheetElement.id ="codeStylesheet"
    document.head.appendChild(codeStylesheetElement)
    
    // Set background color for code blocks
    if (codeStyle === "github") { // Default code background for github theme, since the theme doesn't have a background color
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
 * Run all initialization functions
 */
const runPreload = () => {
    // Sync settings from cloud
    chrome.storage.sync.get(null, (result) => {
        const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
        darkModeSlider.checked = result.darkMode
        toggleDarkMode()
    });

    // Sync notes from local storage
    chrome.storage.local.get(null, (result) => {
        if (!result.activeNote) { newNote(); }
        setActiveNote(result.activeNote); // Load active note
        noteList = result.savedNotes || []; // Load saved notes
        // forceUpdateNoteListOrder(); // Force update note list order
        initOrderNotes(); // Initialize note list order
        upsertNoteList();

        codeStyle = result.codeStyle || "github"
        const codeStyleDropdown = <HTMLSelectElement>document.getElementById("codeStyleDropdown")
        codeStyleDropdown.value = codeStyle
        updateCodeStyle();
    })
}

window.addEventListener("load", runPreload)

window.addEventListener("resize", toggleMdRender)

// CODESTYLE EVENT LISTENER
const codeStyleDropdown = <HTMLSelectElement>document.getElementById("codeStyleDropdown")
codeStyleDropdown.addEventListener("change", updateCodeStyle)

// DARKMODE EVENT LISTENER
const darkModeSlider = <HTMLInputElement>document.getElementById("darkModeSlider")
darkModeSlider.addEventListener("change", toggleDarkMode)

const mdRenderSlider = <HTMLInputElement>document.getElementById("mdRenderSlider")
mdRenderSlider.addEventListener("change", toggleMdRender)

// DELETE NOTE EVENT LISTENER
const deleteNoteButton = <HTMLButtonElement>document.getElementById("deleteNoteButton")
deleteNoteButton.addEventListener("click", deleteActiveNote)

// NEWNOTE EVENT LISTENER
const newNoteButton = <HTMLButtonElement>document.getElementById("newNoteButton")
newNoteButton.addEventListener("click", newNote)

// EDITOR EVENT LISTENERS
const mdEditor = <HTMLInputElement>document.getElementById("mdEditor")
const mdTitle = <HTMLElement>document.getElementById("fileName")

/**
 * Resync notes when tab is hidden and made visible
 */
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        runPreload();
    }
})

/** 
 * Resync notes when window is focused
 */ 
window.addEventListener("focus", runPreload)

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