package handler_test

import (
	"net/http"
	"strings"
	"testing"
)

// The happy paths are covered by the sibling suite. These are the rejections —
// the branches that decide whether a bad request becomes a clear 4xx or a
// confusing 5xx, and the ones a handler refactor silently drops because nothing
// exercises them.

func TestMalformedJSONIsRejectedWithA400(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	for _, tc := range []struct {
		name, method, path string
	}{
		{"create", http.MethodPost, "/api/v1/examples"},
		{"update", http.MethodPut, "/api/v1/examples/1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader("{not json"))
			if err != nil {
				t.Fatalf("building request: %v", err)
			}
			req.Header.Set("Content-Type", "application/json")

			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer res.Body.Close()

			// 400, not 500. A decode failure is the client's fault, and
			// returning 500 sends the caller to retry a request that can never
			// succeed while pointing an operator at the wrong service.
			if res.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", res.StatusCode)
			}
		})
	}
}

func TestOperationsOnAMissingIDReturn404(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	t.Run("get", func(t *testing.T) {
		res, err := srv.Client().Get(srv.URL + "/api/v1/examples/nope")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", res.StatusCode)
		}
	})

	t.Run("update", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/v1/examples/nope",
			strings.NewReader(`{"name":"n","value":"v"}`))
		req.Header.Set("Content-Type", "application/json")
		res, err := srv.Client().Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer res.Body.Close()
		// A PUT that creates on miss would be a different API contract; this
		// pins the one the handler implements.
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", res.StatusCode)
		}
	})

	t.Run("delete", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/v1/examples/nope", nil)
		res, err := srv.Client().Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 404", res.StatusCode)
		}
	})
}

func TestDeleteOfAnExistingRecordReturns204WithNoBody(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	created, err := srv.Client().Post(srv.URL+"/api/v1/examples", "application/json",
		strings.NewReader(`{"name":"gone","value":"soon"}`))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	defer created.Body.Close()
	body := decodeJSON[struct {
		ID string `json:"id"`
	}](t, created.Body)

	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/v1/examples/"+body.ID, nil)
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}
	// 204 means no body. Writing one is a protocol violation some clients treat
	// as a framing error rather than ignoring.
	if res.ContentLength > 0 {
		t.Errorf("204 carried a body of %d bytes", res.ContentLength)
	}
}
