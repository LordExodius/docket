import { marked } from 'marked';

/**
 * Summary: Rerender markdown every 500ms while typing, and also 500ms after no input.
 */

const renderMarkdown = () => {
    const inputText = document.getElementById("textInput")!.innerHTML || ""
    document.getElementById("mdRender")!.innerHTML = marked.parse(inputText) as keyof typeof String
}

interface LastExecuted {
    msSinceLastInput: number,
    msSinceLastUpdate: number
}

const timeout = 500;

// Debounce rendering to rerender 500ms after no input
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
document.getElementById("textInput")?.addEventListener("input", 
    handleInput.bind(undefined, {
        msSinceLastInput: Date.now(),
        msSinceLastUpdate: Date.now()
    }))

export = {}