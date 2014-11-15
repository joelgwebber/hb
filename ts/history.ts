module hb {

  export class HistoryNode {
    state: string;
    onstate: (state: string, child: HistoryNode) => void;
    parent: HistoryNode;
    child: HistoryNode;
    _onregister: () => void;

    constructor(private _root: History) { }

    register(onstate: (state: string, child: HistoryNode) => void) {
      this.onstate = onstate;
      if (this._onregister) {
        this._onregister();
      }
    }

    navigate(state: string[], replace = false) {
      this._root._navigate(this.path(state), replace);
    }

    path(newState: string[]): string {
      var node = this.parent;
      while (node) {
        newState.unshift(node.state);
        node = node.parent;
      }
      return '/' + newState.join('/');
    }
  }

  export class History extends HistoryNode {
    static _watchers: { (urlParts: string[]): void; }[] = [];
    public static watch(watcher: (urlParts: string[]) => void) {
      History._watchers.push(watcher);
    }

    constructor() {
      super(this);

      if (window.onpopstate && typeof window.onpopstate == "function") {
        var oldFunc = <() => void>window.onpopstate;
        window.onpopstate = () => { oldFunc(); this.onPopState(); };
      } else {
        window.onpopstate = () => { this.onPopState(); };
      }
    }

    register(onstate: (state: string, child: HistoryNode) => void) {
      super.register(onstate);
      this.onPopState();
    }

    _navigate(state: string, replace: boolean) {
      if (replace) {
        history.replaceState(null, '', state);
      } else {
        history.pushState(null, '', state);
      }
      this.onPopState();
    }

    private onPopState() {
      var parts = window.location.pathname.split('/').slice(1); // slice(1) to skip the leading /

      // Node registration callback. This callback shuffle is used to ensure that each node gets its
      // onstate() event fired only after it's been registered. 'curNode' keeps track of the next node
      // to receive its callback across callbacks.
      var curNode: HistoryNode = this;
      var registered = () => {
        var target = curNode;
        curNode = curNode.child;
        if (target.onstate) {
          target.onstate(target.state, curNode);
        }
      };

      // Build the node stack.
      var node: HistoryNode = this;
      for (i = 1; i < parts.length; ++i) {
        var state = parts[i];
        if (!state) state = '';

        var newNode = new HistoryNode(this);
        node.child = newNode;
        newNode.parent = node;
        newNode.state = state;
        newNode._onregister = registered;

        node = newNode;
      }

      // Stick a "ground" node on the end.
      var groundNode = new HistoryNode(this);
      groundNode.parent = node;
      groundNode.state = "";
      groundNode._onregister = registered;
      node.child = groundNode;

      // Fire onstate to the root node, which will kick off the rest.
      this.state = parts[0];
      registered();

      // Let history watchers know.
      for (var i = 0; i < History._watchers.length; i++) {
        History._watchers[i](parts);
      }
    }
  }
}
