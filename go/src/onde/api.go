package onde

import (
	"bytes"
	"encoding/json"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
	"onde/ot"
)

const (
	MsgLogin     = "login"
	MsgSubscribe = "subscribe"
	MsgRevise    = "revise"
	MsgError     = "error"
)

type Req struct {
	Type      string
	Login     *LoginReq
	Revise    *ReviseReq
	Subscribe *SubscribeReq
}

type LoginReq struct {
	UserId string
}

type SubscribeReq struct {
	DocId string
}

type ReviseReq struct {
	ConnId string
	DocId  string
	Rev    int
	Ops    ot.Ops
}

type Rsp struct {
	Type      string
	Login     *LoginRsp
	Subscribe *SubscribeRsp
	Revise    *ReviseRsp
	Error     *ErrorRsp
}

type LoginRsp struct {
	UserId string
	ConnId string
}

func (rsp LoginRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgLogin, Login: &rsp})
}

type SubscribeRsp struct {
	DocId string
	Rev   int
	Doc   string
}

func (rsp SubscribeRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgSubscribe, Subscribe: &rsp})
}

type ReviseRsp struct {
	ConnId string
	Rev    int
	Ops    ot.Ops
}

func (rsp ReviseRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgRevise, Revise: &rsp})
}

type ErrorRsp struct {
	Msg string
}

func (rsp ErrorRsp) Send(sock sockjs.Session) error {
	return sendRsp(sock, &Rsp{Type: MsgError, Error: &rsp})
}

func sendRsp(sock sockjs.Session, rsp *Rsp) error {
	buf := &bytes.Buffer{}
	if err := json.NewEncoder(buf).Encode(rsp); err != nil {
		return err
	}
	return sock.Send(buf.String())
}
