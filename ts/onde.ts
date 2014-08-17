/// <reference path="api.ts" />
/// <reference path="editor.ts" />
/// <reference path="lib/ace.d.ts" />
/// <reference path="lib/sockjs.d.ts" />

module onde {
  var logElem = <HTMLInputElement>document.getElementById("log");
  var statusElem = document.getElementById("status");
  var editElem = document.getElementById("doc");

  var editor: Editor;
  var sock: SockJS;
  var userId: string;

  function log(msg: string) {
    logElem.value += msg + "\n";
  }

  function setStatus(msg: string) {
    statusElem.textContent = msg;
  }

  function onOpen() {
    log("connection open");
    setStatus("connected");
  }

  function onClose() {
    log("connection closed");
    setStatus("disconnected");
  }

  function onMessage(e: SJSMessageEvent) {
    var rsp = <Rsp>JSON.parse(e.data);
    switch (rsp.Type) {
      case MsgLogin:
        userId = rsp.Login.UserId;
        log("user id: " + userId);
        setStatus("logged in");
        var req: Req = {
          Type: MsgSubscribe,
          Subscribe: { DocId: "foo" }
        };
        sock.send(JSON.stringify(req));
        break;

      case MsgSubscribe:
        editor = new Editor(editElem, rsp.Subscribe.DocId, rsp.Subscribe.Rev, rsp.Subscribe.Doc, (docId, rev, ops) => {
          var req: Req = {
            Type: MsgRevise,
            Revise: { UserId: userId, DocId: docId, Rev: rev, Ops: ops }
          };
          sock.send(JSON.stringify(req));
        });
        break;

      case MsgRevise:
        var err;
        if (rsp.Revise.UserId == userId) {
          err = editor.ackOps(rsp.Revise.Ops);
        } else {
          err = editor.recvOps(rsp.Revise.Ops)
        }
        if (err) {
          log(err);
        }
        break;
    }
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
