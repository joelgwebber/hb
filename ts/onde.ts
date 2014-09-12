/// <reference path="api.ts" />
/// <reference path="connection.ts" />
/// <reference path="search.ts" />
/// <reference path="editor.ts" />
/// <reference path="comments.ts" />

module onde {
  var DEBUG = true;

  var searchBox: SearchBox;
  var card: Card;
  var titleEditor: TextInputEditor;
  var aceEditor: AceEditor;
  var commentList: CommentList;
  var statusElem;
  var createElem;

  function edit(cardId: string) {
    if (card) {
      card.release();
    }
    card = new Card(cardId);
    aceEditor.bind(card, "body");
    titleEditor.bind(card, "title");
    commentList.setCardId(cardId);
  }

  export function main() {
    searchBox = new SearchBox();
    document.body.appendChild(searchBox.elem());

    titleEditor = new TextInputEditor();
    titleEditor.elem().className = "TitleEditor";
    document.body.appendChild(titleEditor.elem());

    aceEditor = new AceEditor();
    document.body.appendChild(aceEditor.elem());

    commentList = new CommentList();
    document.body.appendChild(commentList.elem());

    statusElem = document.createElement("div");
    statusElem.className = "Status";
    document.body.appendChild(statusElem);

    createElem = document.createElement("button");
    createElem.className = "Create";
    createElem.textContent = "create";
    document.body.appendChild(createElem);

    searchBox.onSelectCard = (cardId) => { edit(cardId); };

    createElem.onclick = (e) => {
      connection.createCard({
        type: "card",
        body: "..."
      }, (rsp) => {
        edit(rsp.CardId);
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
