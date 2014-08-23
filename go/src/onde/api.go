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
}

type LoginReq struct {
	UserId string
}

type SubscribeDocReq struct {
	DocId string
}

type UnsubscribeDocReq struct {
	DocId string
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

// Responses.
type Rsp struct {
	Type string

	Login             *LoginRsp
	Revise            *ReviseRsp
	SubscribeDoc      *SubscribeDocRsp
	UnsubscribeDoc    *UnsubscribeDocRsp
	SubscribeSearch   *SubscribeSearchRsp
	UnsubscribeSearch *UnsubscribeSearchRsp

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
	Rev   int
	Doc   string
}

func (rsp SubscribeDocRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSubscribeDoc, SubscribeDoc: &rsp})
}

type UnsubscribeDocRsp struct {
	DocId string
}

func (rsp UnsubscribeDocRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgUnsubscribeDoc, UnsubscribeDoc: &rsp})
}

type ReviseRsp struct {
	ConnId string
	SubId  int
	DocId  string
	Rev    int
	Ops    ot.Ops
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

type SearchResultsRsp struct {
	Total   int
	Results []SearchResult
}

type SearchResult struct {
	DocId string
	Doc   string
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
