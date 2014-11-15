package hb

import (
	"hb/solr"
	"net/http"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
)

func init() {
	solr.EnsureCore("hb")

	http.Handle("/sock/", sockjs.NewHandler("/sock", sockjs.DefaultOptions, sockHandler))
	http.Handle("/admin/new-user", http.HandlerFunc(newUserHandler))
}
