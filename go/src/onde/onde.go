package onde

import "onde/solr"

func init() {
	solr.EnsureCore("onde")

	makeUser("joel")
	makeUser("anais")
}
