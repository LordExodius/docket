# Docket
locally saved markdown notes in a new tab or popup 📝

### Screenshots

🌆 dark mode|🧑‍💻 code block themes|🆙 popup notes
:-:|:-:|:-:
![dark mode](https://github.com/LordExodius/docket/assets/26910397/02ab6e49-bba1-4865-b5ed-4724126205cc)|![code sample](https://github.com/LordExodius/docket/assets/26910397/fabc4746-8442-4178-885b-7993fd77f76b)|![popup](https://github.com/LordExodius/docket/assets/26910397/49eb5f93-116d-444f-a9b5-66401d8cf708)

### Installation
Available on the chrome web store [here](http://awwscar.ca/docket/).

1. Clone or download this repo and unzip (if you downloaded a zip file).
2. Go to `chrome://extensions/` or wherever you manage extensions.
3. Enable developer mode and click `load unpacked`.
4. Select the (unzipped) root folder.

Done!

## Build
1. `npm install`
3. `npm run build`

#### Dependencies
- [Marked.js](https://github.com/markedjs/marked) for markdown parsing
- [highlight.js](https://highlightjs.org/) for code syntax highlighting
- [DOMPurify](https://github.com/cure53/DOMPurify) for HTML sanitizing


#### Layout
- [manifest](manifest.json) holds extension metadata
- [icons](icons/) holds extension icon
- [src](src/) holds typescript source code
- [dist](dist/) holds all html, css, compiled js, and bundled modules (using [rspack](https://www.rspack.dev/))

## Todo
There's a lot of improvements and features I'd like to add, and feature requests are always welcome. 

Here's a few things that I have in mind:
- **Editor Features**
  - Keyboard shortcuts for common markdown actions (bold, italic, etc.)
  - Import/export markdown files 
    - This might not be possible due to restrictions on file access in chrome extensions
    - Also, just paste the markdown into the editor, dummy 🥱
- **Autosave**
  - Query chrome storage when a user refocuses the tab or extension to prevent overwriting changes when multiple instances of docket are open
- **Settings**
  - Change the font size
  - Change the font family
  - Change parser options (like enabling/disabling GFM)
- **Optimizations/QoL**
  - Lazy render markdown (only rerender when the markdown changes)
    - This is a bit tricky because I would need a way to sourcemap the markdown to the rendered `html`, which is nontrivial.
  - Scroll sync between the markdown and the rendered `html`
    - Again, this probably requires sourcemapping the markdown to the rendered `html`.
  - Extend/rewrite some of the parsing rules to tag the `html` elements with classes for easier styling
    - This would allow for more advanced styling options and also remove the need for the hacky `css` overrides I have in place for things like inline code blocks.
