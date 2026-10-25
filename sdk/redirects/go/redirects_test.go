package redirects

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSDKIntegration(t *testing.T) {
	if os.Getenv("REDIRECT_TEST_BASE") == "" {
		t.Skip("Run npm run test:redirect-sdks for the isolated edge/database fixture")
	}
	ctx := context.Background()
	api, err := New(os.Getenv("REDIRECT_TEST_TOKEN"), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	must := func(result Object, err error) Object {
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	scoped, err := api.WithWorkspace(os.Getenv("REDIRECT_TEST_WORKSPACE"))
	if err != nil || api.workspaceID != "" {
		t.Fatal("Workspace context mutated original client", err)
	}
	api = scoped
	if _, err := api.WithWorkspace("bad\r\nInjected: header"); err == nil {
		t.Fatal("Invalid workspace accepted")
	}
	unavailable, err := api.WithWorkspace("00000000-0000-4000-8000-000000000777")
	if err != nil {
		t.Fatal(err)
	}
	_, err = unavailable.Request(ctx, "GET", "/links", nil, nil)
	var selectionError *APIError
	if !errors.As(err, &selectionError) || selectionError.Status != 403 {
		t.Fatal("Unavailable workspace accepted", err)
	}
	sourcePage := must(api.ListInventory(ctx, Object{"kind": "Client"}, 1, ""))
	sourceRows := sourcePage["data"].([]any)
	if len(sourceRows) != 1 {
		t.Fatal("Inventory page missing")
	}
	sourceRecord := sourceRows[0].(map[string]any)
	sourceMeta := must(api.GetInventoryMetadata(ctx, sourceRecord["id"].(string)))
	organizedSource := must(api.OrganizeInventory(ctx, []Object{{"id": sourceRecord["id"], "version": sourceMeta["metadataVersion"], "values": Object{"comment": "SDK source metadata"}}}))
	organizedRows := organizedSource["data"].([]any)
	if organizedRows[0].(map[string]any)["comment"] != "SDK source metadata" {
		t.Fatal("Inventory metadata roundtrip failed")
	}
	if choices := must(api.ListDomainChoices(ctx, 100, "")); choices["count"].(interface{ String() string }).String() != "1" {
		t.Fatalf("Unexpected domain choices: %#v", choices)
	}
	if must(api.ListLinkedDomains(ctx, 100, ""))["builtinCount"] == nil {
		t.Fatal("Missing builtin facet count")
	}
	folder := must(api.CreateResource(ctx, "folders", Object{"name": "Héllo & + Go"}))
	tag := must(api.CreateResource(ctx, "tags", Object{"name": "Go tag", "color": "pink"}))
	template := must(api.CreateResource(ctx, "templates", Object{"name": "Go template", "parameters": Object{"utm_campaign": "Launch & +"}}))
	fid := folder["id"].(string)
	tid := tag["id"].(string)
	if must(api.UpdateResource(ctx, "folders", fid, Object{"description": "Changed"}))["description"] != "Changed" {
		t.Fatal("Folder update failed")
	}
	if must(api.UpdateResource(ctx, "tags", tid, Object{"color": "blue"}))["color"] != "blue" {
		t.Fatal("Tag update failed")
	}
	if len(must(api.ListResources(ctx, "templates", 100, ""))["data"].([]any)) != 1 {
		t.Fatal("Template list failed")
	}
	if must(api.GetResource(ctx, "folders", fid))["name"] != "Héllo & + Go" {
		t.Fatal("Unicode resource detail failed")
	}

	rootLink := must(api.CreateLink(ctx, Object{"isDomainRoot": true, "domainId": os.Getenv("REDIRECT_TEST_ROOT_DOMAIN"), "target": "https://example.org/home"}))["link"].(map[string]any)
	if rootLink["isDomainRoot"] != true || rootLink["shortUrl"] != "https://root-sdk.example.com/" {
		t.Fatal("Root identity lost")
	}
	rootUpdated := must(api.UpsertLink(ctx, Object{"isDomainRoot": true, "domainId": os.Getenv("REDIRECT_TEST_ROOT_DOMAIN"), "target": "https://example.org/updated"}))["link"].(map[string]any)
	if rootUpdated["id"] != rootLink["id"] {
		t.Fatal("Root upsert duplicated")
	}
	must(api.DeleteLink(ctx, rootLink["id"].(string)))
	created := must(api.CreateLink(ctx, Object{"target": "https://example.com/?q=a%26b#detail", "slug": "sdk-go", "startsAt": "2020-01-01T00:00:00Z", "clickLimit": 25, "notes": "SDK notes", "folderId": fid, "tagIds": []string{tid}}))
	linkFields := created["link"].(map[string]any)
	if linkFields["clickLimit"].(interface{ String() string }).String() != "25" || linkFields["notes"] != "SDK notes" || linkFields["startsAt"] == nil {
		t.Fatal("Full fields lost")
	}
	id := created["link"].(map[string]any)["id"].(string)
	if must(api.GetQRStyle(ctx, id))["style"].(map[string]any)["foreground"] != "#111111" {
		t.Fatal("QR style not readable")
	}
	qrImage := must(api.CreateQRImage(ctx, Object{"linkId": id, "logo": os.Getenv("REDIRECT_TEST_QR_LOGO")}))
	if qrImage["state"] != "published" || qrImage["logoMode"] != "custom" || qrImage["logoAsset"] == nil {
		t.Fatal("Custom artwork was not published")
	}
	if !strings.HasPrefix(qrImage["imageUrls"].(map[string]any)["png"].(string), "https://queer.guide/api/qr?share=qg_qr_") {
		t.Fatal("Image URL capability missing")
	}
	imageFound := false
	for _, raw := range must(api.ListQRImages(ctx, 100, ""))["data"].([]any) {
		if raw.(map[string]any)["id"] == qrImage["id"] {
			imageFound = true
		}
	}
	if !imageFound {
		t.Fatal("Image list omitted published image")
	}
	if must(api.RevokeQRImage(ctx, qrImage["id"].(string), qrImage["version"].(string)))["revokedAt"] == nil {
		t.Fatal("Image was not revoked")
	}
	art := must(api.UploadPreviewImage(ctx, id, os.Getenv("REDIRECT_TEST_IMAGE")))
	must(api.UpdatePresentation(ctx, id, Object{"preview": Object{"title": "SDK preview", "image": art["image"], "video": "https://example.com/a.mp4"}, "cloaked": true}))
	if must(api.GetPresentation(ctx, id))["preview"].(map[string]any)["title"] != "SDK preview" {
		t.Fatal("Presentation round trip failed")
	}
	must(api.UpdatePolicy(ctx, id, Object{"policy": Object{"track_conversions": true, "geo_targets": Object{"CH": "/switzerland"}}, "password": "fixture-sdk-password"}))
	policy := must(api.GetPolicy(ctx, id))
	if policy["hasPassword"] != true || policy["password_hash"] != nil || policy["policy"].(map[string]any)["preview"].(map[string]any)["title"] != "SDK preview" {
		t.Fatal("Policy privacy/merge failed")
	}
	must(api.UpdatePolicy(ctx, id, Object{"policy": Object{"geo_targets": nil}, "password": nil}))
	policy = must(api.GetPolicy(ctx, id))
	if policy["hasPassword"] != false || policy["policy"].(map[string]any)["track_conversions"] != true || policy["policy"].(map[string]any)["geo_targets"] != nil {
		t.Fatal("Policy clearing failed")
	}
	must(api.UpdateLink(ctx, id, Object{"comment": "SDK update", "isEnabled": false}))
	if must(api.GetLink(ctx, id))["folderId"] != fid {
		t.Fatal("Metadata lost")
	}
	if must(api.UpsertLink(ctx, Object{"slug": "sdk-go", "target": "/updated"}))["created"] != false {
		t.Fatal("Upsert identity lost")
	}
	if must(api.CountLinks(ctx, Object{"ids": []string{id}}))["count"].(interface{ String() string }).String() != "1" {
		t.Fatal("Count failed")
	}
	count := 0
	err = api.IterateLinks(ctx, Object{"search": "sdk-page-"}, func(Object) error { count++; return nil })
	if err != nil || count != 101 {
		t.Fatalf("Paging failed: %v %d", err, count)
	}
	batch := must(api.Bulk(ctx, []Object{{"operation": "update", "id": id, "data": Object{"comment": "Batch"}}, {"operation": "create", "data": Object{"target": "/events"}}}))
	rows := batch["data"].([]any)
	extra := rows[1].(map[string]any)["link"].(map[string]any)["id"].(string)
	must(api.DeleteLink(ctx, extra))
	lead := Object{"clickId": os.Getenv("REDIRECT_TEST_CLICK"), "customerExternalId": "sdk:go/customer & ü", "eventId": "sdk-lead:go"}
	must(api.TrackLead(ctx, lead))
	if must(api.TrackLead(ctx, lead))["duplicate"] != true {
		t.Fatal("Retry dedupe failed")
	}
	lead["eventId"] = "sdk-sale:go"
	lead["amount"] = "49.900001"
	lead["currency"] = "CHF"
	must(api.TrackSale(ctx, lead))
	if must(api.Analytics(ctx, Object{"country": "CH"}))["totals"] == nil {
		t.Fatal("Analytics failed")
	}
	if len(must(api.Events(ctx, nil, Object{"limit": 1}))["data"].([]any)) != 1 {
		t.Fatal("Events failed")
	}

	branding := must(api.GetPasswordBranding(ctx, id))
	if branding["version"] != nil {
		t.Fatal("Unexpected initial branding")
	}
	branding = must(api.UpdatePasswordBranding(ctx, id, Object{"version": nil, "brandName": "Go public brand"}))
	branding = must(api.UploadPasswordLogo(ctx, id, branding["version"], os.Getenv("REDIRECT_TEST_QR_LOGO")))
	if branding["logoAsset"].(map[string]any)["mime"] != "image/png" || branding["brandName"] != "Go public brand" {
		t.Fatal("Password logo/name lost")
	}
	if must(api.UpdatePasswordBranding(ctx, id, Object{"version": branding["version"], "clearLogo": true}))["logoAsset"] != nil {
		t.Fatal("Password logo clear failed")
	}
	must(api.DeleteLink(ctx, id))
	for kind, item := range map[string]Object{"folders": folder, "tags": tag, "templates": template} {
		must(api.DeleteResource(ctx, kind, item["id"].(string)))
	}
	for path, status := range map[string]int{"/redirect-probe": 302, "/limited-probe": 429} {
		_, err := api.Request(ctx, "GET", path, nil, nil)
		var apiError *APIError
		if !errors.As(err, &apiError) || apiError.Status != status {
			t.Fatalf("Expected API status %d: %v", status, err)
		}
		if status == 429 && apiError.RetryAfter != "17" {
			t.Fatal("Retry header lost")
		}
	}
	if _, err := New("token", "http://example.com/api"); err == nil {
		t.Fatal("Insecure base accepted")
	}
	account, err := New(os.Getenv("REDIRECT_TEST_SESSION"), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	account, err = account.WithWorkspace(os.Getenv("REDIRECT_TEST_WORKSPACE"))
	if err != nil {
		t.Fatal(err)
	}
	if len(must(account.ListWorkspaces(ctx, 100))["data"].([]any)) != 0 {
		t.Fatal("workspace paging failed")
	}
	if must(account.GetSession(ctx))["workspace"].(map[string]any)["id"] != os.Getenv("REDIRECT_TEST_WORKSPACE") || must(account.ListWorkspaces(ctx))["currentWorkspaceId"] != os.Getenv("REDIRECT_TEST_WORKSPACE") {
		t.Fatal("Workspace discovery missing")
	}
	other, err := New(os.Getenv("REDIRECT_TEST_OTHER_SESSION"), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	expectStatus := func(err error, status int) {
		t.Helper()
		var apiError *APIError
		if !errors.As(err, &apiError) || apiError.Status != status {
			t.Fatalf("Expected report status %d, got %v", status, err)
		}
	}
	_, err = api.ListReports(ctx, 50, "")
	var integrationBytes [16]byte
	if _, err := rand.Read(integrationBytes[:]); err != nil {
		t.Fatal(err)
	}
	integrationRequest := fmt.Sprintf("%x-%x-%x-%x-%x", integrationBytes[0:4], integrationBytes[4:6], integrationBytes[6:8], integrationBytes[8:10], integrationBytes[10:16])
	integrationInput := Object{"requestId": integrationRequest, "provider": "segment", "name": "Go integration setup", "linkIds": []string{os.Getenv("REDIRECT_TEST_REPORT_LINK")}, "expiresAt": time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)}
	integrationSetup := must(account.CreateIntegrationSetup(ctx, integrationInput))
	integrationID := integrationSetup["installation"].(map[string]any)["id"].(string)
	if integrationSetup["created"] != true || !strings.HasPrefix(integrationSetup["credential"].(string), "qg_redirect_") || must(account.CreateIntegrationSetup(ctx, integrationInput))["credential"] != nil {
		t.Fatal("One-time integration setup/replay failed")
	}
	if must(account.LookupIntegrationSetup(ctx, integrationRequest))["installation"].(map[string]any)["id"] != integrationID || must(account.LookupIntegrationSetup(ctx, "00000000-0000-4000-8000-000000000000"))["installation"] != nil {
		t.Fatal("Integration receipt lookup failed")
	}
	if len(must(account.ListIntegrationSetups(ctx, 50, ""))["data"].([]any)) == 0 || must(account.RevokeIntegrationSetup(ctx, integrationID))["status"] != "revoked" {
		t.Fatal("Integration list/revoke failed")
	}
	_, integrationError := api.ListIntegrationSetups(ctx, 50, "")
	expectStatus(integrationError, 403)
	for _, kind := range []string{"domains", "tokens", "webhooks"} {
		if _, ok := must(account.ListWorkspaceInformation(ctx, kind, 1, ""))["data"].([]any); !ok {
			t.Fatal("Workspace information page missing")
		}
	}
	_, metadataError := api.ListWorkspaceInformation(ctx, "tokens", 50, "")
	expectStatus(metadataError, 403)
	expectStatus(err, 403)
	report := must(account.CreateReport(ctx, Object{"name": "SDK Go report", "filters": Object{"linkIds": []any{os.Getenv("REDIRECT_TEST_REPORT_LINK")}}}))
	second := must(account.CreateReport(ctx, Object{"name": "SDK Go second", "filters": Object{"linkIds": []any{os.Getenv("REDIRECT_TEST_REPORT_LINK")}}}))
	rid := report["id"].(string)
	if must(account.GetReport(ctx, rid))["name"] != report["name"] {
		t.Fatal("Report get mismatch")
	}
	page := must(account.ListReports(ctx, 1, ""))
	if len(page["data"].([]any)) != 1 || page["nextCursor"] == nil {
		t.Fatal("Report cursor missing")
	}
	if len(must(account.ListReports(ctx, 1, page["nextCursor"].(string)))["data"].([]any)) != 1 {
		t.Fatal("Second report page missing")
	}
	_, err = other.GetReport(ctx, rid)
	expectStatus(err, 404)
	if must(other.ListReports(ctx, 50, ""))["count"].(interface{ String() string }).String() != "0" {
		t.Fatal("Other account sees reports")
	}
	report = must(account.UpdateReport(ctx, rid, Object{"version": report["version"], "visibility": "team"}))
	teamPage := must(other.ListReportsInView(ctx, 50, "", "team"))
	if teamPage["data"].([]any)[0].(map[string]any)["canEdit"] != false {
		t.Fatal("Team reader can edit report")
	}
	_, err = other.UpdateReport(ctx, rid, Object{"version": report["version"], "name": "Denied team edit"})
	expectStatus(err, 404)
	report = must(account.UpdateReport(ctx, rid, Object{"version": report["version"], "visibility": "private"}))
	if must(other.ListReportsInView(ctx, 50, "", "team"))["count"].(interface{ String() string }).String() != "0" {
		t.Fatal("Private report remains discoverable")
	}
	oldVersion := report["version"]
	report = must(account.UpdateReport(ctx, rid, Object{"version": oldVersion, "name": "Reviewed Go report"}))
	_, err = account.UpdateReport(ctx, rid, Object{"version": oldVersion, "name": "Stale"})
	expectStatus(err, 409)
	aggregate := must(account.RunReport(ctx, rid))
	if aggregate["totals"].(map[string]any)["clicks"].(interface{ String() string }).String() != "1" {
		t.Fatal("Report clicks changed")
	}
	if _, ok := aggregate["revenue"].([]any)[0].(map[string]any)["amount"].(string); !ok {
		t.Fatal("Report revenue lost precision")
	}
	share := must(account.CreateReportShare(ctx, rid, Object{"title": "Go shared", "reportVersion": report["version"], "expiresAt": nil}))
	if must(account.ListReportShares(ctx, rid))["data"].([]any)[0].(map[string]any)["id"] != share["id"] {
		t.Fatal("Report share not listed")
	}
	reader, err := New("qg_report_"+share["id"].(string), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	if must(reader.ReadPublicReport(ctx, nil))["report"].(map[string]any)["totals"].(map[string]any)["clicks"].(interface{ String() string }).String() != "1" {
		t.Fatal("Public report clicks changed")
	}
	if must(reader.ReadPublicReport(ctx, Object{"dates": Object{"start": "2020-01-01T00:00:00Z", "end": "2020-01-02T00:00:00Z"}}))["report"].(map[string]any)["totals"].(map[string]any)["clicks"].(interface{ String() string }).String() != "0" {
		t.Fatal("Public date filter ignored")
	}
	if must(account.RevokeReportShare(ctx, rid, share["id"].(string)))["revoked"] != true {
		t.Fatal("Share not revoked")
	}
	_, err = reader.ReadPublicReport(ctx, nil)
	expectStatus(err, 404)
	guarded := must(account.CreateReportShare(ctx, rid, Object{"title": "Go protected", "reportVersion": report["version"], "password": "sdk-report-password", "includeConversions": true, "expiresAt": nil}))
	protected, err := New("qg_report_"+guarded["id"].(string), os.Getenv("REDIRECT_TEST_BASE"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = protected.ReadPublicReport(ctx, nil)
	expectStatus(err, 401)
	if _, ok := must(protected.ReadPublicReport(ctx, Object{"password": "sdk-report-password"}))["report"].(map[string]any)["revenue"].([]any)[0].(map[string]any)["amount"].(string); !ok {
		t.Fatal("Public revenue lost precision")
	}
	if must(account.DeleteReport(ctx, rid))["deleted"] != true {
		t.Fatal("Report not deleted")
	}
	_, err = protected.ReadPublicReport(ctx, Object{"password": "sdk-report-password"})
	expectStatus(err, 404)
	must(account.DeleteReport(ctx, second["id"].(string)))

	customerID := lead["customerExternalId"].(string)
	customer := must(api.GetCustomer(ctx, customerID))
	if customer["version"] != nil || customer["canEdit"] != true {
		t.Fatal("Invalid initial profile")
	}
	customer = must(api.UpdateCustomer(ctx, customerID, Object{"version": nil, "name": "SDK Go identity", "email": "go@example.com", "avatarUrl": "https://example.com/avatar.png"}))
	if must(api.GetCustomer(ctx, customerID))["name"] != "SDK Go identity" {
		t.Fatal("Identity not saved")
	}
	_, err = api.UpdateCustomer(ctx, customerID, Object{"version": nil, "name": "Stale identity"})
	expectStatus(err, 409)
	customerPage := must(api.CustomerJourney(ctx, customerID, 1, nil))
	if len(customerPage["data"].([]any)) != 1 || customerPage["nextCursor"] == nil {
		t.Fatal("Missing customer page")
	}
	if len(must(api.CustomerJourney(ctx, customerID, 1, customerPage["nextCursor"].(map[string]any)))["data"].([]any)) != 1 {
		t.Fatal("Second customer page missing")
	}
	identityVersion := customer["version"]
	customer = must(api.ClearCustomer(ctx, customerID, identityVersion))
	if customer["name"] != nil || customer["email"] != nil || customer["avatarUrl"] != nil || customer["version"] == identityVersion {
		t.Fatal("Identity clear failed")
	}
	if len(must(api.CustomerJourney(ctx, customerID, 100, nil))["data"].([]any)) != 3 {
		t.Fatal("Identity clear removed events")
	}

	webhook := must(account.CreateWebhook(ctx, Object{"name": "Go receiver", "url": "https://receiver.example.org/events"}))
	wid := webhook["id"].(string)
	if webhook["secret"] == nil || must(account.GetWebhook(ctx, wid))["secret"] != nil {
		t.Fatal("One-time secret contract failed")
	}
	if len(must(account.ListWebhooks(ctx, 50, "", false))["data"].([]any)) == 0 {
		t.Fatal("Webhook list empty")
	}
	webhook = must(account.UpdateWebhook(ctx, wid, Object{"version": webhook["version"], "name": "Go updated"}))
	webhook = must(account.RotateWebhookSecret(ctx, wid, webhook["version"].(string)))
	if webhook["previousKeyExpiresAt"] == nil {
		t.Fatal("Missing rotation overlap")
	}
	queued := must(account.TestWebhook(ctx, wid, webhook["version"].(string)))
	did := queued["deliveryId"].(string)
	delivery := must(account.GetWebhookDelivery(ctx, wid, did))
	if delivery["body"] == nil {
		t.Fatal("Missing delivery body")
	}
	if len(must(account.ListWebhookDeliveries(ctx, wid, 50, ""))["data"].([]any)) == 0 || len(must(account.ListWebhookAttempts(ctx, wid, did, 50, ""))["data"].([]any)) != 0 {
		t.Fatal("Invalid delivery history")
	}
	webhook = must(account.ArchiveWebhook(ctx, wid, webhook["version"].(string)))
	if webhook["deletedAt"] == nil {
		t.Fatal("Webhook not archived")
	}
	webhook = must(account.UpdateWebhook(ctx, wid, Object{"version": webhook["version"], "restore": true, "enabled": true}))
	delivery = must(account.GetWebhookDelivery(ctx, wid, did))
	if must(account.ReplayWebhookDelivery(ctx, wid, did, delivery["version"].(string)))["state"] != "queued" {
		t.Fatal("Webhook replay failed")
	}
	must(account.ArchiveWebhook(ctx, wid, webhook["version"].(string)))
}

func TestWebhookVerification(t *testing.T) {
	raw, err := os.ReadFile("../tests/webhook-fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture map[string]string
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	key := []string{fixture["secret"]}
	body := []byte(fixture["body"])
	id, at, sig := fixture["id"], fixture["timestamp"], fixture["signature"]
	if !VerifyWebhook(key, body, id, at, sig, time.Unix(1700000000, 0)) {
		t.Fatal("Valid signature rejected")
	}
	if VerifyWebhook(key, append(body, ' '), id, at, sig, time.Unix(1700000000, 0)) {
		t.Fatal("Tampered body accepted")
	}
	if VerifyWebhook(key, body, id, at, sig, time.Unix(1700000301, 0)) {
		t.Fatal("Expired timestamp accepted")
	}
	if !VerifyWebhook(key, body, id, at, "v1,"+strings.Repeat("A", 43)+"= "+sig, time.Unix(1700000000, 0)) {
		t.Fatal("Rotation signatures rejected")
	}
}
