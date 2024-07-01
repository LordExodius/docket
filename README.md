# Docket
locally saved markdown notes in a new tab or popup 📝

### Installation
1. Clone or download this repo and unzip (if you downloaded a zip file).
2. Go to `chrome://extensions/` or wherever you manage extensions.
3. Enable developer mode and click `load unpacked`.
4. Select the unzipped or root folder.

Done!

### Build
1. `npm install`
3. `npm run build`


### layout
- [manifest](manifest.json) holds extension metadata
- [icons](icons/) holds extension icon
- [src](src/) holds extension source code - typescript and html/css
- [dist](dist/) holds compiled js and bundled modules (using [rollup.js](https://rollupjs.org/))
