package solr

import (
	"net/url"
	"io"
	"fmt"
	"net/http"
	"bytes"
	"strings"
	"log"
	"time"
	"errors"
	"os"
	"onde/cherr"
	"io/ioutil"
	"path"
	"path/filepath"
	"encoding/json"
	"strconv"
	"math"
)

const (
	docVersion = 0
	solrUrl = "http://localhost:8983/solr"
)

var paramMaxLimit = []string{strconv.Itoa(math.MaxInt32)} // Int32 is okay because Lucene uses 32-bit doc ids.

type solrHandlerName string

const SolrAdminHandler solrHandlerName = "admin"
const SolrAdminCoresHandler solrHandlerName = "admin/cores"
const SolrFieldAnalysisHandler solrHandlerName = "analysis/field"
const SolrLukeHandler solrHandlerName = "admin/luke"
const SolrSelectHandler solrHandlerName = "select"
const SolrTermsHandler solrHandlerName = "terms"
const SolrUpdateHandler solrHandlerName = "update"

var ParamKeyCaption = "wat" // this is the map key for a small payload to describe the query's purpose, for debugging

//
// SolrHome reads SOLR_HOME (which should contain the path to the Solr home directory) from the environment.  Panics if
// the variable is not set.
//
func SolrHome() string {
	varname := "SOLR_HOME"
	solrhome := os.Getenv(varname)
	if solrhome == "" {
		panic(varname + " environment variable not set")
	}
	return solrhome
}

// Performs a soft commit on Solr, ensuring that the latest updates are availabe to queries.
func SoftCommit(orgId string) error {
	if _, err := Get(orgId, SolrUpdateHandler, url.Values{
			ParamKeyCaption: []string{"soft-commit"},
			"softCommit":    []string{"true"},
	}); err != nil {
		return cherr.Errorf(err, "failed to soft-commit Solr for org %s", orgId)
	}
	return nil
}

//
// Ensures that a core exists for the specified orgId.
//
func EnsureCore(orgId string) error {
	exists, err := DoesCoreExist(orgId)
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

//
// Checks to see if there's a core for this org.
//
func DoesCoreExist(orgId string) (bool, error) {
	urls := solrUrl + "/admin/cores"
	coreName := orgId
	params := url.Values{
		"action": []string{"STATUS"},
		"core":   []string{coreName},
		"wt":     []string{"json"},
	}
	val, err := DoRaw(urls, params, nil, "")
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
		"q":             []string{fmt.Sprintf("id:%s", key)},
		"rows":          []string{"1"},
	}
	count, docs, err := GetDocs(orgId, params)
	if err != nil {
		return nil, err
	}
	if count != 1 {
		return nil, errors.New("expected a single document")
	}
	return JsonObject(docs[0].(map[string]interface{})), nil
}

// Gets one or more documents using the search handler.
// Returns the total number of docs that matches, the subset of actual docs that was requests, and any error.
func GetDocs(orgId string, params url.Values) (int, []interface{}, error) {
	val, err := Get(orgId, SolrSelectHandler, params)
	if err != nil {
		return 0, nil, err
	}

	responseDocs := val.GetArray("response.docs")
	numResponseDocs := len(responseDocs)
	return numResponseDocs, responseDocs, nil
}

func UpdateDoc(orgId, docId, body string, forceCommit bool) error {
	doc := make(map[string]interface{})
	doc["_version_"] = docVersion
	doc["id"] = docId
	doc["body"] = body

	buf := &bytes.Buffer{}
	buf.WriteString(`{"add":{"doc":`)
	err := json.NewEncoder(buf).Encode(&doc)
	if err != nil {
		return err
	}
	buf.WriteString(`}}`)

	params := url.Values{}
	if forceCommit {
		params.Set("commit", "true")
	}

	// TODO: Check result.
	_, err = Post(orgId, SolrUpdateHandler, params, buf.Bytes(), "application/json")
	return err // could be nil
}

//
// Creates a new Solr core for the specified org if one does not exist already.
// If the core's directory structure happens to be populated, it will overwrite all the config files
// (e.g. to update the schema) but will not touch the index data. It's meant to be non-destructive other than
// upgrading config.
//
func createCore(orgId string) error {
	start := time.Now()
	coreName := orgId

	// Create files
	dir := path.Join(SolrHome(), "cores", "onde", orgId)

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
	r, err := doRaw(urls, params, nil, "")
	if err != nil {
		return cherr.Errorf(err, "request failed when trying to create core for org %s", orgId)
	}
	drainAndClose(r)
	log.Printf("Created core for org %s at %s in %s", orgId, dir, time.Since(start))

	return nil
}

// Performs an HTTP GET to solr at the named handler, returning the result as parsed JSON.
func Get(orgId string, handler solrHandlerName, params url.Values) (JsonObject, error) {
	return Do(orgId, handler, params, nil, "")
}

// Performs an HTTP POST to solr at the named handler, returning the result as parsed JSON.
func Post(orgId string, handler solrHandlerName, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	return Do(orgId, handler, params, body, bodyType)
}

// Performs an HTTP request to solr at the named handler, returning the response as a parsed JSON payload.
// Adjusts params to enforce norms (e.g. specifying "wt" to get JSON responses).
func Do(orgId string, handler solrHandlerName, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	coreName := orgId
	params.Set("wt", "json") // always JSON responses

	// Since the same params are sometimes used across multiple calls (such as in Stream), we Del first to make sure these Adds don't accumulate.
	params.Del("debug")
	params.Add("debug", "timing")
	params.Add("debug", "query")

	baseUrl := fmt.Sprintf("%s/%s/%s", solrUrl, coreName, handler)

	r, err := doRaw(baseUrl, params, body, bodyType)
	if err != nil {
		return nil, err
	}

	var result JsonObject
	if err = json.NewDecoder(r).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

// Performs an HTTP request with an exact URL, returning the response as a parsed JSON payload.
// Does not touch the params.
func DoRaw(baseUrl string, params url.Values, body []byte, bodyType string) (JsonObject, error) {
	r, err := doRaw(baseUrl, params, body, bodyType)
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

func doRaw(baseUrl string, params url.Values, body []byte, bodyType string) (io.ReadCloser, error) {
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
		log.Printf("%s", reqDesc)
		break
	}

	if err := checkResponse(rsp); err != nil {
		return nil, errors.New(fmt.Sprintf("Solr interaction failed for %s : %s", urls, err))
	}
	return rsp.Body, nil
}

const (
	// Indicates that the request was bad but there's no reason to believe it could succeed ever.
	// The client should log a prominent warning but not retry. For example, a task handler receiving this from the backend should consider the task complete.
	StatusBadRequestDoNoRetry = 466

	// Indicates that the request was bad and the client should happily give up.
	// Realistically, this is how we get App Engine's task queue to stop retrying after receiving a 466.
	StatusGiveUpDoNoRetry = 266

	// By default, how much of the body of the response to include when stringifying an HTTP error.
	DefaultMaxErrorBody = 2048 // this is not a magic value, just feels like a good one

	// ditto, if the body is html.
	DefaultMaxHtmlErrorBody = 128 // this is not a magic value, just feels like a good one
)

type Error struct {
	Code        int
	ContentType string
	Message     string
}

func (e *Error) Error() string {
	if e.ContentType == "text/html" {
		return e.ErrorN(DefaultMaxHtmlErrorBody)
	} else {
		return e.ErrorN(DefaultMaxErrorBody)
	}
}

// ErrorN returns a string description of this error, with a custom limit on how much of the response body to include.
// A limit of -1 means "everything".
func (e *Error) ErrorN(maxBodyLen int) string {
	if maxBodyLen == -1 || maxBodyLen > len(e.Message) {
		return formatError(e.Code, e.Message)
	} else {
		return formatError(e.Code, e.Message[:maxBodyLen])
	}
}

func formatError(status int, body string) string {
	return fmt.Sprintf("HTTP error %d: %s", status, body)
}

func checkResponse(rsp *http.Response) error {
	if rsp.StatusCode >= 200 && rsp.StatusCode <= 299 {
		return nil
	}
	body, err := ioutil.ReadAll(rsp.Body)
	if err != nil {
		body = []byte("[failed to read body]")
	}
	rsp.Body.Close()

	return &Error{
		Code:        rsp.StatusCode,
		ContentType: rsp.Header.Get("Content-Type"),
		Message:     strings.TrimSpace(string(body)),
	}
}

// DrainAndClose discards any remaining bytes in r, then closes r.
// You have to read responses fully to properly free up connections.
// See https://groups.google.com/forum/#!topic/golang-nuts/pP3zyUlbT00
func drainAndClose(r io.ReadCloser) error {
	_, copyErr := io.Copy(ioutil.Discard, r)
	closeErr := r.Close()
	if closeErr != nil {
		return closeErr
	} else {
		return copyErr
	}
}

func copyFile(dst string, src string) error {
	os.MkdirAll(filepath.Dir(dst), os.ModePerm) // the file mode is further modified by the user's umask

	data, err := ioutil.ReadFile(src)
	if err != nil {
		return err
	}

	return ioutil.WriteFile(dst, data, os.FileMode(0666))
}
