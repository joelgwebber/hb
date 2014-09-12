/// <reference path="connection.ts" />

module onde {

  export interface Context {
    log(msg: any);
    connection(): Connection;
  }
}