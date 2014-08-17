module onde {

  export var MsgLogin = "login";
  export var MsgSubscribe = "subscribe";
  export var MsgRevise = "revise";
  export var MsgError = "error";

  export interface Req {
    Type: string;
    Login?: LoginReq;
    Revise?: ReviseReq;
    Subscribe?: SubscribeReq;
  }

  export interface LoginReq {
    UserId: string;
  }

  export interface SubscribeReq {
    DocId: string;
  }

  export interface ReviseReq {
    ConnId: string;
    DocId: string;
    Rev: number;
    Ops: any[];
  }

  export interface Rsp {
    Type: string;
    Login?: LoginRsp;
    Subscribe?: SubscribeRsp;
    Revise?: ReviseRsp;
    Error?: ErrorRsp;
  }

  export interface LoginRsp {
    UserId: string;
    ConnId: string;
  }

  export interface SubscribeRsp {
    DocId: string;
    Rev:   number;
    Doc:   string;
  }

  export interface ReviseRsp {
    ConnId: string;
    Rev:    number;
    Ops:    any[];
  }

  export interface ErrorRsp {
    Msg: string;
  }
}
