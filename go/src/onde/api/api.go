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
	MsgSubscribeCard      = "subscribecard"
	MsgUnsubscribeCard    = "unsubscribecard"
	MsgRevise            = "revise"
	MsgSubscribeSearch   = "subscribesearch"
	MsgUnsubscribeSearch = "unsubscribesearch"
	MsgSearchResults     = "searchresults"
	MsgCreateCard         = "createcard"
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
	SubscribeCard      *SubscribeCardReq      `json:",omitempty"`
	UnsubscribeCard    *UnsubscribeCardReq    `json:",omitempty"`
	Revise            *ReviseReq            `json:",omitempty"`
	SubscribeSearch   *SubscribeSearchReq   `json:",omitempty"`
	UnsubscribeSearch *UnsubscribeSearchReq `json:",omitempty"`
	CreateCard         *CreateCardReq         `json:",omitempty"`
}

type LoginReq struct {
	UserId string
	Password string
}

type SubscribeCardReq struct {
	CardId string
	SubId int
}

type UnsubscribeCardReq struct {
	SubId int
}

type ReviseReq struct {
	ConnId string
	SubId  int
	CardId  string
	Rev    int
	Change Change
}

type SubscribeSearchReq struct {
	Query string
}

type UnsubscribeSearchReq struct {
	Query string
}

type CreateCardReq struct {
	CreateId int
	Props    map[string]string
}

// Responses.
type Rsp struct {
	Type string

	Login             *LoginRsp             `json:",omitempty"`
	Revise            *ReviseRsp            `json:",omitempty"`
	SubscribeCard      *SubscribeCardRsp      `json:",omitempty"`
	UnsubscribeCard    *UnsubscribeCardRsp    `json:",omitempty"`
	SubscribeSearch   *SubscribeSearchRsp   `json:",omitempty"`
	UnsubscribeSearch *UnsubscribeSearchRsp `json:",omitempty"`
	CreateCard         *CreateCardRsp         `json:",omitempty"`

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

type SubscribeCardRsp struct {
	CardId string
	SubId int
	Rev   int
	Props map[string]string
}

func (rsp SubscribeCardRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSubscribeCard, SubscribeCard: &rsp})
}

type UnsubscribeCardRsp struct {
	SubId int
}

func (rsp UnsubscribeCardRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgUnsubscribeCard, UnsubscribeCard: &rsp})
}

type ReviseRsp struct {
	OrigConnId string
	OrigSubId  int
	CardId      string
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

type CreateCardRsp struct {
	CreateId int
	CardId    string
}

func (rsp CreateCardRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgCreateCard, CreateCard: &rsp})
}

type SearchResultsRsp struct {
	Query   string
	Total   int
	Results []SearchResult
}

type SearchResult struct {
	CardId string
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
