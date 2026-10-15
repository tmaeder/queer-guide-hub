// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "QueerGuideRedirects",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "QueerGuideRedirects", targets: ["QueerGuideRedirects"])],
    targets: [
        .target(name: "QueerGuideRedirects")
    ]
)
