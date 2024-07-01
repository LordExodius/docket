# Docket
locally saved markdown notes in a new tab or popup 📝

### Screenshots
<img src="https://github.com/LordExodius/docket/assets/26910397/799a3180-aa75-434c-94e5-e0c7cbb46526" width="80%"></img>

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
