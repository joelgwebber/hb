/// <reference path="editor.ts" />
/// <reference path="card.ts" />

module onde {

  export class CardDetail extends Dialog {
    private _titleEditor: TextInputEditor;
    private _aceEditor: AceEditor;
    private _commentList: CommentList;
    private _card: Card;

    constructor(private _ctx: Context, private _cardId: string) {
      super("CardDetail");

      this._titleEditor = new TextInputEditor();
      this._titleEditor.elem().className = "TitleEditor";
      this._aceEditor = new AceEditor();
      this._commentList = new CommentList(_ctx);

      this.elem().appendChild(this._titleEditor.elem());
      this.elem().appendChild(this._aceEditor.elem());
      this.elem().appendChild(this._commentList.elem());

      this._commentList.setCardId(this._cardId);
    }

    show() {
      if (this.showing()) {
        return;
      }
      this._card = new Card(this._ctx, this._cardId);
      this._aceEditor.bind(this._card, "body");
      this._titleEditor.bind(this._card, "title");
      super.show();
    }

    hide() {
      if (!this.showing()) {
        return;
      }
      super.hide();
      this._card.release();
      this._card = null;
    }
  }
}
