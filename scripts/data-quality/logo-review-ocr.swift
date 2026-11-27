import Foundation
import Vision
import ImageIO

// JSONL worker: no network, no credentials, only local logo previews.
while let line = readLine() {
  do {
    guard let data=line.data(using:.utf8),let input=try JSONSerialization.jsonObject(with:data) as? [String:String],let path=input["path"] else { continue }
    let request=VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.automaticallyDetectsLanguage = true
    try VNImageRequestHandler(url:URL(fileURLWithPath:path),options:[:]).perform([request])
    let words=(request.results ?? []).compactMap { item -> [String:Any]? in
      guard let candidate=item.topCandidates(1).first else {return nil}
      return ["text":candidate.string,"confidence":candidate.confidence]
    }
    let output:[String:Any]=["id":input["id"] ?? "","words":words]
    print(String(data:try JSONSerialization.data(withJSONObject:output),encoding:.utf8)!)
  } catch {
    print("{\"error\":\"ocr_unavailable\",\"words\":[]}")
  }
  fflush(stdout)
}
