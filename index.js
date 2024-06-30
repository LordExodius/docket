"use strict";

// src/index.ts
var import_marked = require("marked");
var renderMarkdown = () => {
  const inputText = document.getElementById("textInput").innerHTML || "";
  document.getElementById("mdRender").innerHTML = import_marked.marked.parse(inputText);
};
var timeout = 500;
var debounce = (lastExecuted) => {
  if (Date.now() - lastExecuted.msSinceLastInput > timeout) {
    renderMarkdown();
  }
};
var handleInput = (lastExecuted) => {
  let currTime = Date.now();
  lastExecuted.msSinceLastInput = currTime;
  setTimeout(debounce, timeout, lastExecuted);
  if (currTime - lastExecuted.msSinceLastUpdate > timeout) {
    renderMarkdown();
    lastExecuted.msSinceLastUpdate = currTime;
  }
};
var _a;
(_a = document.getElementById("textInput")) == null ? void 0 : _a.addEventListener(
  "input",
  handleInput.bind(void 0, {
    msSinceLastInput: Date.now(),
    msSinceLastUpdate: Date.now()
  })
);
module.exports = {};
