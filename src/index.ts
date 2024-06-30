import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
// Import supported code languages (for size purposes)
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'

hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('typescript', typescript);

/**
 * Summary: Rerender markdown every {timeout}ms while typing, and also {timeout}ms after no input.
 */

const renderMarkdown = () => {
    const inputText = (<HTMLInputElement>document.getElementById("textInput"))!.value || ""
    const cleanText = DOMPurify.sanitize(inputText)
    // console.log(cleanText)
    const marked = new Marked(
        markedHighlight({
          langPrefix: 'hljs language-',
          highlight(code, lang, info) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext'
            return hljs.highlight(code, { language }).value
          }
        })
    )
    document.getElementById("mdRender")!.innerHTML = marked.parse(cleanText) as keyof typeof String
    
    // code block background highlight
    const codeBlocks = Array.from(document.getElementsByTagName("code"))
    codeBlocks.map(code => {
        (<HTMLElement>code.parentElement).style.backgroundColor = "#f6f8fa"
    })
}

interface LastExecuted {
    msSinceLastInput: number,
    msSinceLastUpdate: number
}

const timeout = 0;

// Debounce rendering to rerender after no input detected for {timeout}ms
const debounce = (lastExecuted: LastExecuted) => {
    if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
        renderMarkdown()
    }
}

const handleInput = (lastExecuted: LastExecuted) => {
    let currTime = Date.now()
    // debounce
    lastExecuted.msSinceLastInput = currTime
    setTimeout(debounce, timeout, lastExecuted)

    // rerender every 500ms while typing
    if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
        renderMarkdown()
        lastExecuted.msSinceLastUpdate = currTime
    }
}

// Add event listener to the editable side
const textInput = <HTMLInputElement>document.getElementById("textInput")

textInput.addEventListener("input", 
    handleInput.bind(undefined, {
        msSinceLastInput: Date.now(),
        msSinceLastUpdate: Date.now()
    }))

textInput.addEventListener("keydown", 
    (e) => {
        if (e.key === "Tab") {
            e.preventDefault()
            textInput.setRangeText(
                "\t",
                textInput.selectionStart || 0,
                textInput.selectionEnd || 0,
                "end"
            )
        }
})