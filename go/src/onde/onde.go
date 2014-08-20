package onde

import (
	"onde/ot"
	"onde/solr"
)

type Document struct {
	id   string
	srv  *ot.Server
	subs map[string]*Connection
}

func GetDocument(docId string) (*Document, error) {
	if doc, exists := docs[docId]; exists {
		return doc, nil
	}

	solrDoc, err := solr.GetDoc("onde", docId)
	if err != nil {
		return nil, err
	}

	bytes := []byte(*solrDoc.GetString("body"))
	doc := &Document{
		id:   docId,
		srv:  &ot.Server{ Doc: (*ot.Doc)(&bytes) },
		subs: make(map[string]*Connection),
	}
	docs[docId] = doc
	return doc, nil
}

func (doc *Document) broadcast(connId string, rev int, ops ot.Ops) {
	// TODO: Total hack to update storage. Do this less aggressively.
	solr.UpdateDoc("onde", doc.id, string(*doc.srv.Doc), true)

	for recvId, conn := range doc.subs {
		if recvId != connId {
			ReviseRsp{
				ConnId: connId,
				Rev:    rev,
				Ops:    ops,
			}.Send(conn.sock)
		}
	}
}

func (doc *Document) addSub(conn *Connection) {
	doc.subs[conn.Id()] = conn
}

func (doc *Document) removeSub(connId string) {
	delete(doc.subs, connId)
}

var docs = make(map[string]*Document)

type User struct {
	id string
}

func makeUser(id string) {
	users[id] = &User{
		id: id,
	}
}

var users = make(map[string]*User)

func init() {
	solr.EnsureCore("onde")
	makeUser("joel")
	makeUser("anais")
}
