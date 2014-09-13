module onde {

  // Message types.
  export var MsgLogin = "login";
  export var MsgSubscribeCard = "subscribecard";
  export var MsgUnsubscribeCard = "unsubscribecard";
  export var MsgRevise = "revise";
  export var MsgSubscribeSearch = "subscribesearch";
  export var MsgUnsubscribeSearch = "unsubscribesearch";
  export var MsgSearchResults = "searchresults";
  export var MsgCreateCard = "createcard";
  export var MsgError = "error";

  export interface Change {
    Prop: string;
    Ops:  any[];
  }

  // Requests.
  export interface Req {
    Type: string;

    Login?: LoginReq;
    SubscribeCard?: SubscribeCardReq;
    UnsubscribeCard?: UnsubscribeCardReq;
    Revise?: ReviseReq;
    SubscribeSearch?: SubscribeSearchReq;
    UnsubscribeSearch?: UnsubscribeSearchReq;
    CreateCard?: CreateCardReq;
  }

  export interface LoginReq {
    UserId: string;
    Password: string;
  }

  export interface SubscribeCardReq {
    CardId: string;
    SubId: number;
  }

  export interface UnsubscribeCardReq {
    SubId: number;
  }

  export interface ReviseReq {
    ConnId: string;
    SubId: number;
    CardId: string;
    Rev: number;
    Change: Change;
  }

  export interface SubscribeSearchReq {
    Query: string;
  }

  export interface UnsubscribeSearchReq {
    Query: string;
  }

  export interface CreateCardReq {
    CreateId: number;
    Props: {[prop: string]: string};
  }

  // Responses.
  export interface Rsp {
    Type: string;

    Login?: LoginRsp;
    SubscribeCard?: SubscribeCardRsp;
    UnsubscribeCard?: UnsubscribeCardRsp;
    Revise?: ReviseRsp;
    SubscribeSearch?: SubscribeSearchRsp;
    UnsubscribeSearch?: UnsubscribeSearchRsp;
    CreateCard?: CreateCardRsp;

    SearchResults?: SearchResultsRsp;
    Error?: ErrorRsp;
  }

  export interface LoginRsp {
    UserId: string;
    ConnId: string;
  }

  export interface SubscribeCardRsp {
    CardId: string;
    SubId: number;
    Rev:   number;
    Props: {[prop: string]: string};
  }

  export interface UnsubscribeCardRsp {
    SubId: string;
  }

  export interface ReviseRsp {
    OrigConnId: string;
    OrigSubId:  number;
    CardId:  string;
    SubIds: number[];
    Rev:    number;
    Change: Change;
  }

  export interface SubscribeSearchRsp {
    Query: string;
  }

  export interface UnsubscribeSearchRsp {
    Query: string;
  }

  export interface CreateCardRsp {
    CreateId: number;
    CardId: string;
  }

  export interface SearchResultsRsp {
    Query: string;
    Total: number;
    Results: SearchResult[];
  }

  export interface SearchResult {
    CardId: string;
    Title: string;
    Body: string;
  }

  export interface ErrorRsp {
    Msg: string;
  }
}
