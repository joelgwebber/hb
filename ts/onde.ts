/// <reference path="editor.ts" />
/// <reference path="lib/ace.d.ts" />
/// <reference path="lib/sockjs.d.ts" />

module onde {
  var logElem = <HTMLInputElement>document.getElementById("log");
  var statusElem = document.getElementById("status");

  function log(msg) {
    logElem.value += msg + "\n";
  }

  function setStatus(msg) {
    statusElem.textContent = msg;
  }

  var docElem = document.getElementById("doc");
  var doc;
  var sock;
  var userId;

  function onOpen() {
    log("connection open");
    setStatus("connected");
  }

  function onClose() {
    log("connection closed");
    setStatus("disconnected");
  }

  function onMessage(e) {
    var rsp = JSON.parse(e.data);
    switch (rsp.Type) {
      case "login":
        userId = rsp.Login.UserId;
        log("user id: " + userId);
        setStatus("logged in");
        sock.send(JSON.stringify({
          Type: "subscribe",
          Subscribe: { DocId: "wut" }
        }));
        break;

      case "subscribe":
        doc = new Doc(docElem, rsp.Subscribe.Rev, rsp.Subscribe.Doc, function (rev, ops) {
          sock.send(JSON.stringify({
            Type: "revise",
            Revise: { UserId: userId, Rev: rev, Ops: ops }
          }));
        });
        break;

      case "revise":
        var err;
        if (rsp.Revise.UserId == userId) {
          err = doc.ackOps(rsp.Revise.Ops);
        } else {
          err = doc.recvOps(rsp.Revise.Ops)
        }
        if (err) {
          log(err);
        }
        break;
    }
  }

  function getOrigin() {
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
