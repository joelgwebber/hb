/// <reference path="api.ts" />
/// <reference path="editor.ts" />
/// <reference path="lib/ace.d.ts" />
/// <reference path="lib/sockjs.d.ts" />

module onde {
  var logElem = <HTMLInputElement>document.getElementById("log");
  var statusElem = document.getElementById("status");
  var docElem = document.getElementById("doc");

  var editor: Editor;
  var sock: SockJS;
  var connId: string;

  function log(msg: string) {
    logElem.value += msg + "\n";
  }

  function setStatus(msg: string) {
    statusElem.textContent = msg;
  }

  function onOpen() {
    log("connection open");
    setStatus("connected");
    login("joel");
  }

  function onClose() {
    log("connection closed; reconnecting in 1s");
    setStatus("disconnected");
    sock = null; connId = null;
    setTimeout(connect, 1000);
  }

  function onMessage(e: SJSMessageEvent) {
    var rsp = <Rsp>JSON.parse(e.data);
    switch (rsp.Type) {
      case MsgLogin:
        connId = rsp.Login.ConnId;
        log("conn id: " + connId);
        setStatus("logged in");
        var req: Req = {
          Type: MsgSubscribeDoc,
          SubscribeDoc: { DocId: "foo" }
        };
        sock.send(JSON.stringify(req));
        break;

      case MsgSubscribeDoc:
        docElem.innerHTML = "";
        editor = new Editor(rsp.SubscribeDoc.DocId, rsp.SubscribeDoc.Rev, rsp.SubscribeDoc.Doc, (docId, rev, ops) => {
          var req: Req = {
            Type: MsgRevise,
            Revise: { ConnId: connId, DocId: docId, Rev: rev, Ops: ops }
          };
          sock.send(JSON.stringify(req));
        });
        docElem.appendChild(editor.elem());
        break;

      case MsgUnsubscribeDoc:
        console.log("unsubscribed doc " + rsp.UnsubscribeDoc.DocId);
        break;

      case MsgRevise:
        var err;
        if (rsp.Revise.ConnId == connId) {
          err = editor.ackOps(rsp.Revise.Ops);
        } else {
          err = editor.recvOps(rsp.Revise.Ops)
        }
        if (err) {
          log(err);
        }
        break;

      case MsgError:
        log(rsp.Error.Msg);
        break;
    }
  }

  function login(userId: string) {
    var req: Req = {
      Type: MsgLogin,
      Login: { UserId: userId }
    };
    sock.send(JSON.stringify(req));
  }

  function getOrigin(): string {
    return location.protocol + "//" + location.hostname + (location.port ? (":" + location.port) : "");
  }

  function connect() {
    sock = new SockJS(getOrigin() + "/sock", null, {
      debug: true
    });

    sock.onopen = onOpen;
    sock.onclose = onClose;
    sock.onmessage = onMessage;
  }

  export function main() {
    connect();
  }
}
