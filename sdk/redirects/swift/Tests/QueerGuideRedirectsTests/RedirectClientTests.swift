import Foundation

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    static let lock = NSLock()
    static var totalRequests = 0
    static var handler: ((URLRequest, URLProtocolClient, StubProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        Self.totalRequests += 1
        let callback = Self.handler
        Self.lock.unlock()
        guard let client else { return }
        callback?(request, client, self)
    }
    override func stopLoading() {}
    static func requestCount() -> Int { lock.lock(); defer { lock.unlock() }; return totalRequests }
    static func respond(_ callback: @escaping (URLRequest, URLProtocolClient, StubProtocol) -> Void) {
        lock.lock()
        handler = callback
        lock.unlock()
    }
}

final class RedirectClientTests {
    let backendWire: [String: Any]
    let handoffWire: [String: Any]
    init(backendWire: [String: Any], handoffWire: [String: Any]) {
        self.backendWire = backendWire
        self.handoffWire = handoffWire
    }
    let source = URL(string: "https://queer.guide/go/example-link")!
    let id = "10000000-0000-4000-8000-000000000001"
    func client() throws -> RedirectClient {
        try RedirectClient(shortHosts: ["queer.guide", "www.queer.guide"], contentHosts: ["queer.guide"]) {
            let config = URLSessionConfiguration.ephemeral
            config.protocolClasses = [StubProtocol.self]
            return config
        }
    }
    func payload(_ changes: [String: Any] = [:]) -> [String: Any] {
        backendWire.merging(changes) { _, new in new }
    }
    func stub(_ object: [String: Any], status: Int = 200, headers: [String: String] = [:],
              check: ((URLRequest) -> Void)? = nil) throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        StubProtocol.respond { request, client, proto in
            check?(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": RedirectClient.mediaType].merging(headers) { _, new in new })!
            client.urlProtocol(proto, didReceive: response, cacheStoragePolicy: .notAllowed)
            client.urlProtocol(proto, didLoad: data)
            client.urlProtocolDidFinishLoading(proto)
        }
    }
    func assertInvalid(_ changes: [String: Any], status: Int = 200,
                       file: StaticString = #file, line: UInt = #line) throws {
        let sdk = try client()
        let body = try JSONSerialization.data(withJSONObject: payload(changes))
        expectThrows(try sdk.decode(body, status: status, retry: nil, source: source, consent: false), file: file, line: line) {
            expectEqual($0 as? RedirectError, .invalidResponse, file: file, line: line)
        }
    }
    func testRealTransportSendsExplicitDeniedConsentWithoutCredentialsOrCookies() async throws {
        try stub(payload()) { request in
            expectEqual(request.httpMethod, "GET")
            expectEqual(request.value(forHTTPHeaderField: "Accept"), RedirectClient.mediaType)
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Attribution-Consent"), "denied")
            expectNil(request.value(forHTTPHeaderField: "Authorization"))
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            expectNil(request.url?.fragment)
            expectEqual(request.timeoutInterval, 10)
        }
        let result = try await client().resolve(URL(string: source.absoluteString + "#private-fragment")!)
        expectEqual(result.navigation, .app(result.destination))
        expectNil(result.clickID)
        _ = try await client().resolve(URL(string: "https://QUEER.GUIDE/go/example-link")!)
    }
    func testBareBrandedHostMatchesCanonicalRootSlash() async throws {
        try stub(payload(["canonicalUrl": "https://links.example.org/"]))
        let sdk = try RedirectClient(shortHosts: ["links.example.org"], contentHosts: ["queer.guide"]) {
            let config = URLSessionConfiguration.ephemeral
            config.protocolClasses = [StubProtocol.self]
            return config
        }
        let result = try await sdk.resolve(URL(string: "https://links.example.org")!)
        expectEqual(result.canonicalURL.absoluteString, "https://links.example.org/")
    }
    func testPasswordUsesFormPostWithLiteralPlusAndNoQuerySecret() async throws {
        try stub(payload(["statusCode": 303])) { request in
            expectEqual(request.httpMethod, "POST")
            expectNil(request.url?.query)
            expectEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/x-www-form-urlencoded")
            // URLSession can turn an httpBody into a stream before URLProtocol.
            let data: Data
            if let body = request.httpBody { data = body }
            else {
                let stream = request.httpBodyStream!
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                let count = stream.read(&bytes, maxLength: bytes.count)
                data = Data(bytes.prefix(max(count, 0)))
            }
            let form = String(decoding: data, as: UTF8.self)
            expectTrue(form.contains("%2B"))
            let decoded = URLComponents(string: "https://queer.guide/?" + form)!.queryItems!.first!.value!
            expectEqual(decoded, "a+b &🦄")
        }
        let result = try await client().resolve(source, password: "a+b &🦄")
        expectEqual(result.statusCode, 303)
    }
    func testConsentedClickIDMatchesDestinationAndDeniedConsentStripsIt() async throws {
        try stub(payload(["destination": "https://queer.guide/venues/example?qg_click_id=" + id + "&x=1#details", "clickId": id]))
        let allowed = try await client().resolve(source, attributionConsent: true)
        expectEqual(allowed.clickID, UUID(uuidString: id))
        let denied = try await client().resolve(source)
        expectNil(denied.clickID)
        expectEqual(denied.destination.absoluteString, "https://queer.guide/venues/example?x=1#details")
    }
    func testWebModeExternalHTTPAndNonstandardPortsUseBrowser() async throws {
        for change in [["mode": "web"], ["destination": "https://example.org/public"],
                       ["destination": "http://queer.guide/public"], ["destination": "https://queer.guide:8443/public"]] {
            try stub(payload(change))
            let result = try await client().resolve(source)
            expectEqual(result.navigation, .browser(result.destination))
        }
    }
    func testChallengesAndBoundedRetryMetadataWithoutUpstreamBody() async throws {
        for status in [400, 401, 404, 405, 410, 429, 502, 503, 508] {
            let reasons = [400: "invalid_request", 401: "password_required", 404: "not_found", 405: "method_not_allowed",
                410: "unavailable", 429: "rate_limited", 502: "upstream_unavailable", 503: "temporarily_unavailable", 508: "loop"]
            try stub(["protocol": 1, "error": reasons[status]!], status: status, headers: ["Retry-After": "900"])
            do { _ = try await client().resolve(source); fail("Expected error") }
            catch let error as RedirectError {
                expectEqual(error, .unavailable(status: status, reason: reasons[status]!, retryAfter: status == 429 ? 900 : nil))
            }
        }
        for retry in ["901", "-1", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT"] {
            try stub(["protocol": 1, "error": "rate_limited"], status: 429, headers: ["Retry-After": retry])
            do { _ = try await client().resolve(source); fail("Expected rate limit") }
            catch { expectEqual(error as? RedirectError, .unavailable(status: 429, reason: "rate_limited", retryAfter: nil)) }
        }
    }
    func testStrictShapeSourceAndAttributionValidation() throws {
        for change in [["protocol": true], ["protocol": 2], ["statusCode": true], ["statusCode": 302.5],
                       ["extra": "private"], ["mode": "unknown"], ["clickId": id],
                       ["clickId": "not-a-uuid"], ["destination": "https://queer.guide/?qg_click_id=" + id],
                       ["canonicalUrl": "https://example.org/go/example-link"],
                       ["canonicalUrl": source.absoluteString + "?private=1"],
                       ["canonicalUrl": "https://queer.guide/go/other-link"]] as [[String: Any]] {
            try assertInvalid(change)
        }
        let sdk = try client()
        let body = try JSONSerialization.data(withJSONObject: payload(["canonicalUrl": "https://www.queer.guide/go/EXAMPLE-LINK"]))
        expectNoThrow(try sdk.decode(body, status: 200, retry: nil, source: source, consent: false))
    }
    func testUnsafeDestinationsAndSourceHostsAreRejected() async throws {
        for target in ["http://127.0.0.1/", "http://0177.0.0.1/", "http://0x7f.0.0.1/", "http://2130706433/",
                       "http://10.0.0.1/", "http://169.254.1.1/", "http://172.16.0.1/", "http://192.168.1.1/",
                       "http://100.64.0.1/", "https://[::1]/", "http://host.local/", "https://user:pass@example.org/",
                       "https://queer.guide:65536/content", "javascript:alert(1)", "file:///private/file"] {
            try assertInvalid(["destination": target])
        }
        for link in ["http://queer.guide/go/example-link", "https://example.org/go/example-link",
                     source.absoluteString + "?password=secret", source.absoluteString + "?%70w=secret"] {
            do { _ = try await client().resolve(URL(string: link)!); fail("Expected invalid link") }
            catch { expectEqual(error as? RedirectError, .invalidLink) }
        }
        expectThrows(try RedirectClient(shortHosts: ["queer.guide/path"], contentHosts: []))
        expectThrows(try RedirectClient(shortHosts: [], contentHosts: []))
        do { _ = try await client().resolve(source, password: String(repeating: "🦄", count: 129)); fail("Expected invalid password") }
        catch { expectEqual(error as? RedirectError, .invalidPassword) }
    }
    func testWrongMimeRedirectAndOversizedStreamFailClosed() async throws {
        for (status, mime, data, expected) in [
            (200, "text/html", Data("secret html".utf8), RedirectError.invalidResponse),
            (302, RedirectClient.mediaType, Data("{}".utf8), .invalidResponse),
            (200, RedirectClient.mediaType, Data(repeating: 32, count: 65537), .responseTooLarge)
        ] {
            StubProtocol.respond { request, client, proto in
                let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                    headerFields: ["Content-Type": mime, "Location": "https://example.org/never-follow"])!
                client.urlProtocol(proto, didReceive: response, cacheStoragePolicy: .notAllowed)
                client.urlProtocol(proto, didLoad: data)
                client.urlProtocolDidFinishLoading(proto)
            }
            do { _ = try await client().resolve(source); fail("Expected rejection") }
            catch { expectEqual(error as? RedirectError, expected) }
        }
    }
    func testHandoffCreateResumeAndExplicitConsent() async throws {
        let app = UUID(uuidString: handoffWire["app"] as! String)!
        let body = handoffWire["body"] as! [String: Any]
        let headers = (handoffWire["headers"] as! [String: String]).filter { $0.key.hasPrefix("x-qg-handoff-") }
        let sdk = try client()
        let beforeDenied = StubProtocol.requestCount()
        do { _ = try await sdk.createHandoff(source, appBindingID: app); fail("Expected consent requirement") }
        catch { expectEqual(error as? RedirectError, .consentRequired) }
        expectEqual(StubProtocol.requestCount(), beforeDenied)
        try stub(body, headers: headers) { request in
            expectEqual(request.httpMethod, "POST")
            expectEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems, [URLQueryItem(name: "qg_handoff", value: "install")])
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Handoff-Action"), "create")
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Handoff-App"), app.uuidString.lowercased())
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Attribution-Consent"), "granted")
            expectNil(request.value(forHTTPHeaderField: "X-QG-Handoff-Token"))
        }
        let created = try await sdk.createHandoff(source, appBindingID: app, attributionConsent: true)
        expectEqual(created.receipt.canonicalURL, source)
        expectEqual(created.receipt.token, headers["x-qg-handoff-token"]!)
        expectTrue(!String(describing: created.receipt).contains(created.receipt.token))
        expectTrue(!String(reflecting: created).contains(created.receipt.token))
        do { _ = try await sdk.resumeHandoff(created.receipt); fail("Expected consent requirement") }
        catch { expectEqual(error as? RedirectError, .consentRequired) }
        try stub(body, headers: ["x-qg-handoff-state": "consumed"]) { request in
            expectEqual(request.httpMethod, "POST")
            expectEqual(request.url?.query, "qg_handoff=resume")
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Handoff-Action"), "resume")
            expectEqual(request.value(forHTTPHeaderField: "X-QG-Handoff-Token"), created.receipt.token)
            expectTrue(!request.url!.absoluteString.contains(created.receipt.token))
        }
        let resumed = try await sdk.resumeHandoff(created.receipt, attributionConsent: true)
        expectEqual(resumed.clickID, created.resolution.clickID)
        expectEqual(resumed.destination, created.resolution.destination)
    }
    func testHandoffMetadataAndPreflightFailClosed() async throws {
        let app = UUID(uuidString: handoffWire["app"] as! String)!
        let body = handoffWire["body"] as! [String: Any]
        let original = (handoffWire["headers"] as! [String: String]).filter { $0.key.hasPrefix("x-qg-handoff-") }
        let sdk = try client()
        for change in [[String: String](), ["x-qg-handoff-state": "consumed"],
                       ["x-qg-handoff-token": "invalid"], ["x-qg-handoff-expires": "2020-01-01T00:00:00.000Z"],
                       ["x-qg-handoff-expires": "2099-01-01T00:00:00.000Z"]] {
            let headers = change.isEmpty ? [:] : original.merging(change) { _, new in new }
            try stub(body, headers: headers)
            let before = StubProtocol.requestCount()
            do { _ = try await sdk.createHandoff(source, appBindingID: app, attributionConsent: true); fail("Expected invalid metadata") }
            catch { expectEqual(error as? RedirectError, .invalidResponse) }
            expectEqual(StubProtocol.requestCount(), before + 1)
        }
        let receipt = try RedirectHandoffReceipt(canonicalURL: source, appBindingID: app,
            token: original["x-qg-handoff-token"]!, expiresAt: Date().addingTimeInterval(3600))
        for headers in [[String: String](), ["x-qg-handoff-state": "consumed", "x-qg-handoff-token": receipt.token]] {
            try stub(body, headers: headers)
            do { _ = try await sdk.resumeHandoff(receipt, attributionConsent: true); fail("Expected invalid consumption metadata") }
            catch { expectEqual(error as? RedirectError, .invalidResponse) }
        }
        for suffix in ["?qg_handoff=resume", "?qg_handoff_token=secret", "?x-qg-handoff-token=secret"] {
            do { _ = try await sdk.resolve(URL(string: source.absoluteString + suffix)!); fail("Expected invalid source") }
            catch { expectEqual(error as? RedirectError, .invalidLink) }
        }
        let untrusted = try RedirectHandoffReceipt(canonicalURL: URL(string: "https://example.org/")!, appBindingID: app, token: receipt.token, expiresAt: Date().addingTimeInterval(60))
        let beforeUntrusted = StubProtocol.requestCount()
        do { _ = try await sdk.resumeHandoff(untrusted, attributionConsent: true); fail("Expected invalid source") }
        catch { expectEqual(error as? RedirectError, .invalidLink) }
        expectEqual(StubProtocol.requestCount(), beforeUntrusted)
        expectThrows(try RedirectHandoffReceipt(canonicalURL: source, appBindingID: app, token: receipt.token, expiresAt: Date().addingTimeInterval(-1)))
        expectThrows(try RedirectHandoffReceipt(canonicalURL: URL(string: source.absoluteString + "?campaign=leak")!, appBindingID: app, token: receipt.token, expiresAt: Date().addingTimeInterval(60)))
    }
    func testAppGroupStoreLifecycle() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let app = UUID(uuidString: id)!
        let headers = handoffWire["headers"] as! [String: String]
        let receipt = try RedirectHandoffReceipt(canonicalURL: source, appBindingID: app,
            token: headers["x-qg-handoff-token"]!, expiresAt: Date().addingTimeInterval(3600))
        let store = try RedirectAppGroupHandoffStore(container: root, appBindingID: app, shortHosts: ["queer.guide"])
        expectThrows(try store.store(receipt)) { expectEqual($0 as? RedirectError, .consentRequired) }
        expectTrue(!FileManager.default.fileExists(atPath: root.path))
        expectThrows(try RedirectAppGroupHandoffStore(appGroupID: "bad", appBindingID: app, shortHosts: ["queer.guide"], attributionConsent: true))
        #if !os(iOS)
        expectThrows(try RedirectAppGroupHandoffStore(appGroupID: "group.org.example.fixture", appBindingID: app,
            shortHosts: ["queer.guide"], attributionConsent: true)) { expectEqual($0 as? RedirectHandoffStoreError, .unavailable) }
        #endif
        try store.store(receipt, attributionConsent: true)
        try store.store(receipt, attributionConsent: true)
        let location = root.appendingPathComponent("QueerGuideRedirectHandoffs/" + id + "/receipt.json")
        expectEqual(try location.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
        expectEqual((attributes[.posixPermissions] as! NSNumber).intValue, 0o600)
        let before = StubProtocol.requestCount()
        // Missing consumed metadata is an uncertain outcome, and remains attempted.
        try stub(handoffWire["body"] as! [String: Any])
        do { _ = try await store.resumeAutomatically(using: client(), attributionConsent: true); fail("Expected metadata error") }
        catch { expectEqual(error as? RedirectError, .invalidResponse) }
        let reopened = try RedirectAppGroupHandoffStore(container: root, appBindingID: app, shortHosts: ["queer.guide"])
        do { _ = try await reopened.resumeAutomatically(using: client(), attributionConsent: true); fail("Expected attempted state") }
        catch { expectEqual(error as? RedirectHandoffStoreError, .alreadyAttempted) }
        expectThrows(try reopened.store(receipt, attributionConsent: true))
        expectEqual(StubProtocol.requestCount(), before + 1)
        try stub(handoffWire["body"] as! [String: Any], headers: ["X-QG-Handoff-State": "consumed"])
        let result = try await reopened.retryAfterUserAction(using: client(), attributionConsent: true)
        expectEqual(result?.clickID, UUID(uuidString: (handoffWire["body"] as! [String: Any])["clickId"] as! String))
        expectNil(try await reopened.resumeAutomatically(using: client(), attributionConsent: true))
        let consumed = String(decoding: try Data(contentsOf: location), as: UTF8.self)
        expectTrue(!consumed.contains(receipt.token) && !consumed.contains(source.absoluteString))
        expectThrows(try reopened.store(receipt, attributionConsent: true))
        do { _ = try await reopened.resumeAutomatically(using: client()); fail("Expected consent withdrawal") }
        catch { expectEqual(error as? RedirectError, .consentRequired) }
        expectTrue(!FileManager.default.fileExists(atPath: location.path))
        try reopened.store(receipt, attributionConsent: true)
        var expired = try JSONSerialization.jsonObject(with: Data(contentsOf: location)) as! [String: Any]
        expired["expires"] = Date().addingTimeInterval(-1).timeIntervalSince1970
        try JSONSerialization.data(withJSONObject: expired).write(to: location)
        let expiryCount = StubProtocol.requestCount()
        expectNil(try await reopened.resumeAutomatically(using: client(), attributionConsent: true))
        expectEqual(StubProtocol.requestCount(), expiryCount)
        expectTrue(!FileManager.default.fileExists(atPath: location.path))
        let wrong = try RedirectHandoffReceipt(canonicalURL: source, appBindingID: UUID(), token: receipt.token,
            expiresAt: Date().addingTimeInterval(3600))
        expectThrows(try reopened.store(wrong, attributionConsent: true))
        let other = try RedirectAppGroupHandoffStore(container: root, appBindingID: app, shortHosts: ["links.example.org"])
        expectThrows(try other.store(receipt, attributionConsent: true))
        try reopened.store(receipt, attributionConsent: true)
        try Data("{}".utf8).write(to: location)
        do { _ = try await reopened.resumeAutomatically(using: client(), attributionConsent: true); fail("Expected corrupt state") }
        catch { expectEqual(error as? RedirectHandoffStoreError, .invalidState) }
        expectEqual(StubProtocol.requestCount(), expiryCount)
        try reopened.clear()
        try reopened.store(receipt, attributionConsent: true)
        let responseBody = try JSONSerialization.data(withJSONObject: handoffWire["body"] as! [String: Any])
        StubProtocol.respond { request, client, proto in
            do { try reopened.clear() } catch { fail("Withdrawal failed") }
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": RedirectClient.mediaType, "X-QG-Handoff-State": "consumed"])!
            client.urlProtocol(proto, didReceive: response, cacheStoragePolicy: .notAllowed)
            client.urlProtocol(proto, didLoad: responseBody)
            client.urlProtocolDidFinishLoading(proto)
        }
        do { _ = try await reopened.resumeAutomatically(using: client(), attributionConsent: true); fail("Navigation survived withdrawal") }
        catch { expectEqual(error as? RedirectError, .consentRequired) }
        expectTrue(!FileManager.default.fileExists(atPath: location.path))
    }

    func testAppGroupCrossProcessClaim(wirePath: String) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = try RedirectHandoffReceipt(canonicalURL: source, appBindingID: UUID(uuidString: id)!,
            token: (handoffWire["headers"] as! [String: String])["x-qg-handoff-token"]!, expiresAt: Date().addingTimeInterval(3600))
        let store = try RedirectAppGroupHandoffStore(container: root, appBindingID: receipt.appBindingID, shortHosts: ["queer.guide"])
        try store.store(receipt, attributionConsent: true)
        var processes: [Process] = []
        for _ in 0..<2 {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
            process.arguments = ["--store-attempt", root.path, wirePath]
            try process.run()
            processes.append(process)
        }
        for process in processes { process.waitUntilExit(); expectEqual(process.terminationStatus, 0) }
        let evidence = try String(contentsOf: root.appendingPathComponent("requests.txt"), encoding: .utf8)
        expectEqual(evidence, "one request")
        // A third fresh process must not automatically retry either.
        let process = Process()
        process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        process.arguments = ["--store-attempt", root.path, wirePath]
        try process.run(); process.waitUntilExit(); expectEqual(process.terminationStatus, 0)
        expectEqual(try String(contentsOf: root.appendingPathComponent("requests.txt"), encoding: .utf8), evidence)
    }
    func testCancellationStopsHangingTransport() async throws {
        let (started, signal) = AsyncStream<Void>.makeStream()
        StubProtocol.respond { _, _, _ in signal.yield(); signal.finish() }
        let sdk = try client(), link = source
        let task = Task { try await sdk.resolve(link) }
        for await _ in started { break }
        task.cancel()
        do { _ = try await task.value; fail("Expected cancellation") }
        catch { expectTrue(error is CancellationError || (error as NSError).code == NSURLErrorCancelled) }
    }
}

// Standard-library contract runner, also works with Command Line Tools where
// XCTest/Swift Testing are absent. Compiles the real library source unchanged.
private func expectEqual<T: Equatable>(_ actual: T, _ expected: T,
    file: StaticString = #file, line: UInt = #line) {
    guard actual == expected else { fatalError("Expected \(expected), got \(actual)", file: file, line: line) }
}
private func expectTrue(_ value: Bool, file: StaticString = #file, line: UInt = #line) {
    guard value else { fatalError("Assertion failed", file: file, line: line) }
}
private func expectNil<T>(_ value: T?, file: StaticString = #file, line: UInt = #line) {
    guard value == nil else { fatalError("Expected nil", file: file, line: line) }
}
private func fail(_ message: String, file: StaticString = #file, line: UInt = #line) {
    fatalError(message, file: file, line: line)
}
private func expectThrows<T>(_ expression: @autoclosure () throws -> T,
    file: StaticString = #file, line: UInt = #line, verify: ((Error) -> Void)? = nil) {
    do { _ = try expression(); fail("Expected error", file: file, line: line) }
    catch { verify?(error) }
}
private func expectNoThrow<T>(_ expression: @autoclosure () throws -> T) {
    do { _ = try expression() } catch { fail("Unexpected error: \(error)") }
}

@main private struct ContractRunner {
    static func main() async throws {
        if CommandLine.arguments.count == 4 && CommandLine.arguments[1] == "--store-attempt" {
            let root = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
            let wire = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[3]))) as! [String: Any]
            let tests = RedirectClientTests(backendWire: wire["body"] as! [String: Any], handoffWire: wire)
            let data = try JSONSerialization.data(withJSONObject: wire["body"] as! [String: Any])
            StubProtocol.respond { request, client, proto in
                do { try Data("one request".utf8).write(to: root.appendingPathComponent("requests.txt"), options: .withoutOverwriting) }
                catch { fatalError("A second process reached transport") }
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                    headerFields: ["Content-Type": RedirectClient.mediaType])!
                client.urlProtocol(proto, didReceive: response, cacheStoragePolicy: .notAllowed)
                client.urlProtocol(proto, didLoad: data)
                client.urlProtocolDidFinishLoading(proto)
            }
            let store = try RedirectAppGroupHandoffStore(container: root, appBindingID: UUID(uuidString: tests.id)!, shortHosts: ["queer.guide"])
            do { _ = try await store.resumeAutomatically(using: tests.client(), attributionConsent: true); fail("Expected uncertain outcome") }
            catch RedirectHandoffStoreError.alreadyAttempted { }
            catch RedirectError.invalidResponse { }
            return
        }
        guard CommandLine.arguments.count == 3,
              let backendWire = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as? [String: Any],
              let handoffWire = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))) as? [String: Any]
        else { fatalError("Backend wire fixtures required") }
        let tests = RedirectClientTests(backendWire: backendWire, handoffWire: handoffWire)
        try await tests.testRealTransportSendsExplicitDeniedConsentWithoutCredentialsOrCookies()
        try await tests.testBareBrandedHostMatchesCanonicalRootSlash()
        try await tests.testPasswordUsesFormPostWithLiteralPlusAndNoQuerySecret()
        try await tests.testConsentedClickIDMatchesDestinationAndDeniedConsentStripsIt()
        try await tests.testWebModeExternalHTTPAndNonstandardPortsUseBrowser()
        try await tests.testChallengesAndBoundedRetryMetadataWithoutUpstreamBody()
        try tests.testStrictShapeSourceAndAttributionValidation()
        try await tests.testUnsafeDestinationsAndSourceHostsAreRejected()
        try await tests.testWrongMimeRedirectAndOversizedStreamFailClosed()
        try await tests.testHandoffCreateResumeAndExplicitConsent()
        try await tests.testHandoffMetadataAndPreflightFailClosed()
        try await tests.testAppGroupStoreLifecycle()
        try tests.testAppGroupCrossProcessClaim(wirePath: CommandLine.arguments[2])
        try await tests.testCancellationStopsHangingTransport()
        print("Swift native redirects: fourteen contract groups pass against real URLSession, isolated URLProtocol fixtures and temporary cross-process receipt storage; no production requests or signed OS transition proof.")
    }
}
