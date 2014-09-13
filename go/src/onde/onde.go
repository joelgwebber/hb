package onde

import (
	"onde/solr"
	"net/http"
	"gopkg.in/igm/sockjs-go.v2/sockjs"
)

func init() {
	solr.EnsureCore("onde")

	http.Handle("/sock/", sockjs.NewHandler("/sock", sockjs.DefaultOptions, sockHandler))
	http.Handle("/admin/new-user", http.HandlerFunc(newUserHandler))
}
