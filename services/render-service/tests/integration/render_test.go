package integration

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func doReq(t *testing.T, method, url, token string, body any) *http.Response {
	t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, url, r)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	return resp
}

func decodeBody(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	var out map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func TestCreateRenderJob(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	assert.Equal(t, 201, resp.StatusCode)
	d := decodeBody(t, resp)
	data := d["data"].(map[string]any)
	assert.Equal(t, "queued", data["status"])
	assert.NotEmpty(t, data["job_id"])
}

func TestCreateRenderJob_ViewerForbidden(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.ViewerToken, body)
	assert.Equal(t, 403, resp.StatusCode)
	resp.Body.Close()
}

func TestCreateRenderJob_InvalidResolution(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "8k",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	assert.Equal(t, 400, resp.StatusCode)
	d := decodeBody(t, resp)
	assert.Equal(t, "INVALID_INPUT", d["error"].(map[string]any)["code"])
}

func TestCreateRenderJob_NoAuth(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), "", body)
	assert.Equal(t, 401, resp.StatusCode)
	resp.Body.Close()
}

func TestGetRenderJob(t *testing.T) {
	h := getH(t)
	// create
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "1080p",
		"format":     "mov",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	require.Equal(t, 201, resp.StatusCode)
	d := decodeBody(t, resp)
	jobID := d["data"].(map[string]any)["job_id"].(string)

	// get
	resp2 := doReq(t, "GET", h.URL("/v1/render/"+jobID), h.TeamA.OwnerToken, nil)
	assert.Equal(t, 200, resp2.StatusCode)
	d2 := decodeBody(t, resp2)
	data := d2["data"].(map[string]any)
	assert.Equal(t, jobID, data["id"])
	assert.Equal(t, "queued", data["status"])
	assert.Equal(t, "1080p", data["resolution"])
	assert.Equal(t, "mov", data["format"])
}

func TestGetRenderJob_NotFound(t *testing.T) {
	h := getH(t)
	resp := doReq(t, "GET", h.URL("/v1/render/00000000-0000-0000-0000-000000000000"), h.TeamA.OwnerToken, nil)
	assert.Equal(t, 404, resp.StatusCode)
	resp.Body.Close()
}

func TestDeleteRenderJob_Queued(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	require.Equal(t, 201, resp.StatusCode)
	d := decodeBody(t, resp)
	jobID := d["data"].(map[string]any)["job_id"].(string)

	// cancel
	resp2 := doReq(t, "DELETE", h.URL("/v1/render/"+jobID), h.TeamA.OwnerToken, nil)
	assert.Equal(t, 204, resp2.StatusCode)
	resp2.Body.Close()

	// verify cancelled
	resp3 := doReq(t, "GET", h.URL("/v1/render/"+jobID), h.TeamA.OwnerToken, nil)
	d3 := decodeBody(t, resp3)
	assert.Equal(t, "cancelled", d3["data"].(map[string]any)["status"])
}

func TestDeleteRenderJob_ViewerForbidden(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	require.Equal(t, 201, resp.StatusCode)
	d := decodeBody(t, resp)
	jobID := d["data"].(map[string]any)["job_id"].(string)

	resp2 := doReq(t, "DELETE", h.URL("/v1/render/"+jobID), h.TeamA.ViewerToken, nil)
	assert.Equal(t, 403, resp2.StatusCode)
	resp2.Body.Close()
}

func TestListRenderJobs(t *testing.T) {
	h := getH(t)
	// create 3 jobs
	for i := 0; i < 3; i++ {
		body := map[string]any{
			"project_id": h.TeamA.ProjectID.String(),
			"resolution": "720p",
			"format":     "mp4",
		}
		resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
		require.Equal(t, 201, resp.StatusCode)
		resp.Body.Close()
	}

	resp := doReq(t, "GET", h.URL("/v1/render?project_id="+h.TeamA.ProjectID.String()), h.TeamA.OwnerToken, nil)
	assert.Equal(t, 200, resp.StatusCode)
	d := decodeBody(t, resp)
	items := d["data"].([]any)
	assert.Equal(t, 3, len(items))
}

func TestRLSIsolation(t *testing.T) {
	h := getH(t)
	// team A creates a job
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	resp := doReq(t, "POST", h.URL("/v1/render"), h.TeamA.OwnerToken, body)
	require.Equal(t, 201, resp.StatusCode)
	d := decodeBody(t, resp)
	jobID := d["data"].(map[string]any)["job_id"].(string)

	// team B cannot GET team A's job (RLS filters it out → 404)
	resp2 := doReq(t, "GET", h.URL("/v1/render/"+jobID), h.TeamB.OwnerToken, nil)
	assert.Equal(t, 404, resp2.StatusCode)
	resp2.Body.Close()

	// team B list is empty
	resp3 := doReq(t, "GET", h.URL("/v1/render"), h.TeamB.OwnerToken, nil)
	d3 := decodeBody(t, resp3)
	items := d3["data"].([]any)
	assert.Equal(t, 0, len(items))
}

func TestIdempotency(t *testing.T) {
	h := getH(t)
	body := map[string]any{
		"project_id": h.TeamA.ProjectID.String(),
		"resolution": "720p",
		"format":     "mp4",
	}
	// first request with idempotency key
	req1, _ := http.NewRequest("POST", h.URL("/v1/render"), strings.NewReader(mustJSON(body)))
	req1.Header.Set("Authorization", "Bearer "+h.TeamA.OwnerToken)
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "test-idem-1")
	resp1, err := http.DefaultClient.Do(req1)
	require.NoError(t, err)
	assert.Equal(t, 201, resp1.StatusCode)
	d1 := decodeBody(t, resp1)
	jobID1 := d1["data"].(map[string]any)["job_id"].(string)

	// second request with same key → 200 + same job_id
	req2, _ := http.NewRequest("POST", h.URL("/v1/render"), strings.NewReader(mustJSON(body)))
	req2.Header.Set("Authorization", "Bearer "+h.TeamA.OwnerToken)
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "test-idem-1")
	resp2, err := http.DefaultClient.Do(req2)
	require.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)
	d2 := decodeBody(t, resp2)
	jobID2 := d2["data"].(map[string]any)["job_id"].(string)
	assert.Equal(t, jobID1, jobID2)
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
