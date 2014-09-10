package api

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

type Change struct {
	Prop string
	Ops  ot.Ops
}

// Requests.
type Req struct {
	Type              string
	Login             *LoginReq             `json:",omitempty"`
	SubscribeDoc      *SubscribeDocReq      `json:",omitempty"`
	UnsubscribeDoc    *UnsubscribeDocReq    `json:",omitempty"`
	Revise            *ReviseReq            `json:",omitempty"`
	SubscribeSearch   *SubscribeSearchReq   `json:",omitempty"`
	UnsubscribeSearch *UnsubscribeSearchReq `json:",omitempty"`
	CreateDoc         *CreateDocReq         `json:",omitempty"`
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
	Change Change
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

	Login             *LoginRsp             `json:",omitempty"`
	Revise            *ReviseRsp            `json:",omitempty"`
	SubscribeDoc      *SubscribeDocRsp      `json:",omitempty"`
	UnsubscribeDoc    *UnsubscribeDocRsp    `json:",omitempty"`
	SubscribeSearch   *SubscribeSearchRsp   `json:",omitempty"`
	UnsubscribeSearch *UnsubscribeSearchRsp `json:",omitempty"`
	CreateDoc         *CreateDocRsp         `json:",omitempty"`

	SearchResults *SearchResultsRsp `json:",omitempty"`
	Error         *ErrorRsp         `json:",omitempty"`
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
	Props map[string]string
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
	Change     Change
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
	Title string
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
