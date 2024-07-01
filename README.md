# Docket
locally saved markdown notes in a new tab or popup 📝

### Screenshots
<div align="center">
<img src="https://github.com/LordExodius/docket/assets/26910397/24da96b2-ddc7-49a8-a0b0-3b1ad9588bfd" width="80%"><br>
  <em>this is docket running in a new tab!</em>
</div>

### Installation
1. Clone or download this repo and unzip (if you downloaded a zip file).
2. Go to `chrome://extensions/` or wherever you manage extensions.
3. Enable developer mode and click `load unpacked`.
4. Select the (unzipped) root folder.

Done!

### Build
1. `npm install`
3. `npm run build`

### Layout
- [manifest](manifest.json) holds extension metadata
- [icons](icons/) holds extension icon
- [src](src/) holds typescript source code
- [dist](dist/) holds all html, css, compiled js, and bundled modules (using [rollup.js](https://rollupjs.org/))
