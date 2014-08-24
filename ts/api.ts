module onde {

  // Message types.
  export var MsgLogin = "login";
  export var MsgSubscribeDoc = "subscribedoc";
  export var MsgUnsubscribeDoc = "unsubscribedoc";
  export var MsgRevise = "revise";
  export var MsgSubscribeSearch = "subscribesearch";
  export var MsgUnsubscribeSearch = "unsubscribesearch";
  export var MsgSearchResults = "searchresults";
  export var MsgCreateDoc = "createdoc";
  export var MsgError = "error";

  // Requests.
  export interface Req {
    Type: string;

    Login?: LoginReq;
    SubscribeDoc?: SubscribeDocReq;
    UnsubscribeDoc?: UnsubscribeDocReq;
    Revise?: ReviseReq;
    SubscribeSearch?: SubscribeSearchReq;
    UnsubscribeSearch?: UnsubscribeSearchReq;
    CreateDoc?: CreateDocReq;
  }

  export interface LoginReq {
    UserId: string;
  }

  export interface SubscribeDocReq {
    DocId: string;
    SubId: number;
  }

  export interface UnsubscribeDocReq {
    SubId: number;
  }

  export interface ReviseReq {
    ConnId: string;
    SubId: number;
    DocId: string;
    Rev: number;
    Ops: any[];
  }

  export interface SubscribeSearchReq {
    Query: string;
  }

  export interface UnsubscribeSearchReq {
    Query: string;
  }

  export interface CreateDocReq {
    CreateId: number;
  }

  // Responses.
  export interface Rsp {
    Type: string;

    Login?: LoginRsp;
    SubscribeDoc?: SubscribeDocRsp;
    UnsubscribeDoc?: UnsubscribeDocRsp;
    Revise?: ReviseRsp;
    SubscribeSearch?: SubscribeSearchRsp;
    UnsubscribeSearch?: UnsubscribeSearchRsp;
    CreateDoc?: CreateDocRsp;

    SearchResults?: SearchResultsRsp;
    Error?: ErrorRsp;
  }

  export interface LoginRsp {
    UserId: string;
    ConnId: string;
  }

  export interface SubscribeDocRsp {
    DocId: string;
    SubId: number;
    Rev:   number;
    Body:  string;
  }

  export interface UnsubscribeDocRsp {
    SubId: string;
  }

  export interface ReviseRsp {
    OrigConnId: string;
    OrigSubId:  number;
    DocId:  string;
    SubIds: number[];
    Rev:    number;
    Ops:    any[];
  }

  export interface SubscribeSearchRsp {
    Query: string;
  }

  export interface UnsubscribeSearchRsp {
    Query: string;
  }

  export interface CreateDocRsp {
    CreateId: number;
    DocId: string;
  }

  export interface SearchResultsRsp {
    Query: string;
    Total: number;
    Results: SearchResult[];
  }

  export interface SearchResult {
    DocId: string;
    Body: string;
  }

  export interface ErrorRsp {
    Msg: string;
  }
}
