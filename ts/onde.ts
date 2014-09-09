/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="editor.ts" />
/// <reference path="search.ts" />

module onde {
  var DEBUG = true;

  var searchBox: SearchBox;
  var doc: Document;
  var titleEditor: TextInputEditor;
  var aceEditor: AceEditor;
  var statusElem;
  var createElem;

  function edit(docId: string) {
    if (doc) {
      doc.release();
    }
    doc = new Document(docId);
    aceEditor.bind(doc, "body");
    titleEditor.bind(doc, "title");
  }

  export function main() {
    searchBox = new SearchBox();
    document.body.appendChild(searchBox.elem());

    aceEditor = new AceEditor();
    document.body.appendChild(aceEditor.elem());

    titleEditor = new TextInputEditor();
    titleEditor.elem().className = "TitleEditor";
    document.body.appendChild(titleEditor.elem());

    statusElem = document.createElement("div");
    statusElem.className = "Status";
    document.body.appendChild(statusElem);

    createElem = document.createElement("button");
    createElem.className = "Create";
    createElem.textContent = "create";
    document.body.appendChild(createElem);

    searchBox.onSelectDoc = (docId) => { edit(docId); };

    createElem.onclick = (e) => {
      connection.createDoc((rsp) => {
        edit(rsp.DocId);
      });
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
