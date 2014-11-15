package cherr

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// These extra comment lines are useful to make sure the line number-sensitive tests below keep working.
func a() error {
	if err := b(); err != nil {
		return Errorf(err, "failed in a")
	}
	return nil
}

func b() error {
	if err := c(); err != nil {
		return Errorf(err, "failed in b")
	}
	return nil
}

func c() error {
	return Errorf(nil, "failed in c")
}

// This goes below a, b, c so the line numbers will be stable
func TestChainedError(t *testing.T) {
	err := a()
	s := fmt.Sprintf("%s", err)
	lines := strings.Split(s, "\n")
	if len(lines) != 3 {
		t.Error("not 3 lines")
	}
	if !strings.HasSuffix(lines[0], "cherr_test.go:14 failed in a") {
		t.Errorf("fail: %s", lines[0])
	}
	if !strings.HasSuffix(lines[1], "cherr_test.go:21 failed in b") {
		t.Errorf("fail: %s", lines[1])
	}
	if !strings.HasSuffix(lines[2], "cherr_test.go:27 failed in c") {
		t.Errorf("fail: %s", lines[2])
	}
}

// This is another padding line that helps the line number-sensitive tests below pass
func x() error {
	if err := y(); err != nil {
		return Errorf(err, "failed in x")
	}
	return nil
}

func y() error {
	if err := z(); err != nil {
		return Errorf(err, "failed in y")
	}
	return nil
}

func z() error {
	return errors.New("failure in z")
}

// This goes below x, y, z so the line numbers will be stable
func TestMixedError(t *testing.T) {
	err := x()
	s := fmt.Sprintf("%s", err)
	lines := strings.Split(s, "\n")
	if len(lines) != 3 {
		t.Error("not 3 lines")
	}
	if !strings.HasSuffix(lines[0], "cherr_test.go:52 failed in x") {
		t.Errorf("fail: %s", lines[0])
	}
	if !strings.HasSuffix(lines[1], "cherr_test.go:59 failed in y") {
		t.Errorf("fail: %s", lines[1])
	}
	if strings.Index(lines[2], "cherr_test.go") != -1 {
		t.Errorf("fail: %s", lines[2])
	}
}

func TestCustomError(t *testing.T) {
	var first error = errors.New("foobarred")
	var second ChainedError = Errorf(first, "something went wrong, %s", "like, really").WithExtra([]string{"does", "this", "work"})
	var third ChainedError = Errorf(second, "multilevel failure").WithExtra(42)
	extras := third.Extras()
	if len(extras) != 2 {
		t.Errorf("expected 2 extras")
		return
	}
	if third.Extra().(int) != 42 || extras[0].Extra().(int) != 42 {
		t.Errorf("expected int 42")
		return
	}
	if second.Extra().([]string)[1] != "this" || extras[1].Extra().([]string)[2] != "work" {
		t.Errorf("expected 'this'/'work'")
		return
	}
	var someErr error = third
	if FirstExtra(someErr, reflect.TypeOf([]string{})).([]string)[0] != "does" {
		t.Errorf("expected 'does'")
		return
	}
}

func TestRootCause(t *testing.T) {
	origin := errors.New("origin")
	chained := Errorf(origin, "blah blah")
	if chained.RootCause() != origin {
		t.Errorf("expected chained.RootCause to equal origin (was %v)", chained.RootCause())
	}

	doubleChained := Errorf(chained, "blah blah blah")
	if doubleChained.RootCause() != origin {
		t.Errorf("expected doubleChaied.RootCause to equal origin (was %v)", doubleChained.RootCause())
	}

	chained = Errorf(nil, "blah blah")
	if chained.RootCause() != nil {
		t.Errorf("expected chained.RootCause to be nil (was %v)", chained.RootCause())
	}

	doubleChained = Errorf(chained, "blah blah blah")
	if doubleChained.RootCause() != nil {
		t.Errorf("expected doubleChained.RootCause to be nil (was %v)", doubleChained.RootCause())
	}
}

type FooTimeout struct {
}

func (FooTimeout) Error() string {
	return "foo timed out"
}

func (FooTimeout) IsTimeout() bool {
	return true
}

type MaybeTimeout struct {
	reallyIsTimeout bool
}

func (e MaybeTimeout) Error() string {
	if e.reallyIsTimeout {
		return "really timed out"
	} else {
		return "didn't time out"
	}
}

func (e MaybeTimeout) IsTimeout() bool {
	return e.reallyIsTimeout
}

func TestIsTimeoutError(t *testing.T) {
	ce := Errorf(nil, "whatever")
	if ce.IsTimeout() {
		t.Error("did not expect chainedError with nil root to be a timeout error...")
	}

	notATimeout := errors.New("hi man")
	ce = Errorf(notATimeout, "whatever")
	if ce.IsTimeout() {
		t.Error("did not expect chainedError with notATimeout root to be a timeout error...")
	}

	notATimeout = MaybeTimeout{reallyIsTimeout: false}
	ce = Errorf(notATimeout, "whatever")
	if ce.IsTimeout() {
		t.Error("did not expect chainedError with MaybeTimeout(false) root to be a timeout error...")
	}

	isATimeout := FooTimeout{}
	ce = Errorf(isATimeout, "whatever")
	if !ce.IsTimeout() {
		t.Error("expected chainedError with FooTimeout root to be a timeout error...")
	}

	alsoIsATimeout := MaybeTimeout{reallyIsTimeout: true}
	ce = Errorf(alsoIsATimeout, "whatever")
	if !ce.IsTimeout() {
		t.Error("expected chainedError with MaybeTimeout(true) root to be a timeout error...")
	}
}
