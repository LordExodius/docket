# docket
locally saved markdown notes in new tab 📝

### to build (optional)
1. `npm install`
2. `npm run build`

### to install
1. download [docket.zip]()
2. unzip
3. go to `chrome://extensions/` or wherever you manage extensions
4. enable developer mode
5. click `load unpacked`
6. select the unzipped folder

### layout
- [manifest](manifest.json) holds extension metadata
- [icons](icons/) holds extension icon
- [src](src/) holds extension source code - typescript and html/css
- [dist](dist/) holds compiled js and bundled modules (using [rollup.js](https://rollupjs.org/))