/// <reference path="editor.ts" />
/// <reference path="card.ts" />

module onde {

  export class CardDetail extends Dialog {
    private _titleEditor: TextInputEditor;
    private _doneEditor: CheckboxEditor;
    private _aceEditor: AceEditor;
    private _commentList: CommentList;
    private _card: Card;

    constructor(private _ctx: Context, private _cardId: string) {
      super("CardDetail");

      this._titleEditor = new TextInputEditor();
      this._doneEditor = new CheckboxEditor();
      this._aceEditor = new AceEditor();
      this._commentList = new CommentList(_ctx);

      this.$(".title").appendChild(this._titleEditor.elem());
      this.$(".done-label").insertBefore(this._doneEditor.elem(), this.$(".done-label").firstChild);
      this.$(".body").appendChild(this._aceEditor.elem());
      this.$(".comments").appendChild(this._commentList.elem());

      this._commentList.setCardId(this._cardId);
    }

    show() {
      if (this.showing()) {
        return;
      }
      this._card = new Card(this._ctx, this._cardId);
      this._titleEditor.bind(this._card, "title");
      this._doneEditor.bind(this._card, "done");
      this._aceEditor.bind(this._card, "body");
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
