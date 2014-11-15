/// <reference path="connection.ts" />

module hb {

  export interface Context {
    log(msg: any);
    connection(): Connection;
    history(): HistoryNode;
  }
}