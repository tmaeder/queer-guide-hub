import Foundation
import Darwin

public enum RedirectHandoffStoreError: Error, Equatable, Sendable {
    case unavailable
    case invalidState
    case receiptAlreadyStored
    case alreadyAttempted
}

/// One bounded receipt per app binding in an entitled iOS App Group. The Clip
/// stores its unconsumed receipt; the full app resumes through the live client.
/// No passwords, destinations, identity or device identifiers are persisted.
public struct RedirectAppGroupHandoffStore: Sendable {
    private let directory: URL
    private let appBindingID: UUID
    private let shortHosts: Set<String>
    private var stateURL: URL { directory.appendingPathComponent("receipt.json") }

    public init(appGroupID: String, appBindingID: UUID, shortHosts: Set<String>,
                attributionConsent: Bool = false) throws {
        guard attributionConsent else { throw RedirectError.consentRequired }
        guard appGroupID.utf8.count <= 255,
              appGroupID.range(of: "^group\\.[A-Za-z0-9][A-Za-z0-9.-]*$", options: .regularExpression) != nil
        else { throw RedirectError.invalidConfiguration }
        #if os(iOS)
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
        else { throw RedirectHandoffStoreError.unavailable }
        try self.init(container: container, appBindingID: appBindingID, shortHosts: shortHosts)
        #else
        // A macOS command-line fixture cannot establish an iOS entitlement.
        throw RedirectHandoffStoreError.unavailable
        #endif
    }

    // Module-only filesystem seam; never substitutes for signed App Group proof.
    init(container: URL, appBindingID: UUID, shortHosts: Set<String>) throws {
        _ = try RedirectClient(shortHosts: shortHosts, contentHosts: [])
        self.directory = container.appendingPathComponent("QueerGuideRedirectHandoffs", isDirectory: true)
            .appendingPathComponent(appBindingID.uuidString.lowercased(), isDirectory: true)
        self.appBindingID = appBindingID
        self.shortHosts = Set(shortHosts.map { $0.lowercased() })
    }

    /// Re-saving cannot reset an attempted receipt or overwrite a live receipt.
    public func store(_ receipt: RedirectHandoffReceipt, attributionConsent: Bool = false) throws {
        guard attributionConsent else { throw RedirectError.consentRequired }
        try validate(receipt)
        try locked {
            if let current = try read() {
                guard sameReceipt(current.receipt, receipt) && current.status == "pending"
                else { throw RedirectHandoffStoreError.receiptAlreadyStored }
                return
            }
            try write(Record(status: "pending", receipt: receipt))
        }
    }

    /// Claims durably before any network call. An error/unknown result remains
    /// attempted across process restarts. There is no automatic retry.
    public func resumeAutomatically(using client: RedirectClient, password: String? = nil,
                                    attributionConsent: Bool = false) async throws -> RedirectResolution? {
        try await resume(using: client, password: password, consent: attributionConsent, explicitRetry: false)
    }

    /// Call only from a fresh user action after presenting the uncertain outcome.
    public func retryAfterUserAction(using client: RedirectClient, password: String? = nil,
                                     attributionConsent: Bool = false) async throws -> RedirectResolution? {
        try await resume(using: client, password: password, consent: attributionConsent, explicitRetry: true)
    }

    /// Call when attribution consent is withdrawn. Creates no receipt/network call.
    public func clear() throws {
        try locked { try removeState() }
    }

    private func resume(using client: RedirectClient, password: String?, consent: Bool,
                        explicitRetry: Bool) async throws -> RedirectResolution? {
        guard consent else {
            try clear()
            throw RedirectError.consentRequired
        }
        let receipt: RedirectHandoffReceipt? = try locked {
            guard var record = try read() else { return nil }
            guard record.status != "consumed" else { return nil }
            guard record.status == "pending" || explicitRetry
            else { throw RedirectHandoffStoreError.alreadyAttempted }
            guard let receipt = record.receipt else { throw RedirectHandoffStoreError.invalidState }
            record.status = "attempted"
            try write(record)
            return receipt
        }
        guard let receipt else { return nil }
        let resolution = try await client.resumeHandoff(receipt, password: password, attributionConsent: true)
        let retainedConsent = try locked {
            // Withdrawal during the request must not recreate data or deliver navigation.
            guard let current = try read(), sameReceipt(current.receipt, receipt) else { return false }
            try write(Record(status: "consumed", receipt: nil, expiry: receipt.expiresAt))
            return true
        }
        guard retainedConsent else { throw RedirectError.consentRequired }
        return resolution
    }

    private struct Record {
        var status: String
        let receipt: RedirectHandoffReceipt?
        let expiry: Date
        init(status: String, receipt: RedirectHandoffReceipt?, expiry: Date? = nil) {
            self.status = status
            self.receipt = receipt
            self.expiry = expiry ?? receipt!.expiresAt
        }
    }

    private func sameReceipt(_ stored: RedirectHandoffReceipt?, _ receipt: RedirectHandoffReceipt) -> Bool {
        guard let stored else { return false }
        // Unix/Date epoch conversion can round sub-microsecond precision in JSON.
        return stored.token == receipt.token && stored.canonicalURL == receipt.canonicalURL
            && stored.appBindingID == receipt.appBindingID
            && abs(stored.expiresAt.timeIntervalSince(receipt.expiresAt)) < 0.000001
    }

    private func validate(_ receipt: RedirectHandoffReceipt) throws {
        guard receipt.appBindingID == appBindingID,
              shortHosts.contains(receipt.canonicalURL.host?.lowercased() ?? "")
        else { throw RedirectError.invalidHandoff }
        _ = try RedirectHandoffReceipt(canonicalURL: receipt.canonicalURL, appBindingID: appBindingID,
                                      token: receipt.token, expiresAt: receipt.expiresAt)
    }

    private func read() throws -> Record? {
        guard FileManager.default.fileExists(atPath: stateURL.path) else { return nil }
        let values = try stateURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              (values.fileSize ?? 65537) <= 8192,
              let value = try JSONSerialization.jsonObject(with: Data(contentsOf: stateURL)) as? [String: Any],
              value["purpose"] as? String == "redirect-attribution-v1",
              value["app"] as? String == appBindingID.uuidString.lowercased(),
              let expiry = value["expires"] as? Double, expiry.isFinite,
              let status = value["status"] as? String, ["pending", "attempted", "consumed"].contains(status)
        else { throw RedirectHandoffStoreError.invalidState }
        let date = Date(timeIntervalSince1970: expiry)
        if date <= Date() { try removeState(); return nil }
        guard date.timeIntervalSinceNow <= 86401 else { throw RedirectHandoffStoreError.invalidState }
        let base: Set<String> = ["purpose", "app", "expires", "status"]
        if status == "consumed" {
            guard Set(value.keys) == base else { throw RedirectHandoffStoreError.invalidState }
            return Record(status: status, receipt: nil, expiry: date)
        }
        guard Set(value.keys) == base.union(["source", "token"]),
              let source = value["source"] as? String, let url = URL(string: source),
              let token = value["token"] as? String
        else { throw RedirectHandoffStoreError.invalidState }
        let receipt = try RedirectHandoffReceipt(canonicalURL: url, appBindingID: appBindingID,
                                                 token: token, expiresAt: date)
        try validate(receipt)
        return Record(status: status, receipt: receipt)
    }

    private func write(_ record: Record) throws {
        var object: [String: Any] = ["purpose": "redirect-attribution-v1", "app": appBindingID.uuidString.lowercased(),
            "expires": record.expiry.timeIntervalSince1970, "status": record.status]
        if let receipt = record.receipt { object["source"] = receipt.canonicalURL.absoluteString; object["token"] = receipt.token }
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard data.count <= 8192 else { throw RedirectHandoffStoreError.invalidState }
        #if os(iOS)
        try data.write(to: stateURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: stateURL, options: .atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: stateURL.path)
        var url = stateURL, values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        try synchronize(stateURL)
        try synchronize(directory)
    }

    private func removeState() throws {
        if FileManager.default.fileExists(atPath: stateURL.path) {
            try FileManager.default.removeItem(at: stateURL)
            try synchronize(directory)
        }
    }

    private func synchronize(_ url: URL) throws {
        let descriptor = open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw RedirectHandoffStoreError.unavailable }
        defer { Darwin.close(descriptor) }
        guard fsync(descriptor) == 0 else { throw RedirectHandoffStoreError.unavailable }
    }

    private func locked<T>(_ action: () throws -> T) throws -> T {
        let manager = FileManager.default
        do {
            try manager.createDirectory(at: directory, withIntermediateDirectories: true,
                                        attributes: [.posixPermissions: 0o700])
            let attrs = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard attrs.isDirectory == true, attrs.isSymbolicLink != true else { throw RedirectHandoffStoreError.unavailable }
            var url = directory, values = URLResourceValues()
            values.isExcludedFromBackup = true
            try url.setResourceValues(values)
            #if os(iOS)
            try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
            #endif
            let descriptor = open(directory.appendingPathComponent("receipt.lock").path,
                                  O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
            guard descriptor >= 0 else { throw RedirectHandoffStoreError.unavailable }
            defer { Darwin.close(descriptor) }
            var result: Int32
            repeat { result = flock(descriptor, LOCK_EX) } while result != 0 && errno == EINTR
            guard result == 0 else { throw RedirectHandoffStoreError.unavailable }
            defer { _ = flock(descriptor, LOCK_UN) }
            return try action()
        } catch let error as RedirectError { throw error }
        catch let error as RedirectHandoffStoreError { throw error }
        catch { throw RedirectHandoffStoreError.unavailable }
    }
}
