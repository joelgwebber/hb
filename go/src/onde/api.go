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
)

type Req struct {
	Type      string
	Revise    *ReviseReq
	Subscribe *SubscribeReq
}

type Rsp struct {
	Type      string
	Login     *LoginRsp
	Subscribe *SubscribeRsp
	Revise    *ReviseRsp
}

type SubscribeReq struct {
	DocId string
}

type ReviseReq struct {
	DocId string
	Rev   int
	Ops   ot.Ops
}

type LoginRsp struct {
	UserId string
}

func (rsp LoginRsp) Send(session sockjs.Session) error {
	return sendRsp(session, &Rsp{Type: MsgLogin, Login: &rsp})
}

type SubscribeRsp struct {
	DocId string
	Rev   int
	Doc   string
}

func (rsp SubscribeRsp) Send(session sockjs.Session) error {
	return sendRsp(session, &Rsp{Type: MsgSubscribe, Subscribe: &rsp})
}

type ReviseRsp struct {
	UserId string
	Rev    int
	Ops    ot.Ops
}

func (rsp ReviseRsp) Send(session sockjs.Session) error {
	return sendRsp(session, &Rsp{Type: MsgRevise, Revise: &rsp})
}

func sendRsp(session sockjs.Session, rsp *Rsp) error {
	buf := &bytes.Buffer{}
	if err := json.NewEncoder(buf).Encode(rsp); err != nil {
		return err
	}
	return session.Send(buf.String())
}
