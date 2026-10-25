package redirects

import (
	"context"
	"os"
	"testing"
)

func TestWorkspaceOwnershipSDK(t *testing.T) {
	if os.Getenv("REDIRECT_OWNER_WORKSPACE") == "" {
		t.Skip("Run the isolated Owner admission fixture")
	}
	ctx := context.Background()
	baseClient, err := New(os.Getenv("REDIRECT_TEST_SESSION"), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	client, err := baseClient.WithWorkspace(os.Getenv("REDIRECT_OWNER_WORKSPACE"))
	if err != nil {
		t.Fatal(err)
	}
	must := func(value Object, err error) Object {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	if must(client.ListWorkspaceOwners(ctx, 50, ""))["workspace"].(map[string]any)["id"] != os.Getenv("REDIRECT_OWNER_WORKSPACE") {
		t.Fatal("Wrong registry workspace")
	}
	found := false
	for _, row := range must(client.ListOwnerCandidates(ctx, 50, ""))["data"].([]any) {
		if row.(map[string]any)["memberId"] == os.Getenv("REDIRECT_OWNER_MEMBER") {
			found = true
		}
	}
	if !found {
		t.Fatal("Missing Owner candidate")
	}
	grant := must(client.AdmitWorkspaceOwner(ctx, os.Getenv("REDIRECT_OWNER_MEMBER"), "viewer"))
	if grant["userId"] != os.Getenv("REDIRECT_OWNER_USER") || grant["canRemove"] != true {
		t.Fatal("Wrong Owner admission")
	}
	if must(client.RemoveWorkspaceOwner(ctx, grant["userId"].(string), grant["version"].(string)))["removed"] != true {
		t.Fatal("Owner removal failed")
	}
}
