package hb

import (
	"hb/solr"
	"hb/ot"
)

func FindUser(id string) (solr.JsonObject, error) {
	return solr.GetDoc("hb", solrId(id))
}

func NewUser(id, pass string) (error) {
	return solr.UpdateDoc("hb", solrId(id), map[string]*ot.Doc{
			"pass": ot.NewDoc(pass), // TODO: hash this.
		}, true)
}

func solrId(id string) string {
	return "user|" + id
}
