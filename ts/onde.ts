/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="editor.ts" />
/// <reference path="search.ts" />

module onde {
  var DEBUG = true;

  var searchBox: SearchBox;
  var editor: Editor;
  var statusElem = document.getElementById("status");

  export function main() {
    searchBox = new SearchBox();
    document.body.appendChild(searchBox.elem());

    editor = new Editor();
    document.body.appendChild(editor.elem());

    statusElem = document.createElement("div");
    statusElem.className = "Status";

    searchBox.onSelectDoc = (docId) => {
      editor.loadDoc(docId);
    };

    connection.onOpen = onOpen;
    connection.onClose = onClose;
    connection.onLogin = onLogin;
    connection.connect();
  }

  export function log(msg: any) {
    if (DEBUG) {
      console.log(msg)
    }
  }

  function setStatus(msg: string) {
    statusElem.textContent = msg;
  }

  function onOpen() {
    log("connection open");
    setStatus("connected");
    connection.login("joel");
  }

  function onClose() {
    log("connection closed; refresh to reconnect for now");
//    log("connection closed; reconnecting in 1s");
//    setStatus("disconnected");
//    setTimeout(connection.connect, 1000);
  }

  function onLogin() {
    setStatus("logged in");
  }
}
