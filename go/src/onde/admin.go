package onde

import (
	"net/http"
	"fmt"
)

func errorf(w http.ResponseWriter, status int, format string, args ...interface{}) {
	w.WriteHeader(status)
	w.Write([]byte(fmt.Sprintf(format, args...)))
}

func newUserHandler(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		errorf(w, http.StatusBadRequest, "error parsing form : %s", err)
		return
	}

	id := r.Form.Get("id")
	pass := r.Form.Get("pass")
	if id == "" || pass == "" {
		errorf(w, http.StatusBadRequest, "missing 'id' or 'pass' parameter")
		return
	}

// TODO: Don't clobber users. For now, this doesn't hurt anything, because there's no data apart from password.
//	_, err = FindUser(id)
//	if err != solr.ErrorNotFound {
//		errorf(w, http.StatusForbidden, "cannot create user %s : %s", id, err)
//		return
//	}

	err = NewUser(id, pass)
	if err != nil {
		errorf(w, http.StatusInternalServerError, "error creating new user: %s", err)
	}

	w.Write([]byte("success"))
}
