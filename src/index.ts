import { Marked, options } from 'marked'
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
interface UserNote {
    uuid: string,
    noteTitle: string,
    noteBody: string,
    lastUpdated: number
}

let savedNotes: UserNote[] = [];
let currentUUID: string;;

/** 
 * Summary: Get editor text from HTML element
 **/ 
const getEditorText = () => {
    return (<HTMLInputElement>document.getElementById("mdEditor")).value || ""
}

const getNoteTitle = () => {
    return (<HTMLElement>document.getElementById("fileName")).innerHTML
}

/**
 * @returns UserNote object containing title and body of currently active note
 */
const getActiveNote = (): UserNote => {
    const noteTitle = getNoteTitle()
    const noteBody = getEditorText()
    return {
        uuid: currentUUID || self.crypto.randomUUID(),
        noteTitle: noteTitle,
        noteBody: noteBody,
        lastUpdated: Date.now()
    }
}

/**
 * Summary: Rerender markdown
 */
const renderMarkdown = () => {
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
        } else {
            parent.setAttribute("data-theme", uiTheme)
        }
        
    })
}

const getNoteByUUID = (uuid: string) => {
    // console.log("scanning notes")
    for (let i = 0; i < savedNotes.length; i++) {
        if (savedNotes[i].uuid == uuid) {
            return savedNotes[i]
        }
    }
}

const setNoteByUUID = (uuid: string, note: UserNote) => {
    // console.log(`setting note with uuid ${uuid}`)
    for (let i = 0; i < savedNotes.length; i++) {
        if (savedNotes[i].uuid == uuid) {
            savedNotes[i] = note;
            return; 
        }
    }
    savedNotes.push(note);
}

const deleteNoteByUUID = (uuid: string) => {
    const remaining = savedNotes.filter((note: UserNote) => {
        if (note.uuid == uuid) {
            // console.log("remove this one")
            return false
        } return true
    })
    savedNotes = remaining;
    // Automatically open the next available note, else create a new note
    if(savedNotes.length > 0) {
        setActiveNote(savedNotes[0]);
    } else {
        newNote();
    }
    upsertSavedNotes();
}

const savedNoteHandler = (uuid: string) => {
    const userNote = getNoteByUUID(uuid);
    setActiveNote(userNote!);
}

const renderSavedNotes = () => {
    // Sort notes by last updated time
    savedNotes.sort((a, b) => {
        return b.lastUpdated - a.lastUpdated 
    })
    // Load all saved notes to the navbar
    const noteList = document.getElementById("savedNotes");
    (<HTMLElement>noteList).innerHTML = "";
    savedNotes.forEach((note: UserNote) => {
        let noteLink: HTMLAnchorElement = document.createElement("a");
        noteLink.innerHTML = note.noteTitle;
        noteLink.className = "savedNoteLink";
        noteLink.addEventListener("click", savedNoteHandler.bind(null, note.uuid));
        (<HTMLElement>noteList).appendChild(noteLink);
        (<HTMLElement>noteList).appendChild(document.createElement("br"));
    })
}

/**
 * Summary: Autosave active note to chrome local storage
 */
const saveActiveNote = () => {
    const userNote = getActiveNote()
    chrome.storage.local.set({activeNote: userNote})
}

interface LastExecuted {
    msSinceLastInput: number,
    msSinceLastUpdate: number
}

// Debounce rendering to rerender after no input detected for {timeout}ms
const debounce = (lastExecuted: LastExecuted) => {
    if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
        // console.log("Debounce")
        renderMarkdown()
        saveActiveNote()
        upsertActiveNote()
        upsertSavedNotes()
    }
}

/**
 * Input handler for updates to the markdown editor/title
 * @param lastExecuted 
 */
const handleInput = (lastExecuted: LastExecuted) => {
    let currTime = Date.now()
    // debounce
    lastExecuted.msSinceLastInput = currTime
    setTimeout(debounce, timeout, lastExecuted)

    // rerender every 500ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown()
        saveActiveNote()
        upsertActiveNote()
        upsertSavedNotes()
        lastExecuted.msSinceLastUpdate = currTime
    }
}

/**
 * Upsert savedNotes variable to local storage
 */
const upsertSavedNotes = () => {
    chrome.storage.local.set({savedNotes: savedNotes}, () => {
        renderSavedNotes();
    })
}

/**
 * Upsert currently active note to savedNotes and localStorage
 */
const upsertActiveNote = () => {
    setNoteByUUID(currentUUID, getActiveNote())
    upsertSavedNotes();
}

/**
 * Summary: Start a new note and upsert the previously active note
 */
const newNote = () => {
    setActiveNote({
        uuid: self.crypto.randomUUID(), 
        noteTitle: "new note", 
        noteBody: "", 
        lastUpdated: Date.now()});
}

// AUTOLOADING

const setActiveNote = (userNote: UserNote) => {
    currentUUID = userNote.uuid;
    (<HTMLElement>document.getElementById("fileName")).innerHTML = userNote.noteTitle;
    (<HTMLInputElement>document.getElementById("mdEditor")).value = userNote.noteBody;
    saveActiveNote();
    upsertActiveNote();
    renderMarkdown();
}

const deleteActiveNote = () => {
    deleteNoteByUUID(currentUUID)
}

const setTheme = (theme: string) => {
    const themedElements = document.querySelectorAll("[data-theme]")
    themedElements.forEach((element) => {
        element.setAttribute("data-theme", theme)
    })
}

const toggleDarkMode = () => {
    const darkModeToggle = <HTMLInputElement>document.getElementById("darkModeToggle")
    darkMode = darkModeToggle.checked
    chrome.storage.sync.set({darkMode: darkMode})
    if (darkMode) {
        uiTheme = "dark";
        setTheme(uiTheme)
    } else {
        uiTheme = "light";
        setTheme(uiTheme)
    }
}

const runPreload = () => {
    // Sync settings from cloud
    chrome.storage.sync.get(null, (result) => {
        const darkModeToggle = <HTMLInputElement>document.getElementById("darkModeToggle")
        darkModeToggle.checked = result.darkMode
        toggleDarkMode();
    });

    // Sync notes from local storage
    chrome.storage.local.get(null, (result) => {
        if (!result.activeNote) { newNote(); }
        // Load active note
        setActiveNote(result.activeNote);
        // Load saved notes
        savedNotes = result.savedNotes || [];
        upsertSavedNotes();
    })
}

window.onload = runPreload;

// DARKMODE EVENT LISTENER
const darkModeToggle = <HTMLInputElement>document.getElementById("darkModeToggle")
darkModeToggle.addEventListener("change", toggleDarkMode)

// DELETE NOTE EVENT LISTENER
const deleteNoteButton = <HTMLButtonElement>document.getElementById("deleteNoteButton")
deleteNoteButton.addEventListener("click", deleteActiveNote)

// NEWNOTE EVENT LISTENER
const newNoteButton = <HTMLButtonElement>document.getElementById("newNoteButton")
newNoteButton.addEventListener("click", newNote)

// EDITOR EVENT LISTENERS
const mdEditor = <HTMLInputElement>document.getElementById("mdEditor")
const mdTitle = <HTMLElement>document.getElementById("fileName")

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