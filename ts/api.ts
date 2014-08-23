module onde {

  // Message types.
  export var MsgLogin = "login";
  export var MsgSubscribeDoc = "subscribedoc";
  export var MsgUnsubscribeDoc = "unsubscribedoc";
  export var MsgRevise = "revise";
  export var MsgError = "error";

  // Requests.
  export interface Req {
    Type: string;
    Login?: LoginReq;
    Revise?: ReviseReq;
    SubscribeDoc?: SubscribeDocReq;
    UnsubscribeDoc?: UnsubscribeDocReq;
  }

  export interface LoginReq {
    UserId: string;
  }

  export interface SubscribeDocReq {
    DocId: string;
  }

  export interface UnsubscribeDocReq {
    DocId: string;
  }

  export interface ReviseReq {
    ConnId: string;
    DocId: string;
    Rev: number;
    Ops: any[];
  }

  // Responses.
  export interface Rsp {
    Type: string;
    Login?: LoginRsp;
    SubscribeDoc?: SubscribeDocRsp;
    UnsubscribeDoc?: UnsubscribeDocRsp;
    Revise?: ReviseRsp;
    Error?: ErrorRsp;
  }

  export interface LoginRsp {
    UserId: string;
    ConnId: string;
  }

  export interface SubscribeDocRsp {
    DocId: string;
    Rev:   number;
    Doc:   string;
  }

  export interface UnsubscribeDocRsp {
    DocId: string;
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
