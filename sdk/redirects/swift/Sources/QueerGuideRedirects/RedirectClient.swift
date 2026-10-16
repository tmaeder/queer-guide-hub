import Foundation
import CoreFoundation

public enum RedirectError: Error, Equatable, Sendable {
    case invalidConfiguration
    case invalidLink
    case invalidPassword
    case invalidResponse
    case responseTooLarge
    /// No upstream body, HTML, URL, password or private policy is retained.
    case unavailable(status: Int, reason: String, retryAfter: Int?)
}

public enum RedirectNavigation: Equatable, Sendable {
    /// Map this URL to an authenticated route in your app; never load arbitrary code.
    case app(URL)
    /// Open this destination in the system browser, rather than the short URL again.
    case browser(URL)
}

public struct RedirectResolution: Equatable, Sendable {
    public let canonicalURL: URL
    public let destination: URL
    public let statusCode: Int
    public let clickID: UUID?
    public let navigation: RedirectNavigation
}

/// Credential-free, stateless client for canonical short URLs. Each call is a
/// new visit. The SDK does not retry; a user must initiate any new attempt.
public struct RedirectClient: Sendable {
    public static let mediaType = "application/vnd.queer-guide.redirect+json"
    private let shortHosts: Set<String>
    private let contentHosts: Set<String>
    private let configuration: @Sendable () -> URLSessionConfiguration

    public init(shortHosts: Set<String>, contentHosts: Set<String>) throws {
        try self.init(shortHosts: shortHosts, contentHosts: contentHosts,
                      configuration: { .ephemeral })
    }

    // Internal seam exercises the real URLSession transport without network access.
    init(shortHosts: Set<String>, contentHosts: Set<String>,
         configuration: @escaping @Sendable () -> URLSessionConfiguration) throws {
        let short = Set(shortHosts.map { $0.lowercased() })
        let content = Set(contentHosts.map { $0.lowercased() })
        guard !short.isEmpty, short.union(content).allSatisfy({ host in
            guard let url = Self.publicURL("https://" + host, maximum: 4096, https: true) else { return false }
            return url.host == host && url.path.isEmpty && url.query == nil && url.fragment == nil
        }) else { throw RedirectError.invalidConfiguration }
        self.shortHosts = short
        self.contentHosts = content
        self.configuration = configuration
    }

    public func resolve(_ link: URL, password: String? = nil,
                        attributionConsent: Bool = false) async throws -> RedirectResolution {
        guard let source = Self.publicURL(link.absoluteString, maximum: 4096, https: true),
              let host = source.host?.lowercased(), shortHosts.contains(host),
              let sourceParts = URLComponents(url: source, resolvingAgainstBaseURL: false),
              !(sourceParts.queryItems ?? []).contains(where: { ["pw", "password"].contains($0.name) })
        else { throw RedirectError.invalidLink }
        var parts = sourceParts
        parts.fragment = nil
        guard let requestURL = parts.url else { throw RedirectError.invalidLink }
        var request = URLRequest(url: requestURL, cachePolicy: .reloadIgnoringLocalCacheData,
                                 timeoutInterval: 10)
        request.setValue(Self.mediaType, forHTTPHeaderField: "Accept")
        request.setValue(attributionConsent ? "granted" : "denied",
                         forHTTPHeaderField: "X-QG-Attribution-Consent")
        // Also enables iOS targeting in macOS transport fixtures. The host app may
        // not override device/country with an arbitrary trusted server header.
        request.setValue("QueerGuideRedirects/1 (iPhone; iOS)", forHTTPHeaderField: "User-Agent")
        if let password {
            guard !password.isEmpty, password.utf16.count <= 256 else { throw RedirectError.invalidPassword }
            var form = URLComponents()
            form.queryItems = [URLQueryItem(name: "password", value: password)]
            // URLComponents is query syntax: '+' must be escaped for form syntax.
            request.httpBody = form.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        }
        let config = configuration()
        config.urlCache = nil
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 10
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        return try await withTaskCancellationHandler {
            let (bytes, response) = try await session.bytes(for: request, delegate: RefuseRedirects())
            guard let http = response as? HTTPURLResponse,
                  http.url == requestURL,
                  http.value(forHTTPHeaderField: "Content-Type")?.lowercased().split(separator: ";").first?.trimmingCharacters(in: .whitespaces) == Self.mediaType
            else { throw RedirectError.invalidResponse }
            guard response.expectedContentLength <= 65536 else { throw RedirectError.responseTooLarge }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 65536 else { throw RedirectError.responseTooLarge }
                data.append(byte)
            }
            return try decode(data, status: http.statusCode,
                              retry: http.value(forHTTPHeaderField: "Retry-After"),
                              source: source, consent: attributionConsent)
        } onCancel: {
            session.invalidateAndCancel()
        }
    }

    private static let problems = [400: "invalid_request", 401: "password_required", 404: "not_found",
        405: "method_not_allowed", 410: "unavailable", 429: "rate_limited",
        502: "upstream_unavailable", 503: "temporarily_unavailable", 508: "loop"]

    func decode(_ data: Data, status: Int, retry: String?, source: URL,
                consent: Bool) throws -> RedirectResolution {
        guard data.count <= 65536,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let protocolValue = object["protocol"] as? NSNumber,
              CFGetTypeID(protocolValue) != CFBooleanGetTypeID(), protocolValue == 1
        else { throw RedirectError.invalidResponse }
        if status != 200 {
            guard Set(object.keys) == ["protocol", "error"],
                  let expected = Self.problems[status], object["error"] as? String == expected
            else { throw RedirectError.invalidResponse }
            let retryAfter: Int? = status == 429 ? retry.flatMap { value in
                guard value.range(of: "^[0-9]{1,3}$", options: .regularExpression) != nil,
                      let seconds = Int(value), (1...900).contains(seconds) else { return nil }
                return seconds
            } : nil
            throw RedirectError.unavailable(status: status, reason: expected, retryAfter: retryAfter)
        }
        guard Set(object.keys) == ["protocol", "canonicalUrl", "destination", "statusCode", "mode", "clickId"],
              let rawCanonical = object["canonicalUrl"] as? String,
              let canonical = Self.publicURL(rawCanonical, maximum: 4096, https: true),
              canonical.query == nil, canonical.fragment == nil,
              let rawDestination = object["destination"] as? String,
              var target = Self.publicURL(rawDestination, maximum: 60000),
              let code = object["statusCode"] as? NSNumber,
              CFGetTypeID(code) != CFBooleanGetTypeID(),
              [301, 302, 303, 307, 308].contains(code.intValue), code.doubleValue == Double(code.intValue),
              let mode = object["mode"] as? String, ["navigate", "web"].contains(mode)
        else { throw RedirectError.invalidResponse }
        let builtin: Set<String> = ["queer.guide", "www.queer.guide"]
        guard canonical.host?.lowercased() == source.host?.lowercased() || (builtin.contains(canonical.host?.lowercased() ?? "") && builtin.contains(source.host?.lowercased() ?? "")),
              Self.decodedPath(canonical).lowercased() == Self.decodedPath(source).lowercased(),
              var destinationParts = URLComponents(url: target, resolvingAgainstBaseURL: false)
        else { throw RedirectError.invalidResponse }
        let ids = (destinationParts.queryItems ?? []).filter { $0.name == "qg_click_id" }
        var clickID: UUID?
        if object["clickId"] is NSNull {
            guard ids.isEmpty else { throw RedirectError.invalidResponse }
        } else {
            guard let rawID = object["clickId"] as? String,
                  rawID.range(of: "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$", options: .regularExpression) != nil,
                  let parsed = UUID(uuidString: rawID), ids.count == 1, ids[0].value == rawID
            else { throw RedirectError.invalidResponse }
            clickID = consent ? parsed : nil
        }
        if !consent {
            destinationParts.queryItems = destinationParts.queryItems?.filter { $0.name != "qg_click_id" }
            if destinationParts.queryItems?.isEmpty == true { destinationParts.queryItems = nil }
            guard let clean = destinationParts.url else { throw RedirectError.invalidResponse }
            target = clean
        }
        let navigation: RedirectNavigation = mode == "navigate" && target.scheme == "https" && (target.port == nil || target.port == 443) && contentHosts.contains(target.host?.lowercased() ?? "")
            ? .app(target) : .browser(target)
        return RedirectResolution(canonicalURL: canonical, destination: target,
                                  statusCode: code.intValue, clickID: clickID, navigation: navigation)
    }

    private static func decodedPath(_ url: URL) -> String {
        let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath.removingPercentEncoding ?? ""
        return path.isEmpty ? "/" : path
    }

    private static func publicURL(_ raw: String, maximum: Int, https: Bool = false) -> URL? {
        guard !raw.isEmpty, raw.utf16.count <= maximum,
              raw.rangeOfCharacter(from: .whitespacesAndNewlines) == nil, !raw.contains("\\"),
              let url = URL(string: raw), url.absoluteString.utf16.count <= maximum,
              let scheme = url.scheme, ["http", "https"].contains(scheme), !https || scheme == "https",
              url.user == nil, url.password == nil, (0...65535).contains(url.port ?? 0), !https || url.port == nil || url.port == 443,
              let host = url.host?.lowercased(), host.contains("."), !host.hasSuffix("."),
              host.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil,
              !["localhost", "local", "internal", "home", "test", "invalid", "example"].contains(host.components(separatedBy: ".").last ?? "")
        else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.allSatisfy({ !$0.isEmpty && $0.count <= 63 && $0.first != "-" && $0.last != "-" }) else { return nil }
        if labels.allSatisfy({ $0.allSatisfy(\.isNumber) || $0.hasPrefix("0x") }) {
            guard labels.count == 4,
                  labels.allSatisfy({ $0.count == 1 || $0.first != "0" }),
                  let a = Int(labels[0]), let b = Int(labels[1]),
                  labels.allSatisfy({ Int($0).map { (0...255).contains($0) } == true }),
                  a != 0, a != 10, a != 127, a < 224,
                  !(a == 169 && b == 254), !(a == 172 && (16...31).contains(b)),
                  !(a == 192 && b == 168), !(a == 100 && (64...127).contains(b))
            else { return nil }
        }
        return url
    }
}

private final class RefuseRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
