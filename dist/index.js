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
/**
 * Summary: Get sanitized input text body
 */
const getCleanInput = () => {
    const inputText = document.getElementById("textInput").value || "";
    return DOMPurify.sanitize(inputText);
};
/**
 * Summary: Rerender markdown every {timeout}ms while typing, and also {timeout}ms after no input.
 */
const renderMarkdown = () => {
    const cleanText = getCleanInput();
    const marked = new Marked(markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang, info) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));
    document.getElementById("mdRender").innerHTML = marked.parse(cleanText);
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
/**
 * Summary: Fetch all saved notes from localStorage
 */
const populateNavBar = () => {
    chrome.storage.local.get("notes", (result) => {
        console.log(result.value);
    });
};
/**
 * @returns UserNote object containing title and body of currently active note
 */
const getActiveNote = () => {
    const noteTitle = DOMPurify.sanitize(document.getElementById("fileName").innerHTML);
    const noteBody = getCleanInput();
    return {
        noteTitle: noteTitle,
        noteBody: noteBody
    };
};
/**
 * Summary: Autosave active note to chrome local storage
 */
const saveActiveNote = () => {
    const userNote = getActiveNote();
    chrome.storage.local.set({ activeNote: userNote });
    console.log("Note Saved");
};
/**
 * Summary: Autoload active note on new tab from chrome local storage
 */
const loadActiveNote = () => {
    chrome.storage.local.get(null, (result) => {
        document.getElementById("fileName").innerHTML = result.activeNote.noteTitle;
        document.getElementById("textInput").value = result.activeNote.noteBody;
        renderMarkdown();
    });
};
// Debounce rendering to rerender after no input detected for {timeout}ms
const debounce = (lastExecuted) => {
    if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
        renderMarkdown();
        saveActiveNote();
    }
};
const handleInput = (lastExecuted) => {
    let currTime = Date.now();
    // debounce
    lastExecuted.msSinceLastInput = currTime;
    setTimeout(debounce, timeout, lastExecuted);
    // rerender every 500ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown();
        lastExecuted.msSinceLastUpdate = currTime;
    }
};
window.onload = loadActiveNote;
// Add event listener to the editable side
const textInput = document.getElementById("textInput");
textInput.addEventListener("input", handleInput.bind(undefined, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now()
}));
// Override default tab behaviour
textInput.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        textInput.setRangeText("\t", textInput.selectionStart || 0, textInput.selectionEnd || 0, "end");
    }
});
//# sourceMappingURL=index.js.map