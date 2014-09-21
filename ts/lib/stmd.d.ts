// TODO: There's a good bit more API surface area, but I'm not using it yet.
declare module stmd {

  interface DocParser {
    parse(): Document;
  }

  var DocParser: {
    new();
  };

  interface Node {
    t: string;
    children: Node[];
    inline_content: Node[];
    c: any; // appears to be both Node[] and string. WTF?
    destination: string;
    title: string;
    label: Node[];
    tight: boolean;
    level: number;
    string_content: string;
    info: string;
    list_data: ListData;
  }

  interface Document extends Node {
  }

  interface ListData {
    type: string;
    bullet_char: string;
    start: number;
    delimiter: string;
  }

  interface HtmlRenderer {
    render(doc: Document): string;
  }

  var HtmlRenderer: {
    new();
  }
}
