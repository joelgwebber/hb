package solr

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"onde/cherr"
	"os"
	"path"
	"strings"
	"time"
	"onde/ot"
)

const (
	docVersion = 0
	solrUrl    = "http://localhost:8983/solr"

	SolrAdminHandler         = "admin"
	SolrAdminCoresHandler    = "admin/cores"
	SolrFieldAnalysisHandler = "analysis/field"
	SolrLukeHandler          = "admin/luke"
	SolrSelectHandler        = "select"
	SolrTermsHandler         = "terms"
	SolrUpdateHandler        = "update"
)

// Performs a soft commit on Solr, ensuring that the latest updates are availabe to queries.
func SoftCommit(orgId string) error {
	if _, err := get(orgId, SolrUpdateHandler, url.Values{
		"softCommit": []string{"true"},
	}); err != nil {
		return cherr.Errorf(err, "failed to soft-commit Solr for org %s", orgId)
	}
	return nil
}

// Ensures that a core exists for the specified orgId.
func EnsureCore(orgId string) error {
	exists, err := CoreExists(orgId)
	if err != nil {
		return cherr.Errorf(err, "failed to determine whether a core exists for org %s", orgId)
	}
	if exists {
		return nil
	}
	if err := createCore(orgId); err != nil {
		return cherr.Errorf(err, "failed to create core for org %s", orgId)
	}
	return nil
}

// Checks to see if there's a core for this org.
func CoreExists(orgId string) (bool, error) {
	urls := solrUrl + "/admin/cores"
	coreName := orgId
	params := url.Values{
		"action": []string{"STATUS"},
		"core":   []string{coreName},
		"wt":     []string{"json"},
	}
	val, err := doRaw(urls, params, nil, "")
	if err != nil {
		return false, err
	}

	name := val.GetString("status." + coreName + ".name")
	if name != nil && *name == coreName {
		// Okay, I'm convinced that there is a core for this org.
		return true, nil
	}

	return false, nil
}

func GetDoc(orgId, key string) (JsonObject, error) {
	params := url.Values{
		"q":    []string{fmt.Sprintf("id:%s", key)},
		"rows": []string{"1"},
	}
	count, docs, err := GetDocs(orgId, params)
	if err != nil {
		return nil, err
	}
	if count != 1 {
		return nil, errors.New("expected a single document")
	}
	return docs[0], nil
}

// Gets one or more documents using the search handler.
func GetDocs(orgId string, params url.Values) (total int, results []JsonObject, err error) {
	var val JsonObject
	val, err = get(orgId, SolrSelectHandler, params)
	if err != nil {
		return
	}

	docs := val.GetArray("response.docs")
	total = int(*val.GetNumber("response.numFound"))
	_ = val.GetNumber("response.start") // TODO: Use this in paging.

	results = make([]JsonObject, len(docs))
	for i, doc := range docs {
		results[i], err = JsonFromInterface(doc)
		if err != nil {
			return
		}
	}
	return
}

// TODO: Consider changing 'doc' to just be docId and the prop map.

func UpdateDoc(orgId, docId string, props map[string]*ot.Doc, forceCommit bool) error {
	// Build the solr document.
	solrdoc := make(map[string]interface{})
	solrdoc["_version_"] = docVersion
	solrdoc["id"] = docId
	for name, doc := range props {
		solrdoc["prop_" + name] = doc.String()
	}

	buf := &bytes.Buffer{}
	buf.WriteString(`{"add":{"doc":`)
	err := json.NewEncoder(buf).Encode(&solrdoc)
	if err != nil {
		return err
	}
	buf.WriteString(`}}`)

	params := url.Values{}
	if forceCommit {
		params.Set("commit", "true")
	}

	_, err = post(orgId, SolrUpdateHandler, params, buf.Bytes(), "application/json")
	return err
}


func solrHome() string {
	varname := "SOLR_HOME"
	solrhome := os.Getenv(varname)
	if solrhome == "" {
		panic(varname + " environment variable not set")
	}
	return solrhome
}

// Creates a new Solr core for the specified org if one does not exist already.
// If the core's directory structure happens to be populated, it will overwrite all the config files
// (e.g. to update the schema) but will not touch the index data. It's meant to be non-destructive other than
// upgrading config.
func createCore(orgId string) error {
	start := time.Now()
	coreName := orgId

	// Create files
	dir := path.Join(solrHome(), "cores", "onde", orgId)

	confdir := path.Join(dir, "conf")
	if err := copyFile(path.Join(confdir, "solrconfig.xml"), "go/src/onde/solr/solrconfig.xml"); err != nil {
		return cherr.Errorf(nil, "failed to write solrconfig.xml when creating core for org %s", orgId)
	}

	if err := copyFile(path.Join(confdir, "schema.xml"), "go/src/onde/solr/schema.xml"); err != nil {
		return cherr.Errorf(nil, "failed to write schema.xml when creating core for org %s", orgId)
	}

	// Make Solr aware of the dir
	urls := solrUrl + "/admin/cores"
	params := url.Values{
		"action":      []string{"CREATE"},
		"name":        []string{coreName},
		"instanceDir": []string{dir},
	}
	_, err := doRaw(urls, params, nil, "")
	if err != nil {
		return cherr.Errorf(err, "request failed when trying to create core for org %s", orgId)
	}
	// TODO: check response
	log.Printf("Created core for org %s at %s in %s", orgId, dir, time.Since(start))
	return nil
}

// Performs an HTTP GET to solr at the named handler, returning the result as parsed JSON.
func get(orgId, handler string, params url.Values) (JsonObject, error) {
	return do(orgId, handler, params, nil, "")
}

// Performs an HTTP POST to solr at the named handler, returning the result as parsed JSON.
func post(orgId, handler string, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	return do(orgId, handler, params, body, bodyType)
}

// Performs an HTTP request to solr at the named handler, returning the response as a parsed JSON payload.
// Adjusts params to enforce norms (e.g. specifying "wt" to get JSON responses).
func do(orgId, handler string, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	coreName := orgId
	params.Set("wt", "json") // always JSON responses

	// Since the same params are sometimes used across multiple calls (such as in Stream), we Del first to make sure these Adds don't accumulate.
	params.Del("debug")
	params.Add("debug", "timing")
	params.Add("debug", "query")

	baseUrl := fmt.Sprintf("%s/%s/%s", solrUrl, coreName, handler)

	return doRaw(baseUrl, params, body, bodyType)
}

// Performs an HTTP request with an exact URL, returning the response as a parsed JSON payload.
// Does not touch the params.
func doRaw(baseUrl string, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	r, err := doRawReader(baseUrl, params, body, bodyType)
	if err != nil {
		return nil, err
	}
	defer drainAndClose(r)

	js, err := ParseJson(r)
	if err != nil {
		return nil, cherr.Errorf(err, "failed to parse JSON response from Solr")
	}

	return js, nil
}

func doRawReader(baseUrl string, params url.Values, body []byte, bodyType string) (io.ReadCloser, error) {
	urls := fmt.Sprintf("%s?%s", baseUrl, params.Encode())

	var reqDesc string
	var rsp *http.Response
	var err error
	var retries uint
	const maxRetries = 4

	for {
		if body == nil {
			reqDesc = fmt.Sprintf("solr GET to %s", urls)
			rsp, err = http.Get(urls)
		} else {
			reqDesc = fmt.Sprintf("solr POST to %s (%d bytes)", urls, len(body))
			rsp, err = http.Post(urls, bodyType, bytes.NewReader(body))
		}
		if err != nil {
			errmsg := err.Error()
			if strings.Contains(errmsg, "connection reset by peer") && retries < 4 {
				// Wait a tick and retry.
				retries++
				msWait := 10 * (1 << retries)
				log.Printf("waiting %d ms after failed attempt %d of %d on %s: %s", msWait, retries, maxRetries, reqDesc, err)
				time.Sleep(time.Duration(msWait) * time.Millisecond)
				continue
			}
			log.Printf("failed %s: %s", reqDesc, err)
			return nil, err
		}
		//		log.Printf("%s", reqDesc)
		break
	}

	if err := checkResponse(rsp); err != nil {
		return nil, errors.New(fmt.Sprintf("Solr interaction failed for %s : %s", urls, err))
	}
	return rsp.Body, nil
}
