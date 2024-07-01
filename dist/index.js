import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
// Import supported code languages (for size purposes)
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('typescript', typescript);
const timeout = 0;
let savedNotes = [];
let currentUUID;
;
/**
 * Summary: Get editor text from HTML element
 **/
const getEditorText = () => {
    return document.getElementById("mdEditor").value || "";
};
const getNoteTitle = () => {
    return document.getElementById("fileName").innerHTML;
};
/**
 * @returns UserNote object containing title and body of currently active note
 */
const getActiveNote = () => {
    const noteTitle = getNoteTitle();
    const noteBody = getEditorText();
    return {
        uuid: currentUUID || self.crypto.randomUUID(),
        noteTitle: noteTitle,
        noteBody: noteBody,
        lastUpdated: Date.now()
    };
};
/**
 * Summary: Rerender markdown every {timeout}ms while typing, and also {timeout}ms after no input.
 */
const renderMarkdown = () => {
    const editorText = getEditorText();
    const marked = new Marked({
        gfm: true
    }, markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang, info) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));
    document.getElementById("mdRender").innerHTML = DOMPurify.sanitize(marked.parse(editorText));
    // Reformat inline code blocks (PLACEHOLDER UNTIL RENDERER TAGS IMPLEMENTED)
    const codeBlocks = Array.from(document.getElementsByTagName("code"));
    codeBlocks.map((code) => {
        const parent = code.parentElement;
        if (parent.tagName != "PRE") {
            code.style.padding = ".2em .4em";
            code.style.borderRadius = "5px";
        }
    });
};
const getNoteByUUID = (uuid) => {
    console.log("scanning notes");
    for (let i = 0; i < savedNotes.length; i++) {
        if (savedNotes[i].uuid == uuid) {
            return savedNotes[i];
        }
    }
};
const setNoteByUUID = (uuid, note) => {
    console.log(`setting note with uuid ${uuid}`);
    for (let i = 0; i < savedNotes.length; i++) {
        if (savedNotes[i].uuid == uuid) {
            savedNotes[i] = note;
            return;
        }
    }
    savedNotes.push(note);
};
const deleteNoteByUUID = (uuid) => {
    const remaining = savedNotes.filter((note) => {
        if (note.uuid == uuid) {
            console.log("remove this one");
            return false;
        }
        return true;
    });
    savedNotes = remaining;
    // Automatically open the next available note, else create a new note
    if (savedNotes.length > 0) {
        setActiveNote(savedNotes[0]);
    }
    else {
        newNote();
    }
    syncSavedNotes();
};
const savedNoteHandler = (uuid) => {
    const userNote = getNoteByUUID(uuid);
    setActiveNote(userNote);
};
const renderSavedNotes = () => {
    // Sort notes by last updated time
    savedNotes.sort((a, b) => {
        return b.lastUpdated - a.lastUpdated;
    });
    // Load all saved notes to the navbar
    const noteList = document.getElementById("savedNotes");
    noteList.innerHTML = "";
    savedNotes.forEach((note) => {
        let noteLink = document.createElement("a");
        noteLink.innerHTML = note.noteTitle;
        noteLink.className = "savedNoteLink";
        noteLink.addEventListener("click", savedNoteHandler.bind(null, note.uuid));
        noteList.appendChild(noteLink);
        noteList.appendChild(document.createElement("br"));
    });
};
/**
 * Summary: Autosave active note to chrome local storage
 */
const saveActiveNote = () => {
    const userNote = getActiveNote();
    chrome.storage.local.set({ activeNote: userNote });
};
// Debounce rendering to rerender after no input detected for {timeout}ms
const debounce = (lastExecuted) => {
    if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
        console.log("Debounce");
        renderMarkdown();
        saveActiveNote();
        archiveActiveNote();
        syncSavedNotes();
    }
};
/**
 * Input handler for updates to the markdown editor/title
 * @param lastExecuted
 */
const handleInput = (lastExecuted) => {
    let currTime = Date.now();
    // debounce
    lastExecuted.msSinceLastInput = currTime;
    setTimeout(debounce, timeout, lastExecuted);
    // rerender every 500ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown();
        saveActiveNote();
        archiveActiveNote();
        syncSavedNotes();
        lastExecuted.msSinceLastUpdate = currTime;
    }
};
/**
 * Sync savedNotes variable to local storage
 */
const syncSavedNotes = () => {
    chrome.storage.local.set({ savedNotes: savedNotes }, () => {
        renderSavedNotes();
    });
};
/**
 * Save currently active note to savedNotes and localStorage
 */
const archiveActiveNote = () => {
    setNoteByUUID(currentUUID, getActiveNote());
    syncSavedNotes();
};
/**
 * Summary: Start a new note and archive the currently active note
 */
const newNote = () => {
    setActiveNote({
        uuid: self.crypto.randomUUID(),
        noteTitle: "new note",
        noteBody: "",
        lastUpdated: Date.now()
    });
};
// AUTOLOADING
const setActiveNote = (userNote) => {
    currentUUID = userNote.uuid;
    document.getElementById("fileName").innerHTML = userNote.noteTitle;
    document.getElementById("mdEditor").value = userNote.noteBody;
    saveActiveNote();
    archiveActiveNote();
    renderMarkdown();
};
const deleteActiveNote = () => {
    deleteNoteByUUID(currentUUID);
};
const runPreload = () => {
    chrome.storage.local.get(null, (result) => {
        if (!result.activeNote) {
            newNote();
        }
        // Load active note
        setActiveNote(result.activeNote);
        // Load saved notes
        savedNotes = result.savedNotes || [];
        syncSavedNotes();
    });
};
window.onload = runPreload;
const deleteNoteButton = document.getElementById("deleteNoteButton");
deleteNoteButton.addEventListener("click", deleteActiveNote);
// NEWNOTE EVENT LISTENER
const newNoteButton = document.getElementById("newNoteButton");
newNoteButton.addEventListener("click", newNote);
// EDITOR EVENT LISTENERS
const mdEditor = document.getElementById("mdEditor");
const mdTitle = document.getElementById("fileName");
mdEditor.addEventListener("input", handleInput.bind(undefined, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now()
}));
mdTitle.addEventListener("input", handleInput.bind(undefined, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now()
}));
// Override default tab behaviour
mdEditor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        mdEditor.setRangeText("\t", mdEditor.selectionStart || 0, mdEditor.selectionEnd || 0, "end");
    }
});
//# sourceMappingURL=index.js.map