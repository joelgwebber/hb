/// <reference path="ot.ts" />
/// <reference path="connection.ts" />
/// <reference path="card.ts" />
/// <reference path="lib/stmd.d.ts" />

module onde {

  function isChild(parent: Node, child: Node) {
    while (child) {
      if (child == parent) {
        return true;
      }
      child = child.parentNode;
    }
    return false;
  }

  // Temporary hack to work around error in old Typescript's lib.d.ts.
  function newMutationObserver(callback : (records : MutationRecord[]) => any) : MutationObserver {
    return new window['MutationObserver'](callback);
  }

  export class RichTextEditor extends TemplateView {
    private _editable: HTMLElement;
    private _preview: HTMLElement;
    private _binding: Binding;
    private _observer: MutationObserver;
    private _doc: stmd.Node;
    private _parser = new stmd.DocParser();
    private _merge = false;
    private _value = "";

    constructor() {
      super("RichTextEditor");

      this._editable = this.$(".editable");
      this._preview = this.$(".preview");

      this.$(".bold").onclick = () => { this.execCommand("bold"); };
      this.$(".italic").onclick = () => { this.execCommand("italic"); };
      this.$(".ul").onclick = () => { this.execCommand("insertUnorderedList"); };
      this.$(".ol").onclick = () => { this.execCommand("insertOrderedList"); };
      this.$(".indent").onclick = () => { this.execCommand("indent"); };
      this.$(".outdent").onclick = () => { this.execCommand("outdent"); };
      this.$(".img").onclick = () => { this.execCommand("insertImage", "http://www.google.com/images/logo_sm.gif"); };
      this.$(".link").onclick = () => { this.execCommand("createLink", "http://www.google.com/"); };
      this.$(".quote").onclick = () => { this.execCommand("formatBlock", "blockquote"); };
      this.$(".code").onclick = () => { this.execCommand("formatBlock", "pre"); };
      this.$(".unformat").onclick = () => { this.execCommand("removeFormat"); };

      this._observer = newMutationObserver((recs) => {
        if (!this._merge) {
          this.handleMutations(recs);
        }
      });
      this._observer.observe(this._editable, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
        attributeOldValue: true,
        characterDataOldValue: true
      });
    }

    bind(card: Card, prop: string) {
      this.unbind();

      // _merge guards against op feedback loops.
      this._binding = card.bind(prop, (value) => {
        this._value = value;
        this._doc = this._parser.parse(value);
        this._editable.innerHTML = '';
        this.merge(() => { dom.render(this._editable, this._doc); });
      }, (ops) => {
        this.merge(() => {
          // TODO: Surgically update the dom to reflect these changes.
          dom.render(this._editable, this._doc);
        });
      })
    }

    unbind() {
      if (this._binding) {
        this._binding.release();
        this._binding = null;
      }
    }

    private execCommand(cmd: string, arg: string = undefined) {
      var sel = window.getSelection();
      if (sel.rangeCount == 0) {
        return;
      }

      var range = sel.getRangeAt(0);
      if (!isChild(this._editable, range.commonAncestorContainer)) {
        return;
      }

      document.execCommand(cmd, false, arg);
    }

    private merge(fn: () => void) {
      this._merge = true;
      fn();
      setTimeout(() => { this._merge = false}, 0);
    }

    private handleMutations(recs: MutationRecord[]) {
      var md = new dom.Parser().parse(this._editable);
      this._preview.textContent = md;

      var ops = makeChange(this._value, md);
      if (ops) {
        this._binding.revise(ops);
      }
      this._value = md;

// TODO: Look at the precise set of mutations in order to generate ops efficiently.
//      for (var i = 0; i < recs.length; ++i) {
//        var m = recs[i];
//        if (m.target) {
//          console.log(m.target['_node']);
//        }
//
//        switch (m.type) {
//          case 'characterData':
//            console.log("chars: " + m.target.textContent);
//            break;
//          case 'attributes':
//            var attr = m.attributeName;
//            var value = (<Element>m.target).getAttribute(attr);
//            console.log("attr: " + attr + " : " + value);
//            break;
//          case 'childList':
//            if (m.addedNodes.length) {
//              console.log("added: ");
//              console.log(m.addedNodes);
//            }
//            if (m.removedNodes.length) {
//              console.log("removed: ");
//              console.log(m.removedNodes);
//            }
//            break;
//        }
//      }
    }
  }

  // Markdown DOM renderer adapted from stmd.js.
  export module dom {
    export class Parser {
      private static STATE_BLOCK = 0;
      private static STATE_UL = 1;
      private static STATE_OL = 2;
      private static STATE_PRE = 3;
      private static STATE_QUOTE = 4;

      private _state = Parser.STATE_BLOCK;
      private _indent = -1;

      parse(node: Node): string {
        var md = '';
        switch (node.nodeType) {
          case Node.TEXT_NODE:
            md += node.textContent;
            break;

          case Node.ELEMENT_NODE:
            var elem = <HTMLElement>node;
            switch (elem.tagName) {
              case 'DIV':
                if (this._state == Parser.STATE_QUOTE) {
                  md += "> ";
                }
                md += this.parseChildren(elem);
                md += "\n";
                break;
              case 'P':
                md += this.parseChildren(elem);
                md += '\n\n';
                break;
              case 'BR':
                md += '\n\n';
                break;
              case 'UL': case 'OL':
                var oldState = this._state;
                this._state = elem.tagName == 'UL' ? Parser.STATE_UL : Parser.STATE_OL;
                ++this._indent;
                md += this.parseChildren(elem);
                --this._indent;
                this._state = oldState;
                md += '\n';
                break;
              case 'LI':
                md += this.indentSpaces();
                if (this._state == Parser.STATE_UL) {
                  md += "- ";
                } else {
                  md += "1. ";
                }
                md += this.parseChildren(elem) + '\n';
                break;
              case 'BLOCKQUOTE':
                var oldState = this._state;
                this._state = Parser.STATE_QUOTE;
                md += "> ";
                md += this.parseChildren(elem);
                this._state = oldState;
                md += "\n";
                break;
              case 'PRE':
                var oldState = this._state;
                this._state = Parser.STATE_PRE;
                md += this.parseChildren(elem);
                this._state = oldState;
                break;
              case 'CODE':
                if (this._state == Parser.STATE_PRE) {
                  var lines = this.parseChildren(elem).split('\n');
                  for (var i = 0; i < lines.length; ++i) {
                    md += '    ' + lines[i] + '\n';
                  }
                } else {
                  md += '`' + elem.textContent + '`';
                }
                break;
              case 'I':
              case 'EM':
                md += '*';
                md += this.parseChildren(elem);
                md += '*';
                break;
              case 'B':
              case 'STRONG':
                md += '**';
                md += this.parseChildren(elem);
                md += '**';
                break;
              case 'HR':
                md += '---\n';
                break;
              case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
                var level = parseInt(elem.tagName[1]);
                for (var i = 0; i < level; ++i) {
                  md += '#';
                }
                md += ' ' + this.parseChildren(elem);
                break;
              case 'A':
                var a = <HTMLAnchorElement>elem;
                md += '[' + a.textContent + '](' + a.href + ')'; // TODO: Right? Alt-text?
                break;
              case 'IMG':
                var img = <HTMLImageElement>elem;
                md += '!';
                if (img.alt) {
                  md += '[' + img.alt + ']';
                }
                md += '(' + img.src + ')';
                break;
              default:
                md += elem.outerHTML;
                break;
            }
            break;
        }
        return md;
      }

      private indentSpaces(): string {
        var md = '';
        for (var i = 0; i < this._indent; ++i) {
          md += '  ';
        }
        return md;
      }

      private parseChildren(elem: HTMLElement): string {
        var md = '';
        for (var child = elem.firstChild; child; child = child.nextSibling) {
          md += this.parse(child);
        }
        return md;
      }
    }

    export function render(parent: HTMLElement, doc: stmd.Document) {
      renderBlock(parent, doc);
    }

    // Render a single block element.
    function renderBlock(parent: HTMLElement, mdnode: stmd.Node, in_tight_list: boolean = false): void {
      switch (mdnode.t) {
        case 'Document':
          renderBlocks(parent, mdnode.children);
          break;
        case 'Paragraph':
          if (in_tight_list) {
            renderInlines(parent, mdnode.inline_content);
          } else {
            renderInlines(makeElem(parent, 'p', mdnode), mdnode.inline_content);
          }
          break;
        case 'BlockQuote':
          renderBlocks(makeElem(parent, 'blockquote', mdnode), mdnode.children);
          break;
        case 'ListItem':
          renderBlocks(makeElem(parent, 'li', mdnode), mdnode.children, in_tight_list);
          return;
        case 'List':
          var tag = mdnode.list_data.type == 'Bullet' ? 'ul' : 'ol';
          var attr = (!mdnode.list_data.start || mdnode.list_data.start == 1) ? [] : [['start', mdnode.list_data.start.toString()]];
          renderBlocks(makeElem(parent, tag, mdnode, attr), mdnode.children, mdnode.tight);
          break;
        case 'ATXHeader':
        case 'SetextHeader':
          var tag = 'h' + mdnode.level;
          renderInlines(makeElem(parent, tag, mdnode), mdnode.inline_content);
          break;
        case 'IndentedCode':
          makeElem(makeElem(parent, 'pre', mdnode), 'code', mdnode).textContent = mdnode.string_content;
          break;
        case 'FencedCode':
          var info_words = mdnode.info.split(/ +/);
          attr = info_words.length === 0 || info_words[0].length === 0 ? [] : [['class','language-' + info_words[0]]];
          makeElem(makeElem(parent, 'pre', mdnode), 'code', mdnode, attr).textContent = mdnode.string_content;
          break;
        case 'HtmlBlock':
          parent.innerHTML = mdnode.string_content;
          break;
        case 'ReferenceDef':
          break;
        case 'HorizontalRule':
          makeElem(parent, 'hr', mdnode, []);
          break;
        default:
          console.log("Uknown block type " + mdnode.t);
          break;
      }
    }

    // Render an inline element as HTML.
    function renderInline(parent: HTMLElement, mdnode: stmd.Node): void {
      switch (mdnode.t) {
        case 'Str':
          makeText(parent, mdnode, mdnode.c);
          break;
        case 'Softbreak':
          makeText(parent, mdnode, '\n');
          break;
        case 'Hardbreak':
          makeElem(parent, 'br', mdnode);
          break;
        case 'Emph':
          renderInlines(makeElem(parent, 'em', mdnode), <stmd.Node[]>mdnode.c);
          break;
        case 'Strong':
          renderInlines(makeElem(parent, 'strong', mdnode), <stmd.Node[]>mdnode.c);
          break;
        case 'Html':
          parent.innerHTML += <string>mdnode.c;
          break;
        case 'Entity':
          // TODO: Are we really getting the entity right here?
          makeText(parent, mdnode, mdnode.c);
          break;
        case 'Link':
          var attrs = [['href', mdnode.destination]];
          if (mdnode.title) {
            attrs.push(['title', mdnode.title]);
          }
          renderInlines(makeElem(parent, 'a', mdnode, attrs), mdnode.label);
          break;
        case 'Image':
          // TODO: This seems like an awful hack.
          var tmp = document.createElement('div');
          renderInlines(tmp, mdnode.label);
          attrs = [['src', mdnode.destination], ['alt', tmp.textContent]];
          if (mdnode.title) {
            attrs.push(['title', mdnode.title]);
          }
          makeElem(parent, 'img', mdnode, attrs);
          break;
        case 'Code':
          makeElem(parent, 'code', mdnode).textContent = mdnode.c;
          break;
        default:
          console.log("Uknown inline type " + mdnode.t);
          break;
      }
    }

    function renderBlocks(parent: HTMLElement, blocks: stmd.Node[], in_tight_list: boolean = false): void {
      for (var i=0; i < blocks.length; i++) {
        if (blocks[i].t !== 'ReferenceDef') {
          renderBlock(parent, blocks[i], in_tight_list);
        }
      }
    }

    function renderInlines(parent: HTMLElement, inlines: stmd.Node[]): void {
      for (var i=0; i < inlines.length; i++) {
        renderInline(parent, inlines[i]);
      }
    }

    // Helper function to produce content in a pair of HTML tags.
    function makeElem(parent: HTMLElement, tag: string, mdnode: stmd.Node, attrs: string[][] = []): HTMLElement {
      var elem = document.createElement(tag);
      elem['_node'] = mdnode;
      parent.appendChild(elem);
      if (attrs) {
        for (var i = 0; i < attrs.length; ++i) {
          var attr = attrs[i];
          elem.setAttribute(attr[0], attr[1]);
        }
      }
      return elem;
    }

    function makeText(parent: HTMLElement, mdnode: stmd.Node, text: string) {
      var node = document.createTextNode(text);
      parent.appendChild(node);
      node['_node'] = node;
      return node;
    }
  }

  // Markdown text renderer.
  module md {
    export function render(parent: HTMLElement, doc: stmd.Document) {
    }
  }
}
