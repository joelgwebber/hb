/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="editor.ts" />

module onde {
  var DEBUG = true;

  var statusElem = document.getElementById("status");
  var docElem = document.getElementById("doc");
  var editor: Editor;

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
    log("connection closed; reconnecting in 1s");
    setStatus("disconnected");
    setTimeout(connection.connect, 1000);
  }

  function onLogin() {
    setStatus("logged in");

    var docSub = connection.subscribeDoc("foo",
      (rsp: SubscribeDocRsp) => {
        docElem.innerHTML = "";
        editor = new Editor(rsp.DocId, rsp.Rev, rsp.Doc, (docId, rev, ops) => {
          docSub.revise(rev, ops);
        });
        docElem.appendChild(editor.elem());
      }, (rsp: ReviseRsp) => {
        editor.recvOps(rsp.Ops);
      },
      (rsp: ReviseRsp) => {
        editor.ackOps(rsp.Ops);
      }
    );

    connection.subscribeSearch("wut", (rsp: SearchResultsRsp) => {
      log(rsp);
    });
  }

  export function main() {
    connection.onOpen = onOpen;
    connection.onClose = onClose;
    connection.onLogin = onLogin;
    connection.connect();
  }
}
