package onde

import (
	"bytes"
	"encoding/json"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"log"
	"onde/ot"
)

const (
	MsgLogin             = "login"
	MsgSubscribeDoc      = "subscribedoc"
	MsgUnsubscribeDoc    = "unsubscribedoc"
	MsgRevise            = "revise"
	MsgSubscribeSearch   = "subscribesearch"
	MsgUnsubscribeSearch = "unsubscribesearch"
	MsgSearchResults     = "searchresults"
	MsgCreateDoc         = "createdoc"
	MsgError             = "error"
)

// Requests.
type Req struct {
	Type              string
	Login             *LoginReq
	SubscribeDoc      *SubscribeDocReq
	UnsubscribeDoc    *UnsubscribeDocReq
	Revise            *ReviseReq
	SubscribeSearch   *SubscribeSearchReq
	UnsubscribeSearch *UnsubscribeSearchReq
	CreateDoc         *CreateDocReq
}

type LoginReq struct {
	UserId string
}

type SubscribeDocReq struct {
	DocId string
	SubId int
}

type UnsubscribeDocReq struct {
	SubId int
}

type ReviseReq struct {
	ConnId string
	SubId  int
	DocId  string
	Rev    int
	Ops    ot.Ops
}

type SubscribeSearchReq struct {
	Query string
}

type UnsubscribeSearchReq struct {
	Query string
}

type CreateDocReq struct {
	CreateId int
}

// Responses.
type Rsp struct {
	Type string

	Login             *LoginRsp
	Revise            *ReviseRsp
	SubscribeDoc      *SubscribeDocRsp
	UnsubscribeDoc    *UnsubscribeDocRsp
	SubscribeSearch   *SubscribeSearchRsp
	UnsubscribeSearch *UnsubscribeSearchRsp
	CreateDoc         *CreateDocRsp

	SearchResults *SearchResultsRsp
	Error         *ErrorRsp
}

type LoginRsp struct {
	UserId string
	ConnId string
}

func (rsp LoginRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgLogin, Login: &rsp})
}

type SubscribeDocRsp struct {
	DocId string
	SubId int
	Rev   int
	Body  string
}

func (rsp SubscribeDocRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSubscribeDoc, SubscribeDoc: &rsp})
}

type UnsubscribeDocRsp struct {
	SubId int
}

func (rsp UnsubscribeDocRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgUnsubscribeDoc, UnsubscribeDoc: &rsp})
}

type ReviseRsp struct {
	OrigConnId string
	OrigSubId  int
	DocId      string
	SubIds     []int
	Rev        int
	Ops        ot.Ops
}

func (rsp ReviseRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgRevise, Revise: &rsp})
}

// TODO: Send initial results here?
type SubscribeSearchRsp struct {
	Query string
}

func (rsp SubscribeSearchRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSubscribeSearch, SubscribeSearch: &rsp})
}

type UnsubscribeSearchRsp struct {
	Query string
}

func (rsp UnsubscribeSearchRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgUnsubscribeSearch, UnsubscribeSearch: &rsp})
}

type CreateDocRsp struct {
	CreateId int
	DocId    string
}

func (rsp CreateDocRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgCreateDoc, CreateDoc: &rsp})
}

type SearchResultsRsp struct {
	Query   string
	Total   int
	Results []SearchResult
}

type SearchResult struct {
	DocId string
	Body  string
}

func (rsp SearchResultsRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSearchResults, SearchResults: &rsp})
}

type ErrorRsp struct {
	Msg string
}

func (rsp ErrorRsp) Send(sock sockjs.Session) error {
	log.Printf("client error: %s", rsp.Msg)
	return sendRsp(sock, &Rsp{Type: MsgError, Error: &rsp})
}

func sendRsp(sock sockjs.Session, rsp *Rsp) error {
	buf := &bytes.Buffer{}
	if err := json.NewEncoder(buf).Encode(rsp); err != nil {
		return err
	}
	return sock.Send(buf.String())
}
