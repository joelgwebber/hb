package onde

import (
	"onde/solr"
	"onde/ot"
)

func FindUser(id string) (solr.JsonObject, error) {
	return solr.GetDoc("onde", solrId(id))
}

func NewUser(id, pass string) (error) {
	return solr.UpdateDoc("onde", solrId(id), map[string]*ot.Doc{
			"pass": ot.NewDoc(pass), // TODO: hash this. This looks like a promising guide: https://crackstation.net/hashing-security.htm
		}, true)
}

func solrId(id string) string {
	return "user/" + id
}
