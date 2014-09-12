module onde {

  export class CardDetail extends TemplateView {
    private _titleEditor: TextInputEditor;
    private _aceEditor: AceEditor;
    private _commentList: CommentList;
    private _card: Card;

    constructor(private _ctx: Context) {
      super("CardDetail");

      this._titleEditor = new TextInputEditor();
      this._titleEditor.elem().className = "TitleEditor";
      this._aceEditor = new AceEditor();
      this._commentList = new CommentList(_ctx);

      this.elem().appendChild(this._titleEditor.elem());
      this.elem().appendChild(this._aceEditor.elem());
      this.elem().appendChild(this._commentList.elem());
    }

    setCardId(cardId: string) {
      if (this._card) {
        this._card.release();
      }
      this._card = new Card(this._ctx, cardId);
      this._aceEditor.bind(this._card, "body");
      this._titleEditor.bind(this._card, "title");
      this._commentList.setCardId(cardId);
    }
  }
}
