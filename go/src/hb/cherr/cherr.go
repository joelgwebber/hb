// Chained error handling support.
package cherr

import (
	"fmt"
	"reflect"
	"runtime"
	"strings"
)

const (
	LineSeparator = "\n...caused by "
)

type ChainedError interface {
	error
	Cause() error
	Extra() interface{}
	Extras() []ChainedError
	RootCause() error
}

// A ChainedError that knows where it originated (i.e. file, line) and can have a message, cause, and extra data.
type chainedError struct {
	cause error
	extra interface{}
	file  string
	line  int
	msg   string
}

func Errorf(cause error, format string, a ...interface{}) chainedError {
	s := fmt.Sprintf(format, a...)
	_, file, line, ok := runtime.Caller(1)
	if ok {
		return chainedError{cause, nil, file, line, s}
	} else {
		return chainedError{cause, nil, "<unknown>", 0, s}
	}
}

// Unfinished returns an error that you can use to identify methods or code paths that are unfinished.
// Assuming you've written tests that exercise the realistic code paths, running tests ought to catch unfinished
// bits of code.
func Unfinished() chainedError {
	s := "========== finish me! =========="
	_, file, line, ok := runtime.Caller(1)
	if ok {
		return chainedError{nil, nil, file, line, s}
	} else {
		return chainedError{nil, nil, "<unknown>", 0, s}
	}
}

func FirstExtra(err error, t reflect.Type) interface{} {
	c, ok := err.(ChainedError)
	if ok {
		causes := c.Extras()
		for _, cause := range causes {
			extra := cause.Extra()
			if reflect.TypeOf(extra) == t {
				return extra
			}
		}
	}
	return nil
}

// Root returns the "root" of an error.  Specifically, if err is a chained error, Root returns the root cause
// (i.e. the first error in the chain).  Otherwise, if err is NOT a chained error, Root just returns err.
func Root(err error) error {
	chained, ok := err.(ChainedError)
	if ok {
		return chained.RootCause()
	} else {
		return err
	}
}

// Returns the cause of this error, which, if not nil, may or may not be another ChainedError.
func (err chainedError) Cause() error {
	return err.cause
}

// Returns a string describing the entire causal chain.
func (err chainedError) Error() string {
	return fmtError(err, "")
}

// Attaches extra data to a copy of an error, returning the copy.
//   return cherr.Errorf(err, "crazy amount of CPU stress right now").SetExtra(cpu.GetStressReadings())
func (err chainedError) WithExtra(extra interface{}) chainedError {
	err.extra = extra
	return err
}

// Gets attached extra data for this error, if any.
func (err chainedError) Extra() interface{} {
	return err.extra
}

// Gets all the ChainedErrors that have extras, from most recent to least recent causes.
func (err chainedError) Extras() []ChainedError {
	var extras = []ChainedError{}
	var curr ChainedError = err
	for curr != nil {
		if curr.Extra() != nil {
			extras = append(extras, curr)
		}
		var ok bool
		curr, ok = curr.Cause().(ChainedError)
		if !ok {
			curr = nil
		}
	}
	return extras
}

func fmtError(err error, prefix string) string {
	chained, ok := err.(chainedError)
	if !ok {
		// Can't descend into cause
		return prefix + err.Error()
	}

	causemsg := ""
	if chained.cause != nil {
		causemsg = fmtError(chained.cause, LineSeparator)
	}

	where := fmt.Sprintf("%s%s:%d ", prefix, chained.file, chained.line)
	return where + chained.msg + causemsg
}

// Checks for the given string in the causal error chain.
func ContainsCause(err error, cause string) bool {
	chained, ok := err.(chainedError)
	if !ok {
		return strings.Contains(err.Error(), cause)
	}

	return strings.Contains(chained.msg, cause) || ContainsCause(chained.cause, cause)
}

// IsTimeoutError reports whether err is a timeout error.  This uses the same logic as appengine.IsTimeoutError except
// that we define it recursively (so this really applies to the root error).
func (err chainedError) IsTimeout() bool {
	rootCause := err.RootCause()
	if rootCause == nil {
		return false
	}
	if t, ok := rootCause.(interface {
		IsTimeout() bool
	}); ok {
		return t.IsTimeout()
	}
	return false
}

// recursively calls Cause() until a non-ChainedError is obtained, which is then returned; thus nil could be returned
// if the first ChainedError was created with a nil cause
func (err chainedError) RootCause() error {
	if err.cause == nil {
		return nil
	}

	cause, ok := err.cause.(ChainedError)
	if ok {
		return cause.RootCause() // if the cause is a ChainedError, then recusively call RootCause on that
	} else {
		return err.cause // otherwise, return the cause
	}
}

func (err chainedError) String() string {
	return err.Error()
}
