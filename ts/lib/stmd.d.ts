// TODO: There's a good bit more API surface area, but I'm not using it yet.
declare module stmd {

  interface DocParser {
    parse(): Document;
  }

  var DocParser: {
    new();
  };

  interface Document {
  }

  interface HtmlRenderer {
    render(doc: Document): string;
  }

  var HtmlRenderer: {
    new();
  }
}
