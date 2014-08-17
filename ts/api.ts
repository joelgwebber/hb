module onde {

  export var MsgLogin = "login";
  export var MsgSubscribe = "subscribe";
  export var MsgRevise = "revise";

  export interface Req {
    Type: string;
    Revise?: ReviseReq;
    Subscribe?: SubscribeReq;
  }

  export interface Rsp {
    Type: string;
    Login?: LoginRsp;
    Subscribe?: SubscribeRsp;
    Revise?: ReviseRsp;
  }

  export interface SubscribeReq {
    DocId: string;
  }

  export interface ReviseReq {
    UserId: string;
    DocId: string;
    Rev: number;
    Ops: any[];
  }

  export interface LoginRsp {
    UserId: string;
  }

  export interface SubscribeRsp {
    DocId: string;
    Rev:   number;
    Doc:   string;
  }

  export interface ReviseRsp {
    UserId: string;
    Rev:    number;
    Ops:    any[];
  }
}
