package solr

import (
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

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
